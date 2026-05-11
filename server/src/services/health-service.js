const { execFile } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const amqp = require('amqplib')
const config = require('../config')
const packageJson = require('../../package.json')

const execFileAsync = promisify(execFile)

const HEALTH_ORDER = [
    'postgres',
    'migrations',
    'redis',
    'rabbitmq',
    'worker_consumers',
    'osrm',
    'nominatim',
    'disk',
    'memory',
    'cpu',
    'event_loop'
]

const APP_STATUS_VALUE = {
    unhealthy: 0,
    degraded: 1,
    healthy: 2
}

function toMs(startedAt) {
    return Math.round((Number(process.hrtime.bigint() - startedAt) / 1e6) * 100) / 100
}

function redactSensitive(value) {
    return String(value || '')
        .replace(/((?:postgres(?:ql)?|redis|amqps?):\/\/)([^@\s/]+)@/gi, '$1<redacted>@')
        .replace(/(password|secret|token|api[_-]?key)=([^&\s]+)/gi, '$1=<redacted>')
        .slice(0, 240)
}

function withTimeout(factory, timeoutMs, label) {
    let timeoutId
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
    })

    return Promise.race([
        Promise.resolve().then(factory),
        timeout
    ]).finally(() => clearTimeout(timeoutId))
}

function metricResultFor(service) {
    if (service.status === 'down') {
        return 'fail'
    }

    if (service.status === 'degraded') {
        return 'warn'
    }

    return 'ok'
}

function finalizeCheck(service, options, raw) {
    const critical = Boolean(options.critical)
    const latencyWarningMs = Number(options.latencyWarningMs)
    const latencyMs = Number.isFinite(raw.latency_ms) ? raw.latency_ms : 0

    if (raw.skipped) {
        return compactObject({
            status: critical ? 'down' : 'skipped',
            critical,
            latency_ms: latencyMs,
            note: raw.note || `${service} is not configured`,
            error: critical ? raw.error || `${service} is required but not configured` : undefined
        })
    }

    let state = raw.state || 'ok'
    if (state === 'ok' && Number.isFinite(latencyWarningMs) && latencyWarningMs > 0 && latencyMs > latencyWarningMs) {
        state = 'warn'
    }

    const status = state === 'ok' ? 'up' : (state === 'fail' && critical ? 'down' : 'degraded')

    return compactObject({
        status,
        critical,
        latency_ms: latencyMs,
        error: raw.error,
        details: raw.details
    })
}

async function runCheck(service, options, check) {
    const startedAt = process.hrtime.bigint()

    try {
        const raw = await withTimeout(check, options.timeoutMs, service)
        return [
            service,
            finalizeCheck(service, options, {
                ...raw,
                latency_ms: toMs(startedAt)
            })
        ]
    } catch (error) {
        return [
            service,
            finalizeCheck(service, options, {
                state: 'fail',
                latency_ms: toMs(startedAt),
                error: redactSensitive(error.message || error)
            })
        ]
    }
}

function compactObject(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined))
}

async function checkPostgres(app) {
    await app.prisma.$queryRawUnsafe('SELECT 1')
    return { state: 'ok' }
}

async function checkRedis(app) {
    if (!config.redisUrl) {
        return { skipped: true, note: 'REDIS_URL is not configured' }
    }

    if (!app.redis) {
        throw new Error('Redis client is unavailable')
    }

    const response = await app.redis.ping()
    if (response !== 'PONG') {
        throw new Error(`Redis responded with ${response}`)
    }

    return { state: 'ok' }
}

