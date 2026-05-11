const assert = require('node:assert/strict')
const test = require('node:test')
const {
    HealthHistory,
    determineStatus,
    metricResultFor,
    normalizeHistoryLimit,
    redactSensitive
} = require('../src/services/health-service')

test('determineStatus marks critical failures as unhealthy', () => {
    const status = determineStatus({
        postgres: { status: 'down', critical: true },
        redis: { status: 'up', critical: false }
    })

    assert.equal(status, 'unhealthy')
})

test('determineStatus marks warning checks as degraded', () => {
    const status = determineStatus({
        postgres: { status: 'up', critical: true },
        osrm: { status: 'degraded', critical: false }
    })

    assert.equal(status, 'degraded')
})

test('determineStatus ignores skipped optional checks', () => {
    const status = determineStatus({
        postgres: { status: 'up', critical: true },
        redis: { status: 'skipped', critical: false }
    })

    assert.equal(status, 'healthy')
})

test('HealthHistory keeps the latest snapshots within limit and retention', () => {
    const history = new HealthHistory({ limit: 2, retentionMs: 1000 })
    const now = Date.now()
    history.add({ timestamp: new Date(now - 200).toISOString(), status: 'healthy', services: {} })
    history.add({ timestamp: new Date(now - 100).toISOString(), status: 'degraded', services: {} })
    history.add({ timestamp: new Date(now).toISOString(), status: 'healthy', services: {} })

    assert.deepEqual(history.list(5).map((item) => item.status), ['degraded', 'healthy'])

    history.prune(now + 2000)
    assert.deepEqual(history.list(5), [])
})

test('health helpers redact connection secrets and normalize limits', () => {
    assert.equal(
        redactSensitive('postgresql://user:pass@postgres:5432/app?password=secret'),
        'postgresql://<redacted>@postgres:5432/app?password=<redacted>'
    )
    assert.equal(normalizeHistoryLimit('2'), 2)
    assert.equal(metricResultFor({ status: 'down' }), 'fail')
    assert.equal(metricResultFor({ status: 'degraded' }), 'warn')
    assert.equal(metricResultFor({ status: 'up' }), 'ok')
})
