const { enqueueTelemetry } = require('../services/telemetry-queue-service')

function toNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

async function internalRoutes(app) {
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