async function checkRabbitmq() {
    if (!config.rabbitmqUrl) {
        return { skipped: true, note: 'RABBITMQ_URL is not configured' }
    }

    let connection
    let channel

    try {
        connection = await amqp.connect(config.rabbitmqUrl, {
            timeout: config.health.checkTimeoutMs
        })
        connection.on('error', () => {})
        channel = await connection.createChannel()
        channel.on('error', () => {})

        let queueDetails = null
        let queueError = null
        try {
            queueDetails = await channel.checkQueue(config.telemetryQueue)
        } catch (error) {
            queueError = redactSensitive(error.message || error)
        }

        return {
            state: 'ok',
            details: compactObject({
                queue: config.telemetryQueue,
                queue_available: Boolean(queueDetails),
                message_count: queueDetails?.messageCount,
                consumer_count: queueDetails?.consumerCount,
                queue_error: queueError
            })
        }
    } finally {
        if (channel) {
            await channel.close().catch(() => {})
        }
        if (connection) {
            await connection.close().catch(() => {})
        }
    }
}

function checkWorkerConsumers(rabbitmqResult) {
    const critical = config.health.critical.workerConsumers
    const latencyWarningMs = config.health.latencyWarningMs.workerConsumers

    if (!config.rabbitmqUrl) {
        return finalizeCheck('worker_consumers', { critical, latencyWarningMs }, {
            skipped: true,
            note: 'RABBITMQ_URL is not configured'
        })
    }

    const details = rabbitmqResult?.details
    if (!details || rabbitmqResult.status === 'down') {
        return finalizeCheck('worker_consumers', { critical, latencyWarningMs }, {
            state: 'fail',
            latency_ms: rabbitmqResult?.latency_ms || 0,
            error: 'RabbitMQ queue details are unavailable'
        })
    }

    if (!details.queue_available) {
        return finalizeCheck('worker_consumers', { critical, latencyWarningMs }, {
            state: 'fail',
            latency_ms: rabbitmqResult.latency_ms,
            error: details.queue_error || 'Telemetry queue is unavailable',
            details: {
                queue: details.queue,
                consumer_count: 0
            }
        })
    }

    const consumerCount = Number(details.consumer_count || 0)
    return finalizeCheck('worker_consumers', { critical, latencyWarningMs }, {
        state: consumerCount > 0 ? 'ok' : 'fail',
        latency_ms: rabbitmqResult.latency_ms,
        error: consumerCount > 0 ? undefined : 'No telemetry worker consumers are connected',
        details: {
            queue: details.queue,
            consumer_count: consumerCount
        }
    })
}

async function checkMigrations(app) {
    const migrationsDir = path.resolve(__dirname, '../../prisma/migrations')
    const migrationEntries = await fs.readdir(migrationsDir, { withFileTypes: true })
    const expectedMigrations = migrationEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()

    const rows = await app.prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"'
    )

    const applied = new Set(
        rows
            .filter((row) => row.finished_at && !row.rolled_back_at)
            .map((row) => row.migration_name)
    )
    const unfinished = rows.filter((row) => !row.finished_at && !row.rolled_back_at)
    const rolledBack = rows.filter((row) => row.rolled_back_at)
    const missing = expectedMigrations.filter((name) => !applied.has(name))

    if (missing.length || unfinished.length) {
        return {
            state: 'fail',
            error: 'Database migrations are not fully applied',
            details: {
                expected_count: expectedMigrations.length,
                applied_count: applied.size,
                missing: missing.slice(0, 5),
                unfinished: unfinished.map((row) => row.migration_name).slice(0, 5),
                rolled_back_count: rolledBack.length
            }
        }
    }

    return {
        state: 'ok',
        details: {
            expected_count: expectedMigrations.length,
            applied_count: applied.size,
            rolled_back_count: rolledBack.length
        }
    }
}

async function fetchWithAbort(url, options = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || config.health.externalTimeoutMs)

    try {
        return await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            signal: controller.signal
        })
    } finally {
        clearTimeout(timeoutId)
    }
}

async function checkOsrm() {
    if (!config.osrmBaseUrl) {
        return { skipped: true, note: 'OSRM_BASE_URL is not configured' }
    }

    const url = new URL('/route/v1/driving/0,0;0.01,0.01', config.osrmBaseUrl)
    url.searchParams.set('overview', 'false')
    url.searchParams.set('alternatives', 'false')
    url.searchParams.set('steps', 'false')

    const response = await fetchWithAbort(url, {
        timeoutMs: config.health.externalTimeoutMs,
        headers: { accept: 'application/json' }
    })

    if (!response.ok) {
        throw new Error(`OSRM responded with ${response.status}`)
    }

    return { state: 'ok' }
}

