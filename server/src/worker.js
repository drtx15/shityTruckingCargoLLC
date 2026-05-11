const http = require('node:http')
const { startTelemetry } = require('./telemetry')
const config = require('./config')
const buildApp = require('./app')
const { flushPendingWebhookAttempts } = require('./services/webhook-service')
const { startTelemetryWorker } = require('./services/telemetry-queue-service')
const { startTelematicsProviderPoller } = require('./services/telematics-provider-poller-service')

async function start() {
    startTelemetry('logistics-worker')
    const app = buildApp()
    let ready = false
    let shuttingDown = false
    const healthServer = http.createServer((request, response) => {
        const live = !shuttingDown
        const ok = request.url === '/health/ready' ? live && ready : live
        response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
            ready,
            status: ok ? 'ok' : 'not_ready'
        }))
    })

    healthServer.listen(config.workerHealthPort, config.host)
    await app.ready()

    await startTelemetryWorker(app)
    const stopTelematicsProviderPoller = startTelematicsProviderPoller(app)
    ready = true

    setInterval(async () => {
        try {
            await flushPendingWebhookAttempts(app)
        } catch (error) {
            app.log.error({ error }, 'Webhook retry flush failed')
        }
    }, 30 * 1000)

    const shutdown = async (signal) => {
        shuttingDown = true
        ready = false
        app.log.info({ signal }, 'Shutting down worker')
        stopTelematicsProviderPoller()
        healthServer.close()
        try {
            await app.close()
            process.exit(0)
        } catch (error) {
            app.log.error({ error }, 'Worker shutdown failed')
            process.exit(1)
        }
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
}

start().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exit(1)
})
