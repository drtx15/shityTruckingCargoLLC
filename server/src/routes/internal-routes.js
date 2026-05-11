const { enqueueTelemetry } = require('../services/telemetry-queue-service')
const config = require('../config')

function getInternalApiKey(request) {
    const header = request.headers['x-internal-api-key']
    if (Array.isArray(header)) {
        return header[0]
    }

    if (typeof header === 'string') {
        return header
    }

    const authorization = request.headers.authorization || ''
    if (authorization.startsWith('Bearer ')) {
        return authorization.slice('Bearer '.length)
    }

    return ''
}

function toNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

async function internalRoutes(app) {
    app.addHook('preHandler', async (request, reply) => {
        if (!config.internalApiKey) {
            return
        }

        if (getInternalApiKey(request) !== config.internalApiKey) {
            return reply.code(401).send({ message: 'Unauthorized internal request' })
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

        return shipment.routePolyline
            .map((point) => {
                const lat = Number(point?.lat)
                const lng = Number(point?.lng)

                if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                    return null
                }

                return { lat, lng }
            })
            .filter(Boolean)
    })

    app.post('/location-update', async (request, reply) => {
        const payload = request.body || {}

        const required = ['truckId', 'lat', 'lng', 'speed', 'timestamp']
        for (const key of required) {
            if (payload[key] === undefined || payload[key] === null) {
                return reply.code(400).send({ message: `${key} is required` })
            }
        }

        const truck = await app.prisma.truck.findUnique({
            where: { id: Number(payload.truckId) }
        })

        if (!truck) {
            return reply.code(404).send({ message: 'Truck not found for update' })
        }

        const lat = toNumber(payload.lat)
        const lng = toNumber(payload.lng)
        const speed = toNumber(payload.speed)
        const timestamp = toNumber(payload.timestamp)

        if (lat === null || lng === null || speed === null || timestamp === null) {
            return reply.code(400).send({ message: 'lat, lng, speed and timestamp must be valid numbers' })
        }

        const result = await enqueueTelemetry(app, {
            truckId: Number(payload.truckId),
            lat,
            lng,
            speed,
            timestamp,
            heading: toNumber(payload.heading),
            accuracy: toNumber(payload.accuracy),
            eventType: typeof payload.eventType === 'string' ? payload.eventType : null,
            state: typeof payload.state === 'string' ? payload.state : null,
            reason: typeof payload.reason === 'string' ? payload.reason : null
        })

        return result
    })
}

module.exports = internalRoutes
