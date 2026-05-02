const {
    assignTruckToShipment,
    getTrackingByShipmentId,
    setShipmentPaused,
    updateShipmentDestination
} = require('../services/shipment-service')
const { startSimulation } = require('../services/simulator-service')
const { searchLocations } = require('../services/geocoding-service')
const { planShipmentRoute } = require('../services/route-planner')
const config = require('../config')

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

function simplifyRoutePolyline(routePolyline, maxPoints = config.trackingRouteMaxPoints) {
    if (!Array.isArray(routePolyline) || routePolyline.length <= maxPoints) {
        return routePolyline || []
    }

    const stride = Math.ceil(routePolyline.length / maxPoints)
    const simplified = routePolyline.filter((_, index) => index % stride === 0)
    const lastPoint = routePolyline[routePolyline.length - 1]

    if (simplified[simplified.length - 1] !== lastPoint) {
        simplified.push(lastPoint)
    }

    return simplified
}

function buildShipmentCreateData(routePlan) {
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

    return {
        originLat,
        originLng,
        originLabel: normalizeLocationText(routePlan.originLabel) || null,
        destinationLat,
        destinationLng,
        destinationLabel: normalizeLocationText(routePlan.destinationLabel) || null,
        routePolyline: normalizeRoutePolyline(routePlan.routePolyline)
    }
}

async function shipmentRoutes(app) {
    app.get('/locations/search', async (request, reply) => {
        const query = normalizeLocationText(request.query?.q)
        const limit = Number(request.query?.limit || 5)

        try {
            return await searchLocations(query, limit)
        } catch (error) {
            app.log.error({ error, query }, 'Location lookup failed')
            return reply.code(502).send({ message: 'Location lookup service is unavailable' })
        }
    })

    app.post('/shipments', async (request, reply) => {
        const payload = request.body || {}

        let routePlan

        try {
            routePlan = await planShipmentRoute(payload)
        } catch (error) {
            return reply.code(400).send({ message: error.message })
        }

        const shipment = await app.prisma.shipment.create({
            data: buildShipmentCreateData(routePlan)
        })

        return reply.code(201).send(shipment)
    })

    app.get('/shipments', async () => {
        return app.prisma.shipment.findMany({
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
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })
    })

    app.get('/shipments/:id', async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const shipment = await app.prisma.shipment.findUnique({
            where: { id: shipmentId },
            include: {
                assignedTruck: true,
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

    app.get('/shipments/:id/route', async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const shipment = await app.prisma.shipment.findUnique({
            where: { id: shipmentId },
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

        return simplifyRoutePolyline(shipment.routePolyline)
    })

    app.patch('/shipments/:id/destination', async (request, reply) => {
        const shipmentId = Number(request.params.id)

        let routePlan

        try {
            routePlan = await planShipmentRoute({
                originLat: request.body?.originLat,
                originLng: request.body?.originLng,
                originLabel: request.body?.originLabel,
                destination: request.body?.destination,
                destinationLat: request.body?.destinationLat,
                destinationLng: request.body?.destinationLng,
                destinationLabel: request.body?.destinationLabel
            })
        } catch (error) {
            return reply.code(400).send({ message: error.message })
        }

        try {
            const shipment = await updateShipmentDestination(app, shipmentId, { routePlan })
            return shipment
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/shipments/:id/pause', async (request, reply) => {
        const shipmentId = Number(request.params.id)

        try {
            const shipment = await setShipmentPaused(app, shipmentId, true)
            return shipment
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/shipments/:id/resume', async (request, reply) => {
        const shipmentId = Number(request.params.id)

        try {
            const shipment = await setShipmentPaused(app, shipmentId, false)
            return shipment
        } catch (error) {
            const statusCode = error.message.includes('not found') ? 404 : 400
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/shipments/:id/assign-truck', async (request, reply) => {
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

    app.get('/tracking/:id', async (request, reply) => {
        const shipmentId = Number(request.params.id)
        const shipment = await getTrackingByShipmentId(app.prisma, shipmentId)

        if (!shipment) {
            return reply.code(404).send({ message: 'Shipment not found' })
        }

        return {
            shipmentId: shipment.id,
            status: shipment.status,
            isPaused: shipment.isPaused,
            etaMinutes: shipment.etaMinutes,
            estimatedAt: shipment.estimatedAt,
            createdAt: shipment.createdAt,
            updatedAt: shipment.updatedAt,
            originLabel: shipment.originLabel,
            destinationLabel: shipment.destinationLabel,
            route: {
                origin: { lat: shipment.originLat, lng: shipment.originLng },
                destination: { lat: shipment.destinationLat, lng: shipment.destinationLng },
                routePolyline: simplifyRoutePolyline(shipment.routePolyline || [])
            },
            truck: shipment.assignedTruck,
            checkpoints: shipment.checkpoints
        }
    })
}

module.exports = shipmentRoutes