async function checkNominatim() {
    if (!config.nominatimBaseUrl) {
        return { skipped: true, note: 'NOMINATIM_BASE_URL is not configured' }
    }

    const url = new URL('/status.php', config.nominatimBaseUrl)
    url.searchParams.set('format', 'json')

    const response = await fetchWithAbort(url, {
        timeoutMs: config.health.externalTimeoutMs,
        headers: {
            accept: 'application/json',
            'user-agent': config.nominatimUserAgent
        }
    })

    if (!response.ok) {
        throw new Error(`Nominatim responded with ${response.status}`)
    }

    return { state: 'ok' }
}

async function readPosixDiskSpace(mount) {
    const { stdout } = await execFileAsync('df', ['-Pk', mount], {
        timeout: config.health.checkTimeoutMs
    })
    const lines = stdout.trim().split(/\r?\n/)
    const parts = lines[lines.length - 1].trim().split(/\s+/)
    const totalBytes = Number(parts[1]) * 1024
    const freeBytes = Number(parts[3]) * 1024

    if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0) {
        throw new Error(`Could not parse disk space for ${mount}`)
    }

    return {
        mount,
        total_bytes: totalBytes,
        free_bytes: freeBytes,
        free_percent: Math.round((freeBytes / totalBytes) * 10000) / 100
    }
}

async function readWindowsDiskSpace(mount) {
    const root = path.parse(path.resolve(mount)).root || mount
    const drive = root.replace(/\\$/, '')
    if (!/^[a-z]:$/i.test(drive)) {
        throw new Error(`Unsupported Windows disk mount ${mount}`)
    }

    const command = [
        `$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${drive.toUpperCase()}'"`,
        'if ($null -eq $disk) { exit 2 }',
        'Write-Output "$($disk.FreeSpace) $($disk.Size)"'
    ].join('; ')
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
        timeout: config.health.checkTimeoutMs
    })
    const [freeBytes, totalBytes] = stdout.trim().split(/\s+/).map(Number)

    if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0) {
        throw new Error(`Could not parse disk space for ${mount}`)
    }

    return {
        mount: drive,
        total_bytes: totalBytes,
        free_bytes: freeBytes,
        free_percent: Math.round((freeBytes / totalBytes) * 10000) / 100
    }
}

async function readDiskSpace(mount) {
    return os.platform() === 'win32' ? readWindowsDiskSpace(mount) : readPosixDiskSpace(mount)
}

async function checkDisk() {
    const volumes = await Promise.all(config.health.diskMounts.map((mount) => readDiskSpace(mount)))
    const worst = volumes.reduce((current, item) => (
        !current || item.free_percent < current.free_percent ? item : current
    ), null)

    let state = 'ok'
    let error
    if (worst && worst.free_percent <= config.health.diskFreeFailPercent) {
        state = 'fail'
        error = `Disk free space is below ${config.health.diskFreeFailPercent}%`
    } else if (worst && worst.free_percent <= config.health.diskFreeWarnPercent) {
        state = 'warn'
        error = `Disk free space is below ${config.health.diskFreeWarnPercent}%`
    }

    return {
        state,
        error,
        details: {
            warn_free_percent: config.health.diskFreeWarnPercent,
            fail_free_percent: config.health.diskFreeFailPercent,
            volumes
        }
    }
}

async function checkMemory() {
    const usage = process.memoryUsage()
    const totalMemory = os.totalmem()
    const rssPercent = totalMemory > 0 ? Math.round((usage.rss / totalMemory) * 10000) / 100 : 0

    return {
        state: rssPercent >= config.health.memoryRssWarnPercent ? 'warn' : 'ok',
        error: rssPercent >= config.health.memoryRssWarnPercent
            ? `RSS memory is above ${config.health.memoryRssWarnPercent}%`
            : undefined,
        details: {
            rss_bytes: usage.rss,
            heap_used_bytes: usage.heapUsed,
            total_memory_bytes: totalMemory,
            rss_percent: rssPercent,
            warn_percent: config.health.memoryRssWarnPercent
        }
    }
}

