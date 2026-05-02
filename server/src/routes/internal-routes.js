const { processLocationUpdate } = require('../services/shipment-service')

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

        const result = await processLocationUpdate(app, {
            truckId: Number(payload.truckId),
            lat: Number(payload.lat),
            lng: Number(payload.lng),
            speed: Number(payload.speed),
            timestamp: Number(payload.timestamp)
        })

        return result
    })
}

module.exports = internalRoutes
