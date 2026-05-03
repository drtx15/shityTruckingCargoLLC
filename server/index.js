const { startTelemetry } = require('./src/telemetry')
const config = require('./src/config')
const buildApp = require('./src/app')

const start = async () => {
    startTelemetry('logistics-backend')
    const app = buildApp()

    try {
        await app.listen({ port: config.port, host: config.host })
    } catch (error) {
        app.log.error(error)
        process.exit(1)
    }
}

start()