async function checkCpu() {
    const cpus = os.cpus().length || 1
    const load1m = os.loadavg()[0] || 0
    const loadPercent = Math.round((load1m / cpus) * 10000) / 100

    return {
        state: loadPercent >= config.health.cpuLoadWarnPercent ? 'warn' : 'ok',
        error: loadPercent >= config.health.cpuLoadWarnPercent
            ? `CPU load is above ${config.health.cpuLoadWarnPercent}%`
            : undefined,
        details: {
            load_1m: load1m,
            cpu_count: cpus,
            load_percent: loadPercent,
            warn_percent: config.health.cpuLoadWarnPercent
        }
    }
}

async function measureEventLoopLag() {
    const sampleMs = config.health.eventLoopSampleMs
    const startedAt = process.hrtime.bigint()
    await new Promise((resolve) => setTimeout(resolve, sampleMs))
    return Math.max(0, Math.round((toMs(startedAt) - sampleMs) * 100) / 100)
}

async function checkEventLoop() {
    const lagMs = await measureEventLoopLag()
    let state = 'ok'
    let error

    if (lagMs >= config.health.eventLoopFailMs) {
        state = 'fail'
        error = `Event loop lag is above ${config.health.eventLoopFailMs}ms`
    } else if (lagMs >= config.health.eventLoopWarnMs) {
        state = 'warn'
        error = `Event loop lag is above ${config.health.eventLoopWarnMs}ms`
    }

    return {
        state,
        error,
        details: {
            lag_ms: lagMs,
            warn_ms: config.health.eventLoopWarnMs,
            fail_ms: config.health.eventLoopFailMs
        }
    }
}

function getCheckDefinitions(app) {
    return {
        postgres: {
            critical: config.health.critical.postgres,
            latencyWarningMs: config.health.latencyWarningMs.postgres,
            timeoutMs: config.health.checkTimeoutMs,
            check: () => checkPostgres(app)
        },
        migrations: {
            critical: config.health.critical.migrations,
            latencyWarningMs: config.health.latencyWarningMs.migrations,
            timeoutMs: config.health.checkTimeoutMs,
            check: () => checkMigrations(app)
        },
        redis: {
            critical: config.health.critical.redis,
            latencyWarningMs: config.health.latencyWarningMs.redis,
            timeoutMs: config.health.checkTimeoutMs,
            check: () => checkRedis(app)
        },
        rabbitmq: {
            critical: config.health.critical.rabbitmq,
            latencyWarningMs: config.health.latencyWarningMs.rabbitmq,
            timeoutMs: config.health.checkTimeoutMs,
            check: checkRabbitmq
        },
        osrm: {
            critical: config.health.critical.osrm,
            latencyWarningMs: config.health.latencyWarningMs.osrm,
            timeoutMs: config.health.externalTimeoutMs,
            check: checkOsrm
        },
        nominatim: {
            critical: config.health.critical.nominatim,
            latencyWarningMs: config.health.latencyWarningMs.nominatim,
            timeoutMs: config.health.externalTimeoutMs,
            check: checkNominatim
        },
        disk: {
            critical: config.health.critical.disk,
            latencyWarningMs: config.health.latencyWarningMs.disk,
            timeoutMs: config.health.checkTimeoutMs,
            check: checkDisk
        },
        memory: {
            critical: config.health.critical.memory,
            latencyWarningMs: config.health.latencyWarningMs.memory,
            timeoutMs: config.health.checkTimeoutMs,
            check: checkMemory
        },
        cpu: {
            critical: config.health.critical.cpu,
            latencyWarningMs: config.health.latencyWarningMs.cpu,
            timeoutMs: config.health.checkTimeoutMs,
            check: checkCpu
        },
        event_loop: {
            critical: config.health.critical.eventLoop,
            latencyWarningMs: config.health.latencyWarningMs.eventLoop,
            timeoutMs: Math.max(config.health.eventLoopFailMs + config.health.eventLoopSampleMs, config.health.checkTimeoutMs),
            check: checkEventLoop
        }
    }
}

