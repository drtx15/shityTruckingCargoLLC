const { CheckpointType, ShipmentStatus, TruckStatus } = require('@prisma/client')
const { haversineKm, estimateEtaMinutes, remainingRouteDistanceKm } = require('../utils/geo')
const { emitShipmentWebhook } = require('./webhook-service')
const { etaBreachesSla, getStoppedGraceMinutes } = require('./sla-service')
const { publishTrackingEvent, readTrackingSnapshot, writeTrackingSnapshot } = require('./tracking-snapshot-service')

const ARRIVAL_THRESHOLD_KM = 0.2
const IN_TRANSIT_CHECKPOINT_INTERVAL_MS = 45 * 1000
const ETA_MIN_MOVING_SPEED_KPH = 90
const ETA_MAX_SPEED_KPH = 180
const ETA_RECENT_SAMPLE_SIZE = 20
const HOS_EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000
const HOS_BREAK_RESET_MINUTES = 30
const HOS_DAILY_REST_MINUTES = 10 * 60
const HOS_RESTART_MINUTES = 34 * 60
const HOS_DRIVING_LIMIT_MINUTES = 11 * 60
const HOS_SHIFT_LIMIT_MINUTES = 14 * 60
const HOS_BREAK_LIMIT_MINUTES = 8 * 60
const HOS_WEEKLY_LIMIT_MINUTES = 70 * 60
const config = require('../config')

function mapTruckStatus(state, speed) {
    if (state === 'MOVING' || speed > 0) {
        return TruckStatus.MOVING
    }

    if (state === 'IDLE') {
        return TruckStatus.IDLE
    }

    if (state === 'STOPPED' || state === 'DELAYED') {
        return TruckStatus.REST
    }

    return TruckStatus.ASSIGNED
}

function shouldMoveShipmentToTransit(currentStatus, eventType, state, speed) {
    if (currentStatus !== ShipmentStatus.ASSIGNED) {
        return false
    }

    if (eventType === 'RESUMED' || eventType === 'LOCATION_UPDATE') {
        return state === 'MOVING' || speed > 0
    }

    return state === 'MOVING' || speed > 0
}

async function estimateOperatingSpeedKph(prisma, truckId, currentSpeed) {
    const speed = Number(currentSpeed)

    if (!Number.isFinite(speed) || speed <= 1) {
        return null
    }

    const recentTelemetry = await prisma.telemetryEvent.findMany({
        where: {
            truckId,
            speed: { gt: 1 }
        },
        orderBy: { eventTimestamp: 'desc' },
        take: ETA_RECENT_SAMPLE_SIZE,
        select: { speed: true }
    })

    const samples = recentTelemetry
        .map((event) => Number(event.speed))
        .filter((value) => Number.isFinite(value) && value > 1)

    const averageSpeed = samples.length
        ? samples.reduce((sum, value) => sum + value, 0) / samples.length
        : speed

    return Math.min(
        ETA_MAX_SPEED_KPH,
        Math.max(ETA_MIN_MOVING_SPEED_KPH, averageSpeed, speed)
    )
}

function minutesBetween(left, right) {
    return Math.max(0, (new Date(right).getTime() - new Date(left).getTime()) / 60000)
}

async function getHosState(prisma, truckId, now = new Date()) {
    const windowStart = new Date(now.getTime() - HOS_EIGHT_DAYS_MS)
    const events = await prisma.telemetryEvent.findMany({
        where: {
            truckId,
            eventTimestamp: { gte: windowStart }
        },
        orderBy: { eventTimestamp: 'asc' },
        select: {
            speed: true,
            eventTimestamp: true
        }
    })

    let rollingOnDutyMinutes = 0
    let drivingSinceDailyRestMinutes = 0
    let continuousDrivingMinutes = 0
    let shiftStartTime = null
    let previousDrivingEvent = null

    for (const event of events) {
        const speed = Number(event.speed)
        if (!Number.isFinite(speed) || speed <= 1) {
            continue
        }

        const eventTime = new Date(event.eventTimestamp)
        if (!previousDrivingEvent) {
            shiftStartTime = eventTime
            previousDrivingEvent = eventTime
            continue
        }

        const gapMinutes = minutesBetween(previousDrivingEvent, eventTime)

        if (gapMinutes >= HOS_RESTART_MINUTES) {
            rollingOnDutyMinutes = 0
            drivingSinceDailyRestMinutes = 0
            continuousDrivingMinutes = 0
            shiftStartTime = eventTime
        } else if (gapMinutes >= HOS_DAILY_REST_MINUTES) {
            drivingSinceDailyRestMinutes = 0
            continuousDrivingMinutes = 0
            shiftStartTime = eventTime
        } else if (gapMinutes >= HOS_BREAK_RESET_MINUTES) {
            continuousDrivingMinutes = 0
        } else {
            rollingOnDutyMinutes += gapMinutes
            drivingSinceDailyRestMinutes += gapMinutes
            continuousDrivingMinutes += gapMinutes
        }

        previousDrivingEvent = eventTime
    }

    return {
        rollingOnDutyMinutes,
        drivingSinceDailyRestMinutes,
        continuousDrivingMinutes,
        shiftElapsedMinutes: shiftStartTime ? minutesBetween(shiftStartTime, now) : 0
    }
}

