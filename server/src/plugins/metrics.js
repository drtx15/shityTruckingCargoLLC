const fp = require('fastify-plugin')
const client = require('prom-client')

function getOrCreateMetric(type, options) {
    const existing = client.register.getSingleMetric(options.name)
    if (existing) {
        return existing
    }

    return new type(options)
}

async function metricsPlugin(app) {
    if (!client.register.getSingleMetric('logistics_process_cpu_user_seconds_total')) {
        client.collectDefaultMetrics({ prefix: 'logistics_' })
    }

    const httpRequests = getOrCreateMetric(client.Counter, {
        name: 'logistics_http_requests_total',
        help: 'HTTP requests handled by the backend',
        labelNames: ['method', 'route', 'status_code']
    })

    const telemetryEvents = getOrCreateMetric(client.Counter, {
        name: 'logistics_telemetry_events_total',
        help: 'Telemetry events accepted by the backend',
        labelNames: ['source']
    })

    const websocketClients = getOrCreateMetric(client.Gauge, {
        name: 'logistics_websocket_clients',
        help: 'Currently connected tracking WebSocket clients'
    })

    const serviceHealthStatus = getOrCreateMetric(client.Gauge, {
        name: 'service_health_status',
        help: 'Dependency health status by service, where 1 means up and 0 means not up',
        labelNames: ['service']
    })

    const serviceHealthLatencyMs = getOrCreateMetric(client.Gauge, {
        name: 'service_health_latency_ms',
        help: 'Dependency health check round-trip latency in milliseconds',
        labelNames: ['service']
    })

    const appHealthStatus = getOrCreateMetric(client.Gauge, {
        name: 'app_health_status',
        help: 'Application health status, where 0 is unhealthy, 1 is degraded, and 2 is healthy'
    })

    const healthChecksTotal = getOrCreateMetric(client.Counter, {
        name: 'health_checks_total',
        help: 'Health check results by service',
        labelNames: ['service', 'result']
    })

    app.decorate('metrics', {
        appHealthStatus,
        healthChecksTotal,
        httpRequests,
        serviceHealthLatencyMs,
        serviceHealthStatus,
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
