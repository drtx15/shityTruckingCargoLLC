const fastify = require('fastify')
const config = require('./config')

const prismaPlugin = require('./plugins/prisma')
const authPlugin = require('./plugins/auth')
const authRoutes = require('./routes/auth-routes')
const truckRoutes = require('./routes/truck-routes')
const shipmentRoutes = require('./routes/shipment-routes')
const internalRoutes = require('./routes/internal-routes')

function buildApp() {
    const app = fastify({ logger: true })

    app.register(require('@fastify/cors'), {
        origin: config.corsOrigin
    })

    app.register(prismaPlugin)
    app.register(authPlugin)

    app.get('/health', async () => ({ status: 'ok' }))

    app.register(authRoutes, { prefix: '/auth' })
    app.register(truckRoutes, { prefix: '/trucks' })
    app.register(shipmentRoutes)
    app.register(internalRoutes, { prefix: '/internal' })

    return app
}

module.exports = buildApp