function applyHosToEtaMinutes(baseDriveMinutes, hosState) {
    let remainingDriveMinutes = Math.max(0, Number(baseDriveMinutes) || 0)
    let elapsedMinutes = 0
    let rollingOnDutyMinutes = hosState.rollingOnDutyMinutes || 0
    let drivingSinceDailyRestMinutes = hosState.drivingSinceDailyRestMinutes || 0
    let continuousDrivingMinutes = hosState.continuousDrivingMinutes || 0
    let shiftElapsedMinutes = hosState.shiftElapsedMinutes || 0

    while (remainingDriveMinutes > 0) {
        const drivingAvailable = HOS_DRIVING_LIMIT_MINUTES - drivingSinceDailyRestMinutes
        const shiftAvailable = HOS_SHIFT_LIMIT_MINUTES - shiftElapsedMinutes
        const breakAvailable = HOS_BREAK_LIMIT_MINUTES - continuousDrivingMinutes
        const weeklyAvailable = HOS_WEEKLY_LIMIT_MINUTES - rollingOnDutyMinutes

        if (weeklyAvailable <= 0) {
            elapsedMinutes += HOS_RESTART_MINUTES
            rollingOnDutyMinutes = 0
            drivingSinceDailyRestMinutes = 0
            continuousDrivingMinutes = 0
            shiftElapsedMinutes = 0
            continue
        }

        if (drivingAvailable <= 0 || shiftAvailable <= 0) {
            elapsedMinutes += HOS_DAILY_REST_MINUTES
            drivingSinceDailyRestMinutes = 0
            continuousDrivingMinutes = 0
            shiftElapsedMinutes = 0
            continue
        }

        if (breakAvailable <= 0) {
            elapsedMinutes += HOS_BREAK_RESET_MINUTES
            shiftElapsedMinutes += HOS_BREAK_RESET_MINUTES
            continuousDrivingMinutes = 0
            continue
        }

        const driveBlockMinutes = Math.min(
            remainingDriveMinutes,
            drivingAvailable,
            shiftAvailable,
            breakAvailable,
            weeklyAvailable
        )

        if (driveBlockMinutes <= 0) {
            elapsedMinutes += HOS_DAILY_REST_MINUTES
            drivingSinceDailyRestMinutes = 0
            continuousDrivingMinutes = 0
            shiftElapsedMinutes = 0
            continue
        }

        remainingDriveMinutes -= driveBlockMinutes
        elapsedMinutes += driveBlockMinutes
        rollingOnDutyMinutes += driveBlockMinutes
        drivingSinceDailyRestMinutes += driveBlockMinutes
        continuousDrivingMinutes += driveBlockMinutes
        shiftElapsedMinutes += driveBlockMinutes
    }

    return Math.ceil(elapsedMinutes)
}

async function estimateHosAwareEtaMinutes(prisma, truckId, distanceKm, speedKph) {
    const baseEtaMinutes = estimateEtaMinutes(distanceKm, speedKph)
    if (!baseEtaMinutes) {
        return null
    }

    const hosState = await getHosState(prisma, truckId)
    return applyHosToEtaMinutes(baseEtaMinutes, hosState)
}

async function emitShipmentStatus(app, shipment, previousStatus) {
    if (shipment.status === previousStatus) {
        return
    }

    const eventByStatus = {
        ASSIGNED: 'shipment.assigned',
        IN_TRANSIT: 'shipment.departed',
        DELAYED: 'shipment.delayed',
        ARRIVED: 'shipment.arrived'
    }
    const eventType = eventByStatus[shipment.status] || 'shipment.status.changed'
    await emitShipmentWebhook(app, eventType, shipment, { previousStatus, newStatus: shipment.status })
}

