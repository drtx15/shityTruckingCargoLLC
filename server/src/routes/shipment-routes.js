const {
    assignTruckToShipment,
    completeProofOfDelivery,
    getTrackingByCode,
    getTrackingByShipmentId,
    setShipmentPaused,
    suggestTrucksForShipment
} = require('../services/shipment-service')
const { startSimulation } = require('../services/simulator-service')
const { searchLocations } = require('../services/geocoding-service')
const { planShipmentRoute } = require('../services/route-planner')
const { generateTrackingCode } = require('../services/tracking-code-service')
const { buildSlaDeadline, normalizePriority } = require('../services/sla-service')
const { toPublicTrackingPayload } = require('../services/tracking-snapshot-service')
const {
    ALL_ROLES,
    ROLES,
    SHIPMENT_CREATE_ROLES,
    SHIPMENT_WRITE_ROLES,
    applyCreateShipmentOwnership,
    buildShipmentWhereForUser,
    canReadShipmentRecord,
    roleList
} = require('../services/role-access-service')

function normalizeLocationText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function normalizeRoutePolyline(routePolyline) {
    if (!Array.isArray(routePolyline)) {
        return []
    }

    return routePolyline
        .map((point) => {
            const lat = Number(point?.lat)
            const lng = Number(point?.lng)

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null
            }

            return { lat, lng }
        })
        .filter(Boolean)
}

