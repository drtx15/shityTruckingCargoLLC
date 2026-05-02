const {
    assignTruckToShipment,
    getTrackingByShipmentId,
    setShipmentPaused,
    updateShipmentDestination
} = require('../services/shipment-service')
const { startSimulation } = require('../services/simulator-service')
const { searchLocations } = require('../services/geocoding-service')
const { planShipmentRoute } = require('../services/route-planner')

function normalizeLocationText(value) {
    return typeof value === 'string' ? value.trim() : ''
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
            data: {
                originLat: routePlan.originLat,
                originLng: routePlan.originLng,
                originLabel: routePlan.originLabel,
                destinationLat: routePlan.destinationLat,
                destinationLng: routePlan.destinationLng,
                destinationLabel: routePlan.destinationLabel,
                routePolyline: routePlan.routePolyline
            }
        })

        return reply.code(201).send(shipment)
    })

    app.get('/shipments', async () => {
        return app.prisma.shipment.findMany({
            include: {
                assignedTruck: true
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
                    orderBy: { timestamp: 'asc' }
                }
            }
        })

        if (!shipment) {
            return reply.code(404).send({ message: 'Shipment not found' })
        }

        return shipment
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

        return shipment.routePolyline
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
                routePolyline: shipment.routePolyline || []
            },
            truck: shipment.assignedTruck,
            checkpoints: shipment.checkpoints
        }
    })
}

module.exports = shipmentRoutes