async function createCheckpointIfDue(prisma, shipmentId, lat, lng) {
    const lastInTransit = await prisma.checkpoint.findFirst({
        where: {
            shipmentId,
            type: CheckpointType.IN_TRANSIT
        },
        orderBy: {
            timestamp: 'desc'
        }
    })

    if (!lastInTransit) {
        await prisma.checkpoint.create({
            data: {
                shipmentId,
                type: CheckpointType.IN_TRANSIT,
                lat,
                lng
            }
        })
        return
    }

    const elapsed = Date.now() - new Date(lastInTransit.timestamp).getTime()
    if (elapsed >= IN_TRANSIT_CHECKPOINT_INTERVAL_MS) {
        await prisma.checkpoint.create({
            data: {
                shipmentId,
                type: CheckpointType.IN_TRANSIT,
                lat,
                lng
            }
        })
    }
}

async function assignTruckToShipment(app, shipmentId, truckId) {
    const { prisma } = app
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } })
    if (!shipment) {
        throw new Error('Shipment not found')
    }

    if (shipment.status === ShipmentStatus.ARRIVED) {
        throw new Error('Shipment already arrived')
    }

    const truck = await prisma.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
        throw new Error('Truck not found')
    }

    if (shipment.assignedTruckId && shipment.assignedTruckId !== truck.id) {
        await prisma.truck.update({
            where: { id: shipment.assignedTruckId },
            data: { status: TruckStatus.IDLE }
        })
    }

    if (truck.status !== TruckStatus.IDLE && shipment.assignedTruckId !== truck.id) {
        throw new Error('Truck is not available')
    }

    if ((truck.maxWeightKg || 0) < (shipment.weightKg || 0)) {
        throw new Error('Truck capacity is lower than shipment weight')
    }

    const previousStatus = shipment.status
    const nextStatus = shipment.status === ShipmentStatus.PENDING
        ? ShipmentStatus.ASSIGNED
        : shipment.status

    const updatedShipment = await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
            assignedTruckId: truck.id,
            status: nextStatus
        }
    })

    await prisma.truck.update({
        where: { id: truck.id },
        data: {
            status: TruckStatus.ASSIGNED,
            currentLoadKg: shipment.weightKg || 0
        }
    })

    await prisma.checkpoint.create({
        data: {
            shipmentId: shipment.id,
            type: CheckpointType.ASSIGNED,
            lat: shipment.originLat,
            lng: shipment.originLng
        }
    })

    await emitShipmentStatus(app, updatedShipment, previousStatus)
    await publishTrackingEvent(app, await getTrackingByShipmentId(app, shipment.id), 'shipment.status.changed')

    return updatedShipment
}

async function recalculateShipmentEta(prisma, shipment) {
    if (!shipment.assignedTruckId) {
        return {
            etaMinutes: null,
            estimatedAt: null
        }
    }

    const truck = await prisma.truck.findUnique({
        where: { id: shipment.assignedTruckId }
    })

    if (!truck || truck.currentLat === null || truck.currentLat === undefined || truck.currentLng === null || truck.currentLng === undefined) {
        return {
            etaMinutes: shipment.etaMinutes,
            estimatedAt: shipment.estimatedAt
        }
    }

    const speed = await estimateOperatingSpeedKph(prisma, truck.id, truck.currentSpeed)
    const distanceToDestination = remainingRouteDistanceKm(
        shipment.routePolyline,
        truck.currentLat,
        truck.currentLng
    ) ?? haversineKm(
        truck.currentLat,
        truck.currentLng,
        shipment.destinationLat,
        shipment.destinationLng
    )

    const etaMinutes = await estimateHosAwareEtaMinutes(prisma, truck.id, distanceToDestination, speed)
    return {
        etaMinutes,
        estimatedAt: etaMinutes ? new Date(Date.now() + etaMinutes * 60 * 1000) : null
    }
}

async function setShipmentPaused(app, shipmentId, paused) {
    const { prisma } = app
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } })

    if (!shipment) {
        throw new Error('Shipment not found')
    }

    return prisma.shipment.update({
        where: { id: shipment.id },
        data: {
            isPaused: paused
        }
    })
}

