const amqp = require('amqplib')
const config = require('../config')
const { processLocationUpdate } = require('./shipment-service')

let connectionPromise = null

async function getChannel(app) {
    if (!config.rabbitmqUrl) {
        return null
    }

    if (!connectionPromise) {
        connectionPromise = amqp.connect(config.rabbitmqUrl)
    }

    const connection = await connectionPromise
    const channel = await connection.createChannel()
    await channel.assertExchange(config.telemetryExchange, 'topic', { durable: true })
    await channel.assertQueue(config.telemetryDlq, { durable: true })
    await channel.assertQueue(config.telemetryQueue, {
        durable: true,
        deadLetterExchange: '',
        deadLetterRoutingKey: config.telemetryDlq
    })
    await channel.bindQueue(config.telemetryQueue, config.telemetryExchange, 'telemetry.location')

    return channel
}

async function enqueueTelemetry(app, payload) {
    app.metrics?.telemetryEvents?.inc({ source: config.rabbitmqUrl ? 'rabbitmq' : 'inline' })

    const channel = await getChannel(app).catch((error) => {
        app.log.warn({ error }, 'RabbitMQ unavailable; processing telemetry inline')
        return null
    })

    if (!channel) {
        const result = await processLocationUpdate(app, payload)
        return {
            accepted: true,
            mode: 'inline',
            result
        }
    }

    channel.publish(
        config.telemetryExchange,
        'telemetry.location',
        Buffer.from(JSON.stringify(payload)),
        {
            contentType: 'application/json',
            persistent: true,
            timestamp: Math.floor(Date.now() / 1000)
        }
    )

    return {
        accepted: true,
        mode: 'queued'
    }
}

async function startTelemetryWorker(app) {
    const channel = await getChannel(app)
    await channel.prefetch(10)

    await channel.consume(config.telemetryQueue, async (message) => {
        if (!message) {
            return
        }

        try {
            const payload = JSON.parse(message.content.toString('utf8'))
            await processLocationUpdate(app, payload)
            channel.ack(message)
        } catch (error) {
            app.log.error({ error }, 'Failed to process telemetry message')
            channel.nack(message, false, false)
        }
    })

    app.log.info({ queue: config.telemetryQueue }, 'Telemetry worker is consuming events')
}

module.exports = {
    enqueueTelemetry,
    startTelemetryWorker
}
