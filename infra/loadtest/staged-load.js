const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const API_BASE = process.env.LOADTEST_API_BASE || 'http://127.0.0.1:8080/api'
const STAGE_TARGETS = [10, 20, 30, 40, 50]
const PASSWORD = 'LoadtestPass123!'
const STAGE_SAMPLE_SECONDS = Number(process.env.LOADTEST_STAGE_SAMPLE_SECONDS || 20)
const SAMPLE_INTERVAL_MS = Number(process.env.LOADTEST_SAMPLE_INTERVAL_MS || 5000)

const serviceContainers = [
    'lt-client',
    'lt-api-1',
    'lt-api-2',
    'lt-worker-1',
    'lt-worker-2',
    'lt-postgres',
    'lt-minio',
    'lt-redis',
    'lt-rabbitmq',
    'lt-simulator',
    'lt-osrm-mock',
]

const cities = [
    ['Tashkent', 41.3111, 69.2797],
    ['Samarkand', 39.6542, 66.9597],
    ['Bukhara', 39.7681, 64.4556],
    ['Nukus', 42.4619, 59.6166],
    ['Andijan', 40.7821, 72.3442],
    ['Fergana', 40.3894, 71.7847],
    ['Namangan', 40.9983, 71.6726],
    ['Urgench', 41.5500, 60.6333],
    ['Termez', 37.2242, 67.2783],
    ['Jizzakh', 40.1158, 67.8422],
]

const state = {
    users: [],
    customers: [],
    carriers: [],
    brokers: [],
    trucks: [],
    shipments: [],
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function percentile(values, p) {
    if (!values.length) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1))
    return sorted[index]
}

function simulatedIp(index) {
    return `10.55.${Math.floor(index / 250)}.${(index % 250) + 1}`
}