async function processLocationUpdate(app, payload) {
    const {
        truckId,
        lat,
        lng,
        speed,
        timestamp,
        eventType = null,
        state = null,
        reason = null,
        heading = null,
        accuracy = null
    } = payload
    const eventTime = new Date(timestamp * 1000)
    const truckStatus = mapTruckStatus(state, speed)

    const telemetryEvent = await app.prisma.telemetryEvent.create({
        data: {
            truckId,
            lat,
            lng,
            speed,
            heading,
            accuracy,
            eventType,
            state,
            reason,
            eventTimestamp: eventTime,
            processingState: 'PENDING'
        }
    })

    const truck = await app.prisma.truck.update({
        where: { id: truckId },
        data: {
            currentLat: lat,
            currentLng: lng,
            currentSpeed: speed,
            lastUpdatedAt: eventTime,
            status: truckStatus
        }
    })

    const shipment = await app.prisma.shipment.findFirst({
        where: {
            assignedTruckId: truck.id,
            status: { in: [ShipmentStatus.ASSIGNED, ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELAYED] }
        },
        orderBy: { createdAt: 'desc' }
    })

    if (!shipment) {
        await app.prisma.telemetryEvent.update({
            where: { id: telemetryEvent.id },
            data: { processingState: 'PROCESSED', processedAt: new Date() }
        })
        return { acknowledged: true, shipmentUpdated: false }
    }

    if (shipment.isPaused) {
        await app.prisma.telemetryEvent.update({
            where: { id: telemetryEvent.id },
            data: {
                shipmentId: shipment.id,
                processingState: 'PROCESSED',
                processedAt: new Date()
            }
        })
        return { acknowledged: true, shipmentUpdated: false, paused: true }
    }

    const distanceToDestination = remainingRouteDistanceKm(
        shipment.routePolyline,
        lat,
        lng
    ) ?? haversineKm(
        lat,
        lng,
        shipment.destinationLat,
        shipment.destinationLng
    )
    const etaSpeedKph = await estimateOperatingSpeedKph(app.prisma, truck.id, speed)
    const etaMinutes = await estimateHosAwareEtaMinutes(app.prisma, truck.id, distanceToDestination, etaSpeedKph)

    let nextStatus = shipment.status
    const previousStatus = shipment.status

    if (shouldMoveShipmentToTransit(shipment.status, eventType, state, speed)) {
        nextStatus = ShipmentStatus.IN_TRANSIT
        const existingDeparted = await app.prisma.checkpoint.findFirst({
            where: { shipmentId: shipment.id, type: CheckpointType.DEPARTED }
        })

        if (!existingDeparted) {
            await app.prisma.checkpoint.create({
                data: {
                    shipmentId: shipment.id,
                    type: CheckpointType.DEPARTED,
                    lat,
                    lng,
                    timestamp: eventTime
                }
            })
        }
    }

    if (distanceToDestination <= ARRIVAL_THRESHOLD_KM) {
        nextStatus = ShipmentStatus.ARRIVED
    }

    const patch = {
        status: nextStatus,
        etaMinutes,
        estimatedAt: etaMinutes ? new Date(Date.now() + etaMinutes * 60 * 1000) : null
    }

    const estimatedAt = etaMinutes ? new Date(Date.now() + etaMinutes * 60 * 1000) : null
    const stoppedTooLong = speed <= 1 && shipment.status === ShipmentStatus.IN_TRANSIT
    const etaLate = etaBreachesSla(estimatedAt, shipment.slaDeadline)

    if (
        nextStatus !== ShipmentStatus.ARRIVED &&
        shipment.status !== ShipmentStatus.DELAYED &&
        (etaLate || (stoppedTooLong && getStoppedGraceMinutes(shipment.priority) <= config.delayStoppedMinutes))
    ) {
        nextStatus = ShipmentStatus.DELAYED
        patch.status = nextStatus
        patch.delayReason = etaLate ? 'ETA exceeds shipment SLA' : 'Truck has stopped beyond priority grace period'
        patch.delayedAt = new Date()
    }

    if (nextStatus === ShipmentStatus.ARRIVED) {
        patch.status = nextStatus
        patch.etaMinutes = 0
        patch.estimatedAt = new Date()
    }

    const updatedShipment = await app.prisma.shipment.update({
        where: { id: shipment.id },
        data: patch
    })

    if (shipment.etaMinutes !== etaMinutes || previousStatus !== updatedShipment.status) {
        await app.prisma.etaHistory.create({
            data: {
                shipmentId: shipment.id,
                previousEtaMinutes: shipment.etaMinutes,
                newEtaMinutes: updatedShipment.etaMinutes,
                remainingDistanceKm: distanceToDestination,
                speedKph: etaSpeedKph || speed,
                reason: previousStatus !== updatedShipment.status
                    ? `status:${previousStatus}->${updatedShipment.status}`
                    : 'telemetry.recalculated'
            }
        })
    }

    if (updatedShipment.status === ShipmentStatus.IN_TRANSIT) {
        await createCheckpointIfDue(app.prisma, shipment.id, lat, lng)
    }

    if (updatedShipment.status === ShipmentStatus.DELAYED && previousStatus !== ShipmentStatus.DELAYED) {
        await app.prisma.checkpoint.create({
            data: {
                shipmentId: shipment.id,
                type: CheckpointType.DELAYED,
                lat,
                lng,
                timestamp: eventTime
            }
        })
    }

    if (updatedShipment.status === ShipmentStatus.ARRIVED) {
        const existingArrived = await app.prisma.checkpoint.findFirst({
            where: { shipmentId: shipment.id, type: CheckpointType.ARRIVED }
        })

        if (!existingArrived) {
            await app.prisma.checkpoint.create({
                data: {
                    shipmentId: shipment.id,
                    type: CheckpointType.ARRIVED,
                    lat,
                    lng,
                    timestamp: eventTime
                }
            })
        }

        await app.prisma.truck.update({
            where: { id: truck.id },
            data: {
                status: TruckStatus.IDLE,
                currentLoadKg: 0
            }
        })
    }

    await app.prisma.telemetryEvent.update({
        where: { id: telemetryEvent.id },
        data: {
            shipmentId: shipment.id,
            processingState: 'PROCESSED',
            processedAt: new Date()
        }
    })

    await emitShipmentStatus(app, updatedShipment, previousStatus)
    const tracking = await getTrackingByShipmentId(app, shipment.id, { forceDatabase: true })
    await publishTrackingEvent(
        app,
        tracking,
        updatedShipment.status === ShipmentStatus.DELAYED ? 'shipment.delayed' : 'location.updated'
    )

    return {
        acknowledged: true,
        shipmentUpdated: true,
        shipmentId: updatedShipment.id,
        status: updatedShipment.status,
        etaMinutes: updatedShipment.etaMinutes,
        telemetry: {
            eventType,
            state,
            reason,
            heading,
            accuracy
        }
    }
}

