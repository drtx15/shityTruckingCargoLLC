const fp = require('fastify-plugin')
const config = require('../config')
const { TokenBucket } = require('../system-components/token-bucket')

const memoryBuckets = new Map()

function getClientKey(request, scope) {
    const forwarded = request.headers['x-forwarded-for']
    const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded || request.ip || 'unknown')
    return `rate:${scope}:${String(ip).split(',')[0].trim()}`
}

async function readState(redis, key) {
    if (!redis) {
        return memoryBuckets.get(key) || null
    }

    const raw = await redis.get(key)
    return raw ? JSON.parse(raw) : null
}

async function writeState(redis, key, state, ttlSeconds) {
    if (!redis) {
        memoryBuckets.set(key, state)
        return
    }

    await redis.set(key, JSON.stringify(state), 'EX', ttlSeconds)
}

async function rateLimitPlugin(app) {
    app.decorate('rateLimit', async function rateLimit(request, reply, options = {}) {
        const scope = options.scope || 'global'
        const capacity = options.capacity || config.rateLimitCapacity
        const refillPerMinute = options.refillPerMinute || config.rateLimitRefillPerMinute
        const cost = options.cost || 1
        const key = getClientKey(request, scope)
        const bucket = new TokenBucket({
            capacity,
            refillPerSecond: refillPerMinute / 60
        })

        const state = await readState(app.redis, key)
        const result = bucket.tryRemove(state, cost)
        await writeState(app.redis, key, result.state, Math.max(60, Math.ceil(capacity / (refillPerMinute / 60))))

        if (!result.allowed) {
            reply.header('retry-after', String(result.retryAfterSeconds))
            reply.code(429).send({
                message: 'Rate limit exceeded',
                retryAfterSeconds: result.retryAfterSeconds
            })
            return false
        }

        return true
    })
}

module.exports = fp(rateLimitPlugin)