async function runChecks(app, requestedChecks = HEALTH_ORDER) {
    const definitions = getCheckDefinitions(app)
    const requested = requestedChecks.filter((name) => HEALTH_ORDER.includes(name))
    const baseChecks = requested.filter((name) => name !== 'worker_consumers')

    const entries = await Promise.all(
        baseChecks.map((name) => runCheck(name, definitions[name], definitions[name].check))
    )
    const services = Object.fromEntries(entries)

    if (requested.includes('worker_consumers')) {
        const rabbitmqResult = services.rabbitmq || Object.fromEntries([
            await runCheck('rabbitmq', definitions.rabbitmq, definitions.rabbitmq.check)
        ]).rabbitmq
        services.worker_consumers = checkWorkerConsumers(rabbitmqResult)
    }

    return Object.fromEntries(
        requested
            .filter((name) => services[name])
            .map((name) => [name, services[name]])
    )
}

function determineStatus(services) {
    const values = Object.values(services)
    if (values.some((service) => service.status === 'down')) {
        return 'unhealthy'
    }

    if (values.some((service) => service.status === 'degraded')) {
        return 'degraded'
    }

    return 'healthy'
}

function buildNotes(status, services) {
    if (status === 'healthy') {
        return 'all good'
    }

    const failed = Object.entries(services)
        .filter(([, service]) => service.status === 'down')
        .map(([name]) => name)
    if (failed.length) {
        return `critical checks failed: ${failed.join(', ')}`
    }

    const degraded = Object.entries(services)
        .filter(([, service]) => service.status === 'degraded')
        .map(([name]) => name)
    return `degraded checks: ${degraded.join(', ')}`
}

function getVersion() {
    const explicitVersion = process.env.APP_VERSION || process.env.npm_package_version || packageJson.version || '0.0.0'
    const gitSha = process.env.GIT_SHA || process.env.COMMIT_SHA || ''

    return gitSha ? `${explicitVersion}+${gitSha.slice(0, 12)}` : explicitVersion
}

function compactSnapshot(snapshot) {
    return {
        timestamp: snapshot.timestamp,
        status: snapshot.status,
        services: snapshot.services
    }
}

class HealthHistory {
    constructor(options = {}) {
        this.limit = options.limit || config.health.historyLimit
        this.retentionMs = options.retentionMs || config.health.historyMemoryRetentionMs
        this.snapshots = []
    }

    add(snapshot) {
        this.snapshots.push(compactSnapshot(snapshot))
        this.prune()
    }

    prune(now = Date.now()) {
        const cutoff = now - this.retentionMs
        this.snapshots = this.snapshots
            .filter((snapshot) => Date.parse(snapshot.timestamp) >= cutoff)
            .slice(-this.limit)
    }

    list(limit = this.limit) {
        this.prune()
        return this.snapshots.slice(-limit)
    }
}

function normalizeHistoryLimit(value) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        return 50
    }

    return Math.min(config.health.historyLimit, Math.max(1, Math.floor(parsed)))
}

async function persistSnapshot(app, snapshot) {
    if (!config.health.historyRedisEnabled || !app.redis) {
        return
    }

    const payload = JSON.stringify(compactSnapshot(snapshot))
    await app.redis.lpush(config.health.redisHistoryKey, payload)
    await app.redis.ltrim(config.health.redisHistoryKey, 0, Math.max(0, config.health.historyRedisMaxEntries - 1))
    await app.redis.expire(config.health.redisHistoryKey, Math.ceil(config.health.historyRedisRetentionMs / 1000))
}

