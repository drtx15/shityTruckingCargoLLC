const fp = require('fastify-plugin')
const client = require('prom-client')

async function metricsPlugin(app) {
    client.collectDefaultMetrics({ prefix: 'logistics_' })

    const httpRequests = new client.Counter({
        name: 'logistics_http_requests_total',
        help: 'HTTP requests handled by the backend',
        labelNames: ['method', 'route', 'status_code']
    })

    const telemetryEvents = new client.Counter({
        name: 'logistics_telemetry_events_total',
        help: 'Telemetry events accepted by the backend',
        labelNames: ['source']
    })

    const websocketClients = new client.Gauge({
        name: 'logistics_websocket_clients',
        help: 'Currently connected tracking WebSocket clients'
    })

    app.decorate('metrics', {
        httpRequests,
        telemetryEvents,
        websocketClients,
        registry: client.register
    })

    app.addHook('onResponse', async (request, reply) => {
        httpRequests.inc({
            method: request.method,
            route: request.routeOptions?.url || request.url,
            status_code: String(reply.statusCode)
        })
    })

    app.get('/metrics', async (_request, reply) => {
        reply.header('content-type', client.register.contentType)
        return client.register.metrics()
    })
}

module.exports = fp(metricsPlugin)
