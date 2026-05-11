require('dotenv').config()

function readString(name, fallback = '') {
    const value = process.env[name]
    return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(name, fallback) {
    const value = Number(process.env[name])
    return Number.isFinite(value) ? value : fallback
}

function readBoolean(name, fallback) {
    const value = process.env[name]
    if (value === undefined || value === '') {
        return fallback
    }

    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function readList(name, fallback) {
    const value = process.env[name]
    if (!value) {
        return fallback
    }

    const items = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

    return items.length ? items : fallback
}

function defaultDiskMounts() {
    if (process.platform === 'win32') {
        return [process.cwd().slice(0, 3) || 'C:\\']
    }

    return ['/']
}

module.exports = {
    port: readNumber('PORT', 3000),
    workerHealthPort: readNumber('WORKER_HEALTH_PORT', 3001),
    host: readString('HOST', '0.0.0.0'),
    corsOrigin: readString('CORS_ORIGIN', 'http://localhost:5173'),
    jwtSecret: readString('JWT_SECRET', 'supersecret'),
    resendApiKey: readString('RESEND_API_KEY', ''),
    authFromEmail: readString('AUTH_FROM_EMAIL', 'Transit Grid <auth@drtx.tech>'),
    authCodeTtlMinutes: readNumber('AUTH_CODE_TTL_MINUTES', 10),
    databaseUrl: readString('DATABASE_URL', ''),
    simulatorUrl: readString('SIMULATOR_URL', ''),
    telematicsProviderApiKey: readString('TELEMATICS_PROVIDER_API_KEY', ''),
    telematicsProviderPollIntervalSeconds: readNumber('TELEMATICS_PROVIDER_POLL_INTERVAL_SECONDS', 2),
    webhookUrl: readString('WEBHOOK_URL', ''),
    publicBaseUrl: readString('PUBLIC_BASE_URL', 'http://localhost:8080'),
    objectStorage: {
        endpoint: readString('OBJECT_STORAGE_ENDPOINT', ''),
        region: readString('OBJECT_STORAGE_REGION', 'us-east-1'),
        bucket: readString('OBJECT_STORAGE_BUCKET', ''),
        accessKeyId: readString('OBJECT_STORAGE_ACCESS_KEY_ID', ''),
        secretAccessKey: readString('OBJECT_STORAGE_SECRET_ACCESS_KEY', ''),
        publicBaseUrl: readString('OBJECT_STORAGE_PUBLIC_BASE_URL', '')
    },
    redisUrl: readString('REDIS_URL', ''),
    rabbitmqUrl: readString('RABBITMQ_URL', ''),
    telemetryExchange: readString('TELEMETRY_EXCHANGE', 'telemetry.exchange'),
    telemetryQueue: readString('TELEMETRY_QUEUE', 'telemetry.location.queue'),
    telemetryDlq: readString('TELEMETRY_DLQ', 'telemetry.location.dlq'),
    internalApiKey: readString('INTERNAL_API_KEY', ''),
    rateLimitCapacity: readNumber('RATE_LIMIT_CAPACITY', 60),
    rateLimitRefillPerMinute: readNumber('RATE_LIMIT_REFILL_PER_MINUTE', 60),
    delayStoppedMinutes: readNumber('DELAY_STOPPED_MINUTES', 10),
    delayEtaGraceMinutes: readNumber('DELAY_ETA_GRACE_MINUTES', 15),
    nominatimBaseUrl: readString('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
    nominatimUserAgent: readString('NOMINATIM_USER_AGENT', 'shityTruckingCargoLLC/1.0 (local-dev)'),
    osrmBaseUrl: readString('OSRM_BASE_URL', 'http://router.project-osrm.org'),
    trackingCheckpointLimit: readNumber('TRACKING_CHECKPOINT_LIMIT', 100),
    trackingRouteMaxPoints: readNumber('TRACKING_ROUTE_MAX_POINTS', 250),
    health: {
        cacheTtlMs: readNumber('HEALTH_CACHE_TTL_MS', 5000),
        checkTimeoutMs: readNumber('HEALTH_CHECK_TIMEOUT_MS', 800),
        externalTimeoutMs: readNumber('HEALTH_EXTERNAL_TIMEOUT_MS', 800),
        historyLimit: readNumber('HEALTH_HISTORY_LIMIT', 720),
        historyMemoryRetentionMs: readNumber('HEALTH_HISTORY_MEMORY_RETENTION_MS', 60 * 60 * 1000),
        historyRedisRetentionMs: readNumber('HEALTH_HISTORY_REDIS_RETENTION_MS', 7 * 24 * 60 * 60 * 1000),
        historyRedisMaxEntries: readNumber('HEALTH_HISTORY_REDIS_MAX_ENTRIES', 120960),
        historyRedisEnabled: readBoolean('HEALTH_HISTORY_REDIS_ENABLED', true),
        historyApiKey: readString('HEALTH_HISTORY_API_KEY', ''),
        historyAllowPrivateNetwork: readBoolean('HEALTH_HISTORY_ALLOW_PRIVATE_NETWORK', true),
        redisHistoryKey: readString('HEALTH_HISTORY_REDIS_KEY', 'health:history'),
        diskMounts: readList('HEALTH_DISK_MOUNTS', defaultDiskMounts()),
        diskFreeWarnPercent: readNumber('HEALTH_DISK_FREE_WARN_PERCENT', 15),
        diskFreeFailPercent: readNumber('HEALTH_DISK_FREE_FAIL_PERCENT', 5),
        memoryRssWarnPercent: readNumber('HEALTH_MEMORY_RSS_WARN_PERCENT', 90),
        cpuLoadWarnPercent: readNumber('HEALTH_CPU_LOAD_WARN_PERCENT', 90),
        eventLoopSampleMs: readNumber('HEALTH_EVENT_LOOP_SAMPLE_MS', 20),
        eventLoopWarnMs: readNumber('HEALTH_EVENT_LOOP_WARN_MS', 250),
        eventLoopFailMs: readNumber('HEALTH_EVENT_LOOP_FAIL_MS', 1000),
        critical: {
            postgres: readBoolean('HEALTH_POSTGRES_CRITICAL', true),
            redis: readBoolean('HEALTH_REDIS_CRITICAL', false),
            rabbitmq: readBoolean('HEALTH_RABBITMQ_CRITICAL', true),
            osrm: readBoolean('HEALTH_OSRM_CRITICAL', false),
            nominatim: readBoolean('HEALTH_NOMINATIM_CRITICAL', false),
            disk: readBoolean('HEALTH_DISK_CRITICAL', true),
            memory: readBoolean('HEALTH_MEMORY_CRITICAL', false),
            cpu: readBoolean('HEALTH_CPU_CRITICAL', false),
            migrations: readBoolean('HEALTH_MIGRATIONS_CRITICAL', true),
            workerConsumers: readBoolean('HEALTH_WORKER_CONSUMERS_CRITICAL', false),
            eventLoop: readBoolean('HEALTH_EVENT_LOOP_CRITICAL', true)
        },
        latencyWarningMs: {
            postgres: readNumber('HEALTH_POSTGRES_WARN_MS', 200),
            redis: readNumber('HEALTH_REDIS_WARN_MS', 50),
            rabbitmq: readNumber('HEALTH_RABBITMQ_WARN_MS', 200),
            osrm: readNumber('HEALTH_OSRM_WARN_MS', 500),
            nominatim: readNumber('HEALTH_NOMINATIM_WARN_MS', 500),
            disk: readNumber('HEALTH_DISK_WARN_MS', 100),
            memory: readNumber('HEALTH_MEMORY_WARN_MS', 25),
            cpu: readNumber('HEALTH_CPU_WARN_MS', 25),
            migrations: readNumber('HEALTH_MIGRATIONS_WARN_MS', 200),
            workerConsumers: readNumber('HEALTH_WORKER_CONSUMERS_WARN_MS', 200),
            eventLoop: readNumber('HEALTH_EVENT_LOOP_CHECK_WARN_MS', 100)
        }
    }
}
