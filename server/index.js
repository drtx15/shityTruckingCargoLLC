const { startTelemetry } = require('./src/telemetry')
const config = require('./src/config')
const buildApp = require('./src/app')

const start = async () => {
    startTelemetry('logistics-backend')
    const app = buildApp()

    try {
        await app.listen({ port: config.port, host: config.host })
        const shutdown = async (signal) => {
            app.log.info({ signal }, 'Shutting down backend')
            try {
                await app.close()
                process.exit(0)
            } catch (error) {
                app.log.error({ error }, 'Backend shutdown failed')
                process.exit(1)
            }
        }

        process.on('SIGTERM', shutdown)
        process.on('SIGINT', shutdown)
    } catch (error) {
        app.log.error(error)
        process.exit(1)
    }
}

start()
