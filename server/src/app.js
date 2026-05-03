const fastify = require('fastify')
const config = require('./config')

const prismaPlugin = require('./plugins/prisma')
const redisPlugin = require('./plugins/redis')
const authPlugin = require('./plugins/auth')
const metricsPlugin = require('./plugins/metrics')
const rateLimitPlugin = require('./plugins/rate-limit')
const authRoutes = require('./routes/auth-routes')
const analyticsRoutes = require('./routes/analytics-routes')
const shipperRoutes = require('./routes/shipper-routes')
const truckRoutes = require('./routes/truck-routes')
const shipmentRoutes = require('./routes/shipment-routes')
const internalRoutes = require('./routes/internal-routes')
const trackingWsRoutes = require('./routes/tracking-ws-routes')
const webhookRoutes = require('./routes/webhook-routes')
const userRoutes = require('./routes/user-routes')

function buildApp() {
    const app = fastify({ logger: true })

    app.register(require('@fastify/cors'), {
        origin: true
    })
    app.register(require('@fastify/websocket'))
    app.register(require('@fastify/swagger'), {
        openapi: {
            info: {
                title: 'Logistics Shipment Tracking API',
                version: '1.0.0',
                description: 'Shipment, truck, shipper, tracking, webhook, and analytics endpoints.'
            }
        }
    })
    app.register(require('@fastify/swagger-ui'), {
        routePrefix: '/docs'
    })

    app.register(prismaPlugin)
    app.register(redisPlugin)
    app.register(authPlugin)
    app.register(metricsPlugin)
    app.register(rateLimitPlugin)

    app.get('/health', async () => ({ status: 'ok' }))
    app.get('/openapi.json', async () => app.swagger())

    app.register(authRoutes, { prefix: '/auth' })
    app.register(analyticsRoutes)
    app.register(shipperRoutes, { prefix: '/shippers' })
    app.register(truckRoutes, { prefix: '/trucks' })
    app.register(shipmentRoutes)
    app.register(internalRoutes, { prefix: '/internal' })
    app.register(trackingWsRoutes)
    app.register(webhookRoutes)
    app.register(userRoutes, { prefix: '/users' })

    return app
}

module.exports = buildApp