async function getTrackingByShipmentId(appOrPrisma, shipmentId, options = {}) {
    const app = appOrPrisma.prisma ? appOrPrisma : null
    const prisma = app ? app.prisma : appOrPrisma

    if (app && !options.forceDatabase) {
        const cached = await readTrackingSnapshot(app.redis, shipmentId)
        if (cached) {
            return cached
        }
    }

    const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
        include: {
            shipper: {
                select: {
                    id: true,
                    companyName: true,
                    contactEmail: true
                }
            },
            assignedTruck: {
                select: {
                    id: true,
                    label: true,
                    driverName: true,
                    status: true,
                    maxWeightKg: true,
                    currentLoadKg: true,
                    currentLat: true,
                    currentLng: true,
                    currentSpeed: true,
                    lastUpdatedAt: true
                }
            },
            checkpoints: {
                orderBy: { timestamp: 'desc' },
                take: config.trackingCheckpointLimit
            }
        }
    })

    if (!shipment) {
        return shipment
    }

    const routeRemainingKm = shipment.assignedTruck?.currentLat !== null &&
        shipment.assignedTruck?.currentLat !== undefined &&
        shipment.assignedTruck?.currentLng !== null &&
        shipment.assignedTruck?.currentLng !== undefined
        ? remainingRouteDistanceKm(
            shipment.routePolyline,
            shipment.assignedTruck.currentLat,
            shipment.assignedTruck.currentLng
        ) ?? haversineKm(
            shipment.assignedTruck.currentLat,
            shipment.assignedTruck.currentLng,
            shipment.destinationLat,
            shipment.destinationLng
        )
        : null

    const tracking = {
        shipmentId: shipment.id,
        trackingCode: shipment.trackingCode,
        shipper: shipment.shipper,
        status: shipment.status,
        priority: shipment.priority,
        cargoDescription: shipment.cargoDescription,
        weightKg: shipment.weightKg,
        slaDeadline: shipment.slaDeadline,
        deliveryDeadline: shipment.deliveryDeadline,
        delayReason: shipment.delayReason,
        delayedAt: shipment.delayedAt,
        isPaused: shipment.isPaused,
        etaMinutes: shipment.etaMinutes,
        estimatedAt: shipment.estimatedAt,
        routeRemainingKm,
        createdAt: shipment.createdAt,
        updatedAt: shipment.updatedAt,
        originLabel: shipment.originLabel,
        destinationLabel: shipment.destinationLabel,
        route: {
            origin: { lat: shipment.originLat, lng: shipment.originLng },
            destination: { lat: shipment.destinationLat, lng: shipment.destinationLng },
            routePolyline: Array.isArray(shipment.routePolyline) ? shipment.routePolyline : []
        },
        proofOfDelivery: {
            recipientName: shipment.proofRecipientName,
            deliveryNote: shipment.proofDeliveryNote,
            deliveredAt: shipment.proofDeliveredAt,
            referenceUrl: shipment.proofReferenceUrl
        },
        truck: shipment.assignedTruck,
        checkpoints: shipment.checkpoints.slice().reverse()
    }

    if (app) {
        await writeTrackingSnapshot(app.redis, tracking)
    }

    return tracking
}

