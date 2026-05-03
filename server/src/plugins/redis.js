const fp = require('fastify-plugin')
const Redis = require('ioredis')
const config = require('../config')

async function redisPlugin(app) {
    if (!config.redisUrl) {
        app.decorate('redis', null)
        return
    }

    const redis = new Redis(config.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 2
    })

    try {
        await redis.connect()
        app.decorate('redis', redis)
    } catch (error) {
        app.log.warn({ error }, 'Redis unavailable; continuing without Redis-backed features')
        app.decorate('redis', null)
        return
    }

    app.addHook('onClose', async () => {
        redis.disconnect()
    })
}

module.exports = fp(redisPlugin)
