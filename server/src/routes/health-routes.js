const crypto = require('node:crypto')
const fp = require('fastify-plugin')
const config = require('../config')
const { createHealthService, normalizeHistoryLimit } = require('../services/health-service')

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''))
    const rightBuffer = Buffer.from(String(right || ''))

    if (leftBuffer.length !== rightBuffer.length) {
        return false
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function getPresentedApiKey(request) {
    const headerKey = request.headers['x-health-api-key']
    if (headerKey) {
        return Array.isArray(headerKey) ? headerKey[0] : headerKey
    }

    const authorization = request.headers.authorization || ''
    const match = authorization.match(/^Bearer\s+(.+)$/i)
    return match ? match[1] : ''
}

function normalizeIp(value) {
    return String(value || '')
        .split(',')[0]
        .trim()
        .replace(/^::ffff:/, '')
}

function isPrivateIp(ip) {
    const normalized = normalizeIp(ip)

    if (!normalized || normalized === '::1' || normalized === '127.0.0.1' || normalized === 'localhost') {
        return true
    }

    if (normalized.startsWith('10.') || normalized.startsWith('192.168.')) {
        return true
    }

    const parts = normalized.split('.').map(Number)
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
        return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31
    }

    return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
}

function isHistoryAuthorized(request) {
    if (config.health.historyApiKey && safeEqual(getPresentedApiKey(request), config.health.historyApiKey)) {
        return true
    }

    if (!config.health.historyAllowPrivateNetwork) {
        return false
    }

    const forwardedFor = request.headers['x-forwarded-for']
    const clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor

    return isPrivateIp(clientIp || request.ip)
}

function statusCodeFor(snapshot) {
    return snapshot.status === 'unhealthy' ? 503 : 200
}