function buildShipmentCreateData(routePlan, payload = {}) {
    const originLat = Number(routePlan.originLat)
    const originLng = Number(routePlan.originLng)
    const destinationLat = Number(routePlan.destinationLat)
    const destinationLng = Number(routePlan.destinationLng)

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
        throw new Error('Route plan is missing valid origin coordinates')
    }

    if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) {
        throw new Error('Route plan is missing valid destination coordinates')
    }

    const priority = normalizePriority(payload.priority)
    const weightKg = Number(payload.weightKg || payload.weight || 1000)
    const deliveryDeadline = payload.deliveryDeadline ? new Date(payload.deliveryDeadline) : null

    return {
        originLat,
        originLng,
        originLabel: normalizeLocationText(routePlan.originLabel) || null,
        destinationLat,
        destinationLng,
        destinationLabel: normalizeLocationText(routePlan.destinationLabel) || null,
        routePolyline: normalizeRoutePolyline(routePlan.routePolyline),
        shipperId: Number(payload.shipperId) || null,
        priority,
        cargoDescription: normalizeLocationText(payload.cargoDescription) || null,
        weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 1000,
        deliveryDeadline,
        slaDeadline: deliveryDeadline || buildSlaDeadline(priority)
    }
}
async function shipmentRoutes(app) {
    app.get('/locations/search', { preHandler: app.authorize(ALL_ROLES) }, async (request, reply) => {
        const query = normalizeLocationText(request.query?.q)
        const limit = Number(request.query?.limit || 5)

        try {
            return await searchLocations(query, limit)
        } catch (error) {
            app.log.error({ error, query }, 'Location lookup failed')
            return reply.code(502).send({ message: 'Location lookup service is unavailable' })
        }
    })

    app.post('/shipments', { preHandler: app.authorize(roleList(SHIPMENT_CREATE_ROLES)) }, async (request, reply) => {
        const payload = applyCreateShipmentOwnership(request.user, request.body || {})

        if (request.user.role === ROLES.CUSTOMER && !payload.shipperId) {
            return reply.code(403).send({ message: 'Customer account is not linked to a shipper' })
        }

        let routePlan

        try {
            routePlan = await planShipmentRoute(payload)
        } catch (error) {
            return reply.code(400).send({ message: error.message })
        }

        const shipment = await app.prisma.shipment.create({
            data: {
                ...buildShipmentCreateData(routePlan, payload),
                trackingCode: await generateTrackingCode(app.prisma),
                checkpoints: {
                    create: {
                        type: 'CREATED',
                        lat: routePlan.originLat,
                        lng: routePlan.originLng
                    }
                }
            },
            include: {
                shipper: {
                    select: { id: true, companyName: true, contactEmail: true }
                }
            }
        })

        return reply.code(201).send(shipment)
    })

    app.get('/shipments', { preHandler: app.authorize(ALL_ROLES) }, async (request) => {
        return app.prisma.shipment.findMany({
            where: buildShipmentWhereForUser(request.user),
            include: {
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
                shipper: {
                    select: {
                        id: true,
                        companyName: true,
                        contactEmail: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
    })

    app.get('/shipments/:id', { preHandler: app.authorize(ALL_ROLES) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const shipment = await app.prisma.shipment.findFirst({
            where: buildShipmentWhereForUser(request.user, { id: shipmentId }),
            include: {
                shipper: true,
                assignedTruck: true,
                etaHistory: {
                    orderBy: { computedAt: 'desc' },
                    take: 25
                },
                webhookAttempts: {
                    orderBy: { createdAt: 'desc' },
                    take: 25
                },
                checkpoints: {
                    orderBy: { timestamp: 'desc' },
                    take: 100
                }
            }
        })

        if (!shipment) {
            return reply.code(404).send({ message: 'Shipment not found' })
        }

        return {
            ...shipment,
            checkpoints: shipment.checkpoints.slice().reverse()
        }
    })

    app.get('/shipments/:id/route', { preHandler: app.authorize(ALL_ROLES) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const shipment = await app.prisma.shipment.findFirst({
            where: buildShipmentWhereForUser(request.user, { id: shipmentId }),
            select: {
                id: true,
                routePolyline: true
            }
        })

        if (!shipment) {
            return reply.code(404).send({ message: 'Shipment not found' })
        }

        if (!Array.isArray(shipment.routePolyline)) {
            return reply.code(404).send({ message: 'Route not available' })
        }

        return normalizeRoutePolyline(shipment.routePolyline)
    })

    app.patch('/shipments/:id', { preHandler: app.authorize(roleList(SHIPMENT_WRITE_ROLES)) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const payload = request.body || {}

        let routePlan

        try {
            routePlan = await planShipmentRoute(payload)
        } catch (error) {
            return reply.code(400).send({ message: error.message })
        }

        try {
            const shipment = await app.prisma.shipment.update({
                where: { id: shipmentId },
                data: buildShipmentCreateData(routePlan, payload)
            })

            return shipment
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Shipment not found' })
            }

            throw error
        }
    })



    app.post('/shipments/:id/pause', { preHandler: app.authorize([ROLES.DISPATCHER, ROLES.ADMIN]) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)

        try {
            const shipment = await setShipmentPaused(app, shipmentId, true)
            return shipment
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/shipments/:id/resume', { preHandler: app.authorize([ROLES.DISPATCHER, ROLES.ADMIN]) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)

        try {
            const shipment = await setShipmentPaused(app, shipmentId, false)
            return shipment
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/shipments/:id/assign-truck', { preHandler: app.authorize([ROLES.DISPATCHER, ROLES.FLEET_MANAGER, ROLES.ADMIN]) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const truckId = Number(request.body?.truckId)

        if (!truckId) {
            return reply.code(400).send({ message: 'truckId is required' })
        }

        try {
            const shipment = await assignTruckToShipment(app, shipmentId, truckId)
            const truck = await app.prisma.truck.findUnique({ where: { id: truckId } })
            const simulator = await startSimulation(app, shipment, truck)

            return {
                shipment,
                simulator
            }
        } catch (error) {
            if (error.message.includes('not found')) {
                return reply.code(404).send({ message: error.message })
            }
            return reply.code(400).send({ message: error.message })
        }
    })

    app.get('/shipments/:id/truck-suggestions', { preHandler: app.authorize([ROLES.DISPATCHER, ROLES.FLEET_MANAGER, ROLES.ADMIN]) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)

        try {
            return await suggestTrucksForShipment(app, shipmentId)
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/shipments/:id/proof-of-delivery', { preHandler: app.authorize([ROLES.DRIVER, ROLES.DISPATCHER, ROLES.ADMIN]) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const shipmentRecord = await app.prisma.shipment.findUnique({
            where: { id: shipmentId },
            select: { id: true, shipperId: true, assignedTruckId: true }
        })

        if (!canReadShipmentRecord(request.user, shipmentRecord)) {
            return reply.code(shipmentRecord ? 403 : 404).send({ message: shipmentRecord ? 'Forbidden' : 'Shipment not found' })
        }

        try {
            return await completeProofOfDelivery(app, shipmentId, request.body || {})
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })
    app.delete('/shipments/:id', { preHandler: app.authorize([ROLES.BROKER, ROLES.ADMIN]) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)

        try {
            await app.prisma.shipment.delete({ where: { id: shipmentId } })
            return reply.code(204).send()
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Shipment not found' })
            }

            throw error
        }
    })

    app.get('/tracking/:id', { preHandler: app.authorize(ALL_ROLES) }, async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const allowed = await app.rateLimit(request, reply, { scope: 'tracking' })
        if (!allowed) {
            return
        }
        const shipment = await getTrackingByShipmentId(app, shipmentId)
        if (!shipment) {
            return reply.code(404).send({ message: 'Shipment not found' })
        }

        const shipmentRecord = {
            shipperId: shipment.shipper?.id,
            assignedTruckId: shipment.truck?.id
        }

        if (!canReadShipmentRecord(request.user, shipmentRecord)) {
            return reply.code(403).send({ message: 'Forbidden' })
        }

        return shipment
    })

    app.get('/tracking/code/:trackingCode', async (request, reply) => {
        const allowed = await app.rateLimit(request, reply, { scope: 'public-tracking', capacity: 80, refillPerMinute: 80 })
        if (!allowed) {
            return
        }

        const trackingCode = normalizeLocationText(request.params.trackingCode).toUpperCase()
        const shipment = await getTrackingByCode(app, trackingCode)

        if (!shipment) {
            return reply.code(404).send({ message: 'Shipment not found' })
        }

        return toPublicTrackingPayload(shipment)
    })
}

module.exports = shipmentRoutes