async function getTrackingByCode(app, trackingCode, options = {}) {
    const shipment = await app.prisma.shipment.findUnique({
        where: { trackingCode },
        select: { id: true }
    })

    if (!shipment) {
        return null
    }

    return getTrackingByShipmentId(app, shipment.id, options)
}

async function suggestTrucksForShipment(app, shipmentId) {
    const shipment = await app.prisma.shipment.findUnique({ where: { id: shipmentId } })
    if (!shipment) {
        throw new Error('Shipment not found')
    }

    const candidates = await app.prisma.truck.findMany({
        where: {
            status: TruckStatus.IDLE,
            maxWeightKg: { gte: shipment.weightKg || 0 }
        },
        orderBy: [{ lastUpdatedAt: 'desc' }, { id: 'asc' }],
        take: 10
    })

    return candidates.map((truck) => {
        const distanceKm = truck.currentLat !== null && truck.currentLat !== undefined && truck.currentLng !== null && truck.currentLng !== undefined
            ? haversineKm(truck.currentLat, truck.currentLng, shipment.originLat, shipment.originLng)
            : null

        return {
            ...truck,
            distanceToOriginKm: distanceKm,
            reason: distanceKm === null
                ? 'Idle and capacity-compatible; no current GPS fix'
                : `Idle, capacity-compatible, ${distanceKm.toFixed(1)} km from origin`
        }
    }).sort((left, right) => {
        if (left.distanceToOriginKm === null) return 1
        if (right.distanceToOriginKm === null) return -1
        return left.distanceToOriginKm - right.distanceToOriginKm
    })
}

async function completeProofOfDelivery(app, shipmentId, payload) {
    const recipientName = typeof payload.recipientName === 'string' ? payload.recipientName.trim() : ''
    if (!recipientName) {
        throw new Error('recipientName is required')
    }

    const shipment = await app.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
            status: ShipmentStatus.ARRIVED,
            proofRecipientName: recipientName,
            proofDeliveryNote: typeof payload.deliveryNote === 'string' ? payload.deliveryNote.trim() : null,
            proofReferenceUrl: typeof payload.referenceUrl === 'string' ? payload.referenceUrl.trim() || null : null,
            proofDeliveredAt: payload.deliveredAt ? new Date(payload.deliveredAt) : new Date(),
            etaMinutes: 0,
            estimatedAt: new Date()
        }
    })

    await app.prisma.checkpoint.create({
        data: {
            shipmentId,
            type: CheckpointType.DELIVERED,
            lat: shipment.destinationLat,
            lng: shipment.destinationLng
        }
    })

    await emitShipmentStatus(app, shipment, ShipmentStatus.IN_TRANSIT)
    await publishTrackingEvent(app, await getTrackingByShipmentId(app, shipmentId, { forceDatabase: true }), 'shipment.arrived')
    return shipment
}

module.exports = {
    assignTruckToShipment,
    processLocationUpdate,
    getTrackingByShipmentId,
    getTrackingByCode,
    setShipmentPaused,
    recalculateShipmentEta,
    suggestTrucksForShipment,
    completeProofOfDelivery
}
