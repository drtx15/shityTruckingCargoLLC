const { CheckpointType, ShipmentStatus, TruckStatus } = require('@prisma/client')
const { haversineKm, estimateEtaMinutes } = require('../utils/geo')
const { sendStatusWebhook } = require('./webhook-service')

const ARRIVAL_THRESHOLD_KM = 0.2
const IN_TRANSIT_CHECKPOINT_INTERVAL_MS = 45 * 1000
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

async function emitShipmentStatus(app, shipment, previousStatus) {
    if (shipment.status === previousStatus) {
        return
    }

    await sendStatusWebhook(app, {
        event: 'shipment.status.changed',
        shipmentId: shipment.id,
        previousStatus,
        newStatus: shipment.status,
        timestamp: new Date().toISOString()
    })
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
            status: TruckStatus.ASSIGNED
        }
    })

    await emitShipmentStatus(app, updatedShipment, previousStatus)

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

    const speed = truck.currentSpeed && truck.currentSpeed > 0 ? truck.currentSpeed : 45
    const distanceToDestination = haversineKm(
        truck.currentLat,
        truck.currentLng,
        shipment.destinationLat,
        shipment.destinationLng
    )

    const etaMinutes = estimateEtaMinutes(distanceToDestination, speed)
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
            status: { in: [ShipmentStatus.ASSIGNED, ShipmentStatus.IN_TRANSIT] }
        },
        orderBy: { createdAt: 'desc' }
    })

    if (!shipment) {
        return { acknowledged: true, shipmentUpdated: false }
    }

    if (shipment.isPaused) {
        return { acknowledged: true, shipmentUpdated: false, paused: true }
    }

    const distanceToDestination = haversineKm(
        lat,
        lng,
        shipment.destinationLat,
        shipment.destinationLng
    )
    const etaMinutes = estimateEtaMinutes(distanceToDestination, speed)

    let nextStatus = shipment.status
    const previousStatus = shipment.status

    if (shouldMoveShipmentToTransit(shipment.status, eventType, state, speed)) {
        nextStatus = ShipmentStatus.IN_TRANSIT
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

    if (distanceToDestination <= ARRIVAL_THRESHOLD_KM) {
        nextStatus = ShipmentStatus.ARRIVED
    }

    const patch = {
        status: nextStatus,
        etaMinutes,
        estimatedAt: etaMinutes ? new Date(Date.now() + etaMinutes * 60 * 1000) : null
    }

    if (nextStatus === ShipmentStatus.ARRIVED) {
        patch.etaMinutes = 0
        patch.estimatedAt = new Date()
    }

    const updatedShipment = await app.prisma.shipment.update({
        where: { id: shipment.id },
        data: patch
    })

    if (updatedShipment.status === ShipmentStatus.IN_TRANSIT) {
        await createCheckpointIfDue(app.prisma, shipment.id, lat, lng)
    }

    if (updatedShipment.status === ShipmentStatus.ARRIVED) {
        await app.prisma.checkpoint.create({
            data: {
                shipmentId: shipment.id,
                type: CheckpointType.ARRIVED,
                lat,
                lng,
                timestamp: eventTime
            }
        })

        await app.prisma.truck.update({
            where: { id: truck.id },
            data: {
                status: TruckStatus.IDLE
            }
        })
    }

    await emitShipmentStatus(app, updatedShipment, previousStatus)

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

async function getTrackingByShipmentId(prisma, shipmentId) {
    const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
        include: {
            assignedTruck: {
                select: {
                    id: true,
                    label: true,
                    status: true,
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

    return {
        ...shipment,
        checkpoints: shipment.checkpoints.slice().reverse()
    }
}

module.exports = {
    assignTruckToShipment,
    processLocationUpdate,
    getTrackingByShipmentId,
    setShipmentPaused,
    recalculateShipmentEta
}
