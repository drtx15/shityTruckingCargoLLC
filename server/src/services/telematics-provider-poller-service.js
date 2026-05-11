const crypto = require('node:crypto')
const config = require('../config')
const { enqueueTelemetry } = require('./telemetry-queue-service')

const lastEventByTruck = new Map()
const POLL_LOCK_KEY = 'telematics:provider:poll:lock'
const EVENT_DEDUPE_TTL_SECONDS = 60 * 60

function providerHeaders() {
    const headers = {
        accept: 'application/json'
    }

    if (config.telematicsProviderApiKey) {
        headers['x-api-key'] = config.telematicsProviderApiKey
    }

    return headers
}

function toNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

function normalizeVehicles(payload) {
    if (Array.isArray(payload)) {
        return payload
    }

    if (Array.isArray(payload?.vehicles)) {
        return payload.vehicles
    }

    if (payload && typeof payload === 'object') {
        return Object.entries(payload).map(([truckId, value]) => ({
            truckId: value?.truckId ?? truckId,
            ...value
        }))
    }

    return []
}

function normalizeTelemetry(vehicle) {
    const truckId = Number(vehicle?.truckId)
    const lat = toNumber(vehicle?.lat)
    const lng = toNumber(vehicle?.lng)
    const speed = toNumber(vehicle?.speed)
    const timestamp = toNumber(vehicle?.timestamp)

    if (!Number.isInteger(truckId) || truckId <= 0 || lat === null || lng === null || speed === null || timestamp === null) {
        return null
    }

    return {
        truckId,
        lat,
        lng,
        speed,
        timestamp,
        heading: toNumber(vehicle.heading),
        accuracy: toNumber(vehicle.accuracy),
        eventType: typeof vehicle.eventType === 'string' ? vehicle.eventType : 'LOCATION_UPDATE',
        state: typeof vehicle.state === 'string' ? vehicle.state : null,
        reason: typeof vehicle.reason === 'string' ? vehicle.reason : null,
        provider: typeof vehicle.provider === 'string' ? vehicle.provider : null,
        providerEventId: typeof vehicle.providerEventId === 'string' ? vehicle.providerEventId : null
    }
}

function buildTelemetryEventKey(telemetry) {
    const rawKey = telemetry.providerEventId || `${telemetry.timestamp}:${telemetry.lat}:${telemetry.lng}:${telemetry.speed}`
    return crypto
        .createHash('sha256')
        .update(`${telemetry.truckId}:${rawKey}`)
        .digest('hex')
}

async function acquirePollLease(app, intervalMs) {
    if (!app.redis) {
        return true
    }

    try {
        const ttlMs = Math.max(750, intervalMs - 100)
        const result = await app.redis.set(POLL_LOCK_KEY, `${process.pid}:${Date.now()}`, 'PX', ttlMs, 'NX')
        return result === 'OK'
    } catch (error) {
        app.log.warn({ error }, 'Redis poll lease unavailable; falling back to local provider polling')
        return true
    }
}

async function claimTelemetryEvent(app, telemetry) {
    const eventKey = buildTelemetryEventKey(telemetry)

    if (app.redis) {
        try {
            const result = await app.redis.set(
                `telematics:provider:event:${eventKey}`,
                '1',
                'EX',
                EVENT_DEDUPE_TTL_SECONDS,
                'NX'
            )
            return result === 'OK'
        } catch (error) {
            app.log.warn({ error }, 'Redis telemetry dedupe unavailable; falling back to local dedupe')
        }
    }

    if (lastEventByTruck.get(telemetry.truckId) === eventKey) {
        return false
    }

    lastEventByTruck.set(telemetry.truckId, eventKey)
    return true
}

async function pollTelematicsProvider(app, options = {}) {
    const providerUrl = config.simulatorUrl.replace(/\/+$/, '')
    if (!providerUrl) {
        return
    }

    const intervalMs = Number(options.intervalMs) || Math.max(1000, config.telematicsProviderPollIntervalSeconds * 1000)
    const hasLease = await acquirePollLease(app, intervalMs)
    if (!hasLease) {
        return
    }

    const response = await fetch(`${providerUrl}/v1/vehicles/locations`, {
        headers: providerHeaders()
    })

    if (!response.ok) {
        app.log.warn({ statusCode: response.status }, 'Telematics provider polling failed')
        return
    }

    const payload = await response.json()
    const vehicles = normalizeVehicles(payload)

    for (const vehicle of vehicles) {
        const telemetry = normalizeTelemetry(vehicle)
        if (!telemetry) {
            continue
        }

        const claimed = await claimTelemetryEvent(app, telemetry)
        if (!claimed) {
            continue
        }

        await enqueueTelemetry(app, telemetry)
    }
}

function startTelematicsProviderPoller(app) {
    if (!config.simulatorUrl) {
        app.log.info('SIMULATOR_URL is not set; telematics provider polling disabled')
        return () => {}
    }

    const intervalMs = Math.max(1000, config.telematicsProviderPollIntervalSeconds * 1000)
    const run = async () => {
        try {
            await pollTelematicsProvider(app, { intervalMs })
        } catch (error) {
            app.log.warn({ error }, 'Telematics provider polling failed')
        }
    }

    run()
    const timer = setInterval(run, intervalMs)
    timer.unref?.()

    app.log.info({ providerUrl: config.simulatorUrl, intervalMs }, 'Telematics provider polling enabled')
    return () => clearInterval(timer)
}

module.exports = {
    pollTelematicsProvider,
    startTelematicsProviderPoller
}