function renderStatusPage() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transit Grid Status</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f8fa;
      color: #17202a;
    }
    body { margin: 0; }
    main { max-width: 1120px; margin: 0 auto; padding: 32px 20px 56px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    h1 { font-size: clamp(28px, 4vw, 42px); margin: 0; letter-spacing: 0; }
    .stamp { color: #667085; font-size: 14px; }
    .banner { border-left: 6px solid #0f9f6e; background: #ffffff; padding: 18px 20px; margin-bottom: 22px; box-shadow: 0 1px 8px rgba(16, 24, 40, 0.08); }
    .banner.degraded { border-color: #d98b00; }
    .banner.unhealthy { border-color: #d14343; }
    .banner strong { display: block; font-size: 22px; text-transform: capitalize; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card { background: #ffffff; border: 1px solid #d9dee7; border-radius: 8px; padding: 14px 16px; min-height: 116px; }
    .card h2 { display: flex; justify-content: space-between; gap: 10px; margin: 0 0 12px; font-size: 16px; letter-spacing: 0; }
    .pill { border-radius: 999px; padding: 3px 8px; font-size: 12px; color: #fff; background: #0f9f6e; }
    .pill.degraded, .pill.skipped { background: #d98b00; }
    .pill.down { background: #d14343; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; margin: 0; color: #475467; font-size: 13px; }
    dd { margin: 0; text-align: right; color: #17202a; overflow-wrap: anywhere; }
    .timeline { margin-top: 24px; background: #ffffff; border: 1px solid #d9dee7; border-radius: 8px; overflow: hidden; }
    .timeline h2 { margin: 0; padding: 16px; font-size: 18px; border-bottom: 1px solid #d9dee7; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 11px 16px; text-align: left; border-bottom: 1px solid #eef1f5; }
    th { color: #667085; font-weight: 600; }
    @media (prefers-color-scheme: dark) {
      :root { background: #111827; color: #f2f4f7; }
      .banner, .card, .timeline { background: #182230; border-color: #344054; box-shadow: none; }
      .stamp, dl, th { color: #98a2b3; }
      dd { color: #f2f4f7; }
      th, td, .timeline h2 { border-color: #344054; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Transit Grid Status</h1>
      <div class="stamp" id="stamp"></div>
    </header>
    <section class="banner" id="banner"><strong>Loading</strong><span id="notes"></span></section>
    <section class="grid" id="services"></section>
    <section class="timeline">
      <h2>Timeline</h2>
      <table>
        <thead><tr><th>Time</th><th>Status</th><th>Services</th></tr></thead>
        <tbody id="history"><tr><td colspan="3">Loading</td></tr></tbody>
      </table>
    </section>
  </main>
  <script>
    const serviceGrid = document.getElementById('services')
    const banner = document.getElementById('banner')
    const historyBody = document.getElementById('history')
    const stamp = document.getElementById('stamp')
    const notes = document.getElementById('notes')

    function formatTime(value) {
      return new Date(value).toLocaleString()
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char])
    }

    function renderServices(services) {
      serviceGrid.innerHTML = Object.entries(services).map(([name, service]) => {
        const latency = Number.isFinite(service.latency_ms) ? service.latency_ms + ' ms' : 'n/a'
        const error = service.error ? '<dt>Error</dt><dd>' + escapeHtml(service.error) + '</dd>' : ''
        return '<article class="card"><h2>' + escapeHtml(name) + '<span class="pill ' + escapeHtml(service.status) + '">' + escapeHtml(service.status) + '</span></h2><dl><dt>Latency</dt><dd>' + escapeHtml(latency) + '</dd><dt>Critical</dt><dd>' + escapeHtml(service.critical) + '</dd>' + error + '</dl></article>'
      }).join('')
    }

    async function refresh() {
      const health = await fetch('/health').then((response) => response.json())
      banner.className = 'banner ' + health.status
      banner.querySelector('strong').textContent = health.status
      notes.textContent = health.notes || ''
      stamp.textContent = formatTime(health.timestamp)
      renderServices(health.services || {})

      try {
        const history = await fetch('/health/history?limit=25').then((response) => {
          if (!response.ok) throw new Error('unavailable')
          return response.json()
        })
        historyBody.innerHTML = history.timeline.map((item) => {
          const degraded = Object.entries(item.services || {}).filter(([, service]) => service.status !== 'up').map(([name]) => name)
          return '<tr><td>' + escapeHtml(formatTime(item.timestamp)) + '</td><td>' + escapeHtml(item.status) + '</td><td>' + escapeHtml(degraded.join(', ') || 'all up') + '</td></tr>'
        }).join('') || '<tr><td colspan="3">No snapshots yet</td></tr>'
      } catch (_error) {
        historyBody.innerHTML = '<tr><td colspan="3">History is protected</td></tr>'
      }
    }

    refresh()
    setInterval(refresh, 10000)
  </script>
</body>
</html>`
}

async function healthRoutes(app) {
    const health = createHealthService(app)
    app.decorate('health', health)

    app.get('/health', async (_request, reply) => {
        const snapshot = await health.getCurrentSnapshot()
        reply.header('cache-control', `private, max-age=${Math.floor(config.health.cacheTtlMs / 1000)}`)
        reply.code(statusCodeFor(snapshot))
        return snapshot
    })

    app.get('/health/ready', async (_request, reply) => {
        const snapshot = await health.getReadinessSnapshot()
        reply.code(snapshot.status === 'healthy' ? 200 : 503)
        return snapshot
    })

    app.get('/health/live', async (_request, reply) => {
        const snapshot = await health.getLivenessSnapshot()
        reply.code(statusCodeFor(snapshot))
        return snapshot
    })

    app.get('/health/history', async (request, reply) => {
        if (!isHistoryAuthorized(request)) {
            return reply.code(401).send({ message: 'Health history is protected' })
        }

        const limit = normalizeHistoryLimit(request.query?.limit)
        return {
            limit,
            timeline: await health.getHistory(limit)
        }
    })

    app.get('/status', async (_request, reply) => {
        reply.type('text/html')
        return renderStatusPage()
    })
}

module.exports = fp(healthRoutes)
module.exports.isPrivateIp = isPrivateIp
module.exports.isHistoryAuthorized = isHistoryAuthorized