async function api(pathname, options = {}) {
    const started = performance.now()
    const headers = {
        accept: 'application/json',
        ...(options.headers || {}),
    }

    if (options.token) {
        headers.authorization = `Bearer ${options.token}`
    }

    if (options.ip) {
        headers['x-forwarded-for'] = options.ip
    }

    let body = options.body
    if (body !== undefined && body !== null && typeof body !== 'string') {
        headers['content-type'] = 'application/json'
        body = JSON.stringify(body)
    }

    const response = await fetch(`${API_BASE}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body,
    })
    const text = await response.text()
    const latencyMs = performance.now() - started
    let payload = null
    if (text) {
        try {
            payload = JSON.parse(text)
        } catch {
            payload = { raw: text }
        }
    }

    if (!response.ok) {
        const error = new Error(payload?.message || `HTTP ${response.status}`)
        error.status = response.status
        error.payload = payload
        error.latencyMs = latencyMs
        throw error
    }

    return { payload, latencyMs, status: response.status }
}

async function registerOrLogin(index) {
    const typeCycle = index % 5
    const isCarrier = typeCycle === 3
    const isBroker = typeCycle === 4
    const organizationType = isCarrier ? 'CARRIER' : isBroker ? 'BROKER' : 'SHIPPER'
    const role = organizationType === 'CARRIER' ? 'FLEET_MANAGER' : organizationType === 'BROKER' ? 'BROKER' : 'CUSTOMER'
    const email = `loadtest-${String(index + 1).padStart(3, '0')}@transitgrid.local`
    const body = {
        email,
        password: PASSWORD,
        displayName: `${role.toLowerCase()} ${index + 1}`,
        title: role === 'CUSTOMER' ? 'Shipping coordinator' : role === 'BROKER' ? 'Freight broker' : 'Fleet manager',
        organizationType,
        organizationName: `${organizationType} Loadtest ${index + 1}`,
        companyName: `${organizationType} Loadtest ${index + 1}`,
        dotNumber: organizationType === 'SHIPPER' ? undefined : String(900000 + index),
        docketPrefix: organizationType === 'BROKER' ? 'MC' : undefined,
        docketNumber: organizationType === 'BROKER' ? String(700000 + index) : undefined,
    }

    try {
        const { payload } = await api('/auth/register', {
            method: 'POST',
            body,
            ip: simulatedIp(index),
        })
        return { ...payload, role, email, ip: simulatedIp(index) }
    } catch (error) {
        if (error.status !== 409) {
            throw error
        }

        const { payload } = await api('/auth/login', {
            method: 'POST',
            body: { email, password: PASSWORD },
            ip: simulatedIp(index),
        })
        return { ...payload, role, email, ip: simulatedIp(index) }
    }
}

async function ensureUsers(target) {
    while (state.users.length < target) {
        const index = state.users.length
        const user = await registerOrLogin(index)
        state.users.push(user)
        if (user.user.role === 'CUSTOMER') state.customers.push(user)
        if (user.user.role === 'FLEET_MANAGER') state.carriers.push(user)
        if (user.user.role === 'BROKER') state.brokers.push(user)
        process.stdout.write(`  user ${state.users.length}/${target} ${user.user.role}\n`)
    }
}

async function ensureTrucks(target) {
    if (!state.carriers.length) {
        throw new Error('No carrier/fleet manager account available for truck creation')
    }

    while (state.trucks.length < target) {
        const index = state.trucks.length
        const carrier = state.carriers[index % state.carriers.length]
        const { payload } = await api('/trucks', {
            method: 'POST',
            token: carrier.token,
            ip: carrier.ip,
            body: {
                label: `LT-${String(index + 1).padStart(3, '0')}`,
                driverName: `Driver ${index + 1}`,
                maxWeightKg: 12000 + (index % 5) * 1500,
            },
        })
        state.trucks.push(payload)
        process.stdout.write(`  truck ${state.trucks.length}/${target}\n`)
    }
}

function routeFor(index) {
    const origin = cities[index % cities.length]
    const destination = cities[(index * 3 + 4) % cities.length]
    const offset = (index % 7) * 0.002
    return {
        originLat: origin[1] + offset,
        originLng: origin[2] + offset,
        originLabel: `${origin[0]} loadtest yard ${index + 1}`,
        destinationLat: destination[1] - offset,
        destinationLng: destination[2] - offset,
        destinationLabel: `${destination[0]} consignee ${index + 1}`,
    }
}

async function ensureShipments(target) {
    if (!state.customers.length) {
        throw new Error('No customer account available for shipment creation')
    }

    while (state.shipments.length < target) {
        const index = state.shipments.length
        const customer = state.customers[index % state.customers.length]
        const route = routeFor(index)
        const { payload } = await api('/shipments', {
            method: 'POST',
            token: customer.token,
            ip: customer.ip,
            body: {
                ...route,
                priority: index % 6 === 0 ? 'URGENT' : index % 3 === 0 ? 'EXPRESS' : 'STANDARD',
                cargoDescription: `Loadtest cargo ${index + 1}`,
                weightKg: 900 + (index % 12) * 250,
            },
        })
        state.shipments.push(payload)
        process.stdout.write(`  shipment ${state.shipments.length}/${target}\n`)
    }
}

async function assignUnassignedShipments(target) {
    if (!state.carriers.length) {
        throw new Error('No carrier/fleet manager account available for assignment')
    }

    for (let index = 0; index < target; index += 1) {
        const shipment = state.shipments[index]
        const truck = state.trucks[index]
        if (!shipment || !truck || shipment.assignedTruckId) {
            continue
        }
        const carrier = state.carriers[index % state.carriers.length]
        const { payload } = await api(`/shipments/${shipment.id}/assign-truck`, {
            method: 'POST',
            token: carrier.token,
            ip: carrier.ip,
            body: { truckId: truck.id },
        })
        shipment.assignedTruckId = truck.id
        shipment.trackingCode = payload.shipment.trackingCode
        process.stdout.write(`  assigned shipment ${index + 1}/${target}\n`)
    }
}

function parseMemToMiB(value) {
    const match = String(value).match(/([\d.]+)\s*([KMG]i?)B/i)
    if (!match) return 0
    const number = Number(match[1])
    const unit = match[2].toLowerCase()
    if (unit.startsWith('g')) return number * 1024
    if (unit.startsWith('k')) return number / 1024
    return number
}

function readDockerStats() {
    const output = execFileSync('docker', [
        'stats',
        '--no-stream',
        '--format',
        '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}',
        ...serviceContainers,
    ], { encoding: 'utf8' }).trim()

    return output.split(/\r?\n/).filter(Boolean).map((line) => {
        const [name, cpuRaw, memRaw, memPctRaw] = line.split('\t')
        return {
            name,
            cpu: Number(cpuRaw.replace('%', '')),
            memMiB: parseMemToMiB(memRaw.split('/')[0]),
            memRaw,
            memPct: Number(memPctRaw.replace('%', '')),
        }
    })
}

function readDbCounts() {
    const sql = [
        'SELECT',
        '(SELECT count(*) FROM "User") AS users,',
        '(SELECT count(*) FROM "Truck") AS trucks,',
        '(SELECT count(*) FROM "Shipment") AS shipments,',
        '(SELECT count(*) FROM "TelemetryEvent") AS telemetry,',
        '(SELECT count(*) FROM "Checkpoint") AS checkpoints;',
    ].join(' ')

    const output = execFileSync('docker', [
        'exec',
        '-e',
        'PGPASSWORD=postgres',
        'lt-postgres',
        'psql',
        '-U',
        'postgres',
        '-d',
        'transit_grid',
        '-At',
        '-F',
        ',',
        '-c',
        sql,
    ], { encoding: 'utf8' }).trim()

    const [users, trucks, shipments, telemetry, checkpoints] = output.split(',').map(Number)
    return { users, trucks, shipments, telemetry, checkpoints }
}

function readRabbitQueues() {
    try {
        const output = execFileSync('docker', [
            'exec',
            'lt-rabbitmq',
            'rabbitmqctl',
            'list_queues',
            '-p',
            'transit_grid',
            'name',
            'messages_ready',
            'messages_unacknowledged',
            '--formatter',
            'json',
        ], { encoding: 'utf8' })
        return JSON.parse(output)
    } catch (error) {
        return [{ error: error.message }]
    }
}

function summarizeStats(samples) {
    const byName = new Map()
    for (const sample of samples) {
        for (const stat of sample) {
            if (!byName.has(stat.name)) byName.set(stat.name, [])
            byName.get(stat.name).push(stat)
        }
    }

    return [...byName.entries()].map(([name, values]) => ({
        name,
        avgCpu: values.reduce((sum, value) => sum + value.cpu, 0) / values.length,
        maxCpu: Math.max(...values.map((value) => value.cpu)),
        avgMemMiB: values.reduce((sum, value) => sum + value.memMiB, 0) / values.length,
        maxMemMiB: Math.max(...values.map((value) => value.memMiB)),
        maxMemPct: Math.max(...values.map((value) => value.memPct)),
    })).sort((a, b) => b.avgCpu - a.avgCpu)
}

async function runUserActivity(stageTarget, durationMs) {
    const deadline = Date.now() + durationMs
    const latencies = []
    const errors = []
    const actors = [
        ...state.customers.slice(0, 8),
        ...state.carriers.slice(0, 4),
        ...state.brokers.slice(0, 4),
    ]

    async function loop(actor, offset) {
        while (Date.now() < deadline) {
            const shipment = state.shipments[(offset + latencies.length) % Math.max(1, state.shipments.length)]
            const calls = [
                ['/shipments', { token: actor.token, ip: actor.ip }],
                ['/trucks', { token: actor.token, ip: actor.ip }],
            ]
            if (shipment?.trackingCode) {
                calls.push([`/tracking/code/${encodeURIComponent(shipment.trackingCode)}`, { ip: simulatedIp(1000 + offset) }])
            }

            for (const [pathname, options] of calls) {
                const started = performance.now()
                try {
                    await api(pathname, options)
                    latencies.push(performance.now() - started)
                } catch (error) {
                    if (error.status !== 403) {
                        errors.push(`${pathname}:${error.status || error.message}`)
                    }
                }
            }
            await sleep(1000)
        }
    }

    const activeActors = actors.length ? actors : state.users
    await Promise.all(activeActors.map((actor, index) => loop(actor, index)))
    return {
        requests: latencies.length,
        errors: errors.length,
        p50: percentile(latencies, 0.50),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
        max: latencies.length ? Math.max(...latencies) : 0,
        errorSamples: errors.slice(0, 10),
        stageTarget,
    }
}

async function sampleStage(target) {
    const samples = []
    const activityPromise = runUserActivity(target, STAGE_SAMPLE_SECONDS * 1000)
    const sampleCount = Math.max(1, Math.ceil((STAGE_SAMPLE_SECONDS * 1000) / SAMPLE_INTERVAL_MS))
    for (let index = 0; index < sampleCount; index += 1) {
        samples.push(readDockerStats())
        await sleep(SAMPLE_INTERVAL_MS)
    }
    const activity = await activityPromise
    return {
        target,
        stats: summarizeStats(samples),
        db: readDbCounts(),
        queues: readRabbitQueues(),
        activity,
    }
}

async function waitForReady() {
    for (let attempt = 0; attempt < 90; attempt += 1) {
        try {
            await api('/health/ready')
            return
        } catch {
            await sleep(2000)
        }
    }
    throw new Error('Gateway API did not become ready')
}

async function main() {
    const results = []
    await waitForReady()

    for (const target of STAGE_TARGETS) {
        console.log(`\n=== STAGE ${target} USERS/TRUCKS/SHIPMENTS ===`)
        console.log('Creating accounts sequentially...')
        await ensureUsers(target)
        console.log('Creating trucks sequentially...')
        await ensureTrucks(target)
        console.log('Creating shipments sequentially...')
        await ensureShipments(target)
        console.log('Assigning trucks and starting simulations...')
        await assignUnassignedShipments(target)
        console.log(`Sampling ${STAGE_SAMPLE_SECONDS}s of live activity...`)
        const result = await sampleStage(target)
        results.push(result)
        console.log(JSON.stringify({
            target,
            topCpu: result.stats.slice(0, 4).map((item) => ({
                name: item.name,
                avgCpu: Number(item.avgCpu.toFixed(2)),
                maxCpu: Number(item.maxCpu.toFixed(2)),
                maxMemMiB: Number(item.maxMemMiB.toFixed(1)),
            })),
            db: result.db,
            activity: {
                requests: result.activity.requests,
                errors: result.activity.errors,
                p95: Number(result.activity.p95.toFixed(1)),
                p99: Number(result.activity.p99.toFixed(1)),
            },
        }, null, 2))
    }

    const outDir = path.resolve('infra/loadtest/results')
    fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, `staged-load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(outPath, JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2))
    console.log(`\nRESULT_FILE=${outPath}`)
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