async function readRedisHistory(app, limit) {
    if (!config.health.historyRedisEnabled || !app.redis) {
        return []
    }

    const rawItems = await app.redis.lrange(config.health.redisHistoryKey, 0, Math.max(limit * 2, limit) - 1)
    const cutoff = Date.now() - config.health.historyRedisRetentionMs

    return rawItems
        .map((item) => {
            try {
                return JSON.parse(item)
            } catch (_error) {
                return null
            }
        })
        .filter((item) => item && Date.parse(item.timestamp) >= cutoff)
        .reverse()
}

function mergeHistory(items, limit) {
    const unique = new Map()
    for (const item of items) {
        unique.set(item.timestamp, item)
    }

    return Array.from(unique.values())
        .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
        .slice(-limit)
}

function recordMetrics(app, snapshot) {
    if (!app.metrics) {
        return
    }

    const healthValue = APP_STATUS_VALUE[snapshot.status] ?? 0
    app.metrics.appHealthStatus?.set(healthValue)

    for (const [serviceName, service] of Object.entries(snapshot.services)) {
        const healthStatus = service.status === 'up' ? 1 : 0
        app.metrics.serviceHealthStatus?.set({ service: serviceName }, healthStatus)

        if (Number.isFinite(service.latency_ms)) {
            app.metrics.serviceHealthLatencyMs?.set({ service: serviceName }, service.latency_ms)
        }

        app.metrics.healthChecksTotal?.inc({
            service: serviceName,
            result: metricResultFor(service)
        })
    }
}

async function buildSnapshot(app, requestedChecks = HEALTH_ORDER) {
    const services = await runChecks(app, requestedChecks)
    const status = determineStatus(services)

    return {
        status,
        uptime: Math.round(process.uptime()),
        version: getVersion(),
        timestamp: new Date().toISOString(),
        services,
        notes: buildNotes(status, services)
    }
}

function createHealthService(app) {
    const history = new HealthHistory()
    let cachedSnapshot = null
    let cachedAt = 0
    let inFlight = null
    let previousStatus = null

    async function refreshCurrentSnapshot() {
        const snapshot = await buildSnapshot(app)
        cachedSnapshot = snapshot
        cachedAt = Date.now()
        history.add(snapshot)
        recordMetrics(app, snapshot)

        await persistSnapshot(app, snapshot).catch((error) => {
            app.log.warn({ error }, 'Failed to persist health snapshot to Redis')
        })

        if (previousStatus && previousStatus !== snapshot.status) {
            app.log.warn({ from: previousStatus, to: snapshot.status }, 'Application health status changed')
        }
        previousStatus = snapshot.status

        return snapshot
    }

    return {
        async getCurrentSnapshot() {
            if (cachedSnapshot && Date.now() - cachedAt < config.health.cacheTtlMs) {
                return cachedSnapshot
            }

            if (!inFlight) {
                inFlight = refreshCurrentSnapshot().finally(() => {
                    inFlight = null
                })
            }

            return inFlight
        },
        async getReadinessSnapshot() {
            const snapshot = await buildSnapshot(app, ['postgres', 'migrations'])
            recordMetrics(app, snapshot)
            return snapshot
        },
        async getLivenessSnapshot() {
            const snapshot = await buildSnapshot(app, ['event_loop'])
            recordMetrics(app, snapshot)
            return snapshot
        },
        async getHistory(limit) {
            const normalizedLimit = normalizeHistoryLimit(limit)
            const [redisItems, memoryItems] = await Promise.all([
                readRedisHistory(app, normalizedLimit).catch((error) => {
                    app.log.warn({ error }, 'Failed to read health history from Redis')
                    return []
                }),
                Promise.resolve(history.list(normalizedLimit))
            ])

            return mergeHistory([...redisItems, ...memoryItems], normalizedLimit)
        }
    }
}

module.exports = {
    APP_STATUS_VALUE,
    HEALTH_ORDER,
    HealthHistory,
    buildSnapshot,
    checkWorkerConsumers,
    createHealthService,
    determineStatus,
    metricResultFor,
    normalizeHistoryLimit,
    redactSensitive
}
