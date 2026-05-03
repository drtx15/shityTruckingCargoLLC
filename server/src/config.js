require('dotenv').config()

function readString(name, fallback = '') {
    const value = process.env[name]
    return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(name, fallback) {
    const value = Number(process.env[name])
    return Number.isFinite(value) ? value : fallback
}

module.exports = {
    port: readNumber('PORT', 3000),
    host: readString('HOST', '0.0.0.0'),
    corsOrigin: readString('CORS_ORIGIN', 'http://localhost:5173'),
    jwtSecret: readString('JWT_SECRET', 'supersecret'),
    resendApiKey: readString('RESEND_API_KEY', ''),
    authFromEmail: readString('AUTH_FROM_EMAIL', 'Transit Grid <auth@drtx.tech>'),
    authCodeTtlMinutes: readNumber('AUTH_CODE_TTL_MINUTES', 10),
    databaseUrl: readString('DATABASE_URL', ''),
    simulatorUrl: readString('SIMULATOR_URL', ''),
    webhookUrl: readString('WEBHOOK_URL', ''),
    publicBaseUrl: readString('PUBLIC_BASE_URL', 'http://localhost:8080'),
    redisUrl: readString('REDIS_URL', ''),
    rabbitmqUrl: readString('RABBITMQ_URL', ''),
    telemetryExchange: readString('TELEMETRY_EXCHANGE', 'telemetry.exchange'),
    telemetryQueue: readString('TELEMETRY_QUEUE', 'telemetry.location.queue'),
    telemetryDlq: readString('TELEMETRY_DLQ', 'telemetry.location.dlq'),
    rateLimitCapacity: readNumber('RATE_LIMIT_CAPACITY', 60),
    rateLimitRefillPerMinute: readNumber('RATE_LIMIT_REFILL_PER_MINUTE', 60),
    delayStoppedMinutes: readNumber('DELAY_STOPPED_MINUTES', 10),
    delayEtaGraceMinutes: readNumber('DELAY_ETA_GRACE_MINUTES', 15),
    nominatimBaseUrl: readString('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
    nominatimUserAgent: readString('NOMINATIM_USER_AGENT', 'shityTruckingCargoLLC/1.0 (local-dev)'),
    osrmBaseUrl: readString('OSRM_BASE_URL', 'http://router.project-osrm.org'),
    trackingCheckpointLimit: readNumber('TRACKING_CHECKPOINT_LIMIT', 100),
    trackingRouteMaxPoints: readNumber('TRACKING_ROUTE_MAX_POINTS', 250)
}
