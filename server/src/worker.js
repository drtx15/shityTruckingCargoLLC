const { startTelemetry } = require('./telemetry')
const buildApp = require('./app')
const { flushPendingWebhookAttempts } = require('./services/webhook-service')
const { startTelemetryWorker } = require('./services/telemetry-queue-service')

async function start() {
    startTelemetry('logistics-worker')
    const app = buildApp()
    await app.ready()

    await startTelemetryWorker(app)

    setInterval(async () => {
        try {
            await flushPendingWebhookAttempts(app)
        } catch (error) {
            app.log.error({ error }, 'Webhook retry flush failed')
        }
    }, 30 * 1000)
}

start().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exit(1)
})
