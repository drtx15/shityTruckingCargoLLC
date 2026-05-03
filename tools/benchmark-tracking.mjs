const apiBase = process.env.API_BASE_URL || 'http://localhost:3000'
const shipmentId = process.env.SHIPMENT_ID || '1'
const iterations = Number(process.env.ITERATIONS || 100)

async function timeRequest(url) {
  const started = performance.now()
  const response = await fetch(url)
  await response.text()
  return {
    ok: response.ok,
    ms: performance.now() - started
  }
}

async function run(label, url) {
  const timings = []
  for (let i = 0; i < iterations; i += 1) {
    const result = await timeRequest(url)
    if (result.ok) timings.push(result.ms)
  }

  const average = timings.reduce((sum, value) => sum + value, 0) / Math.max(1, timings.length)
  timings.sort((a, b) => a - b)
  const p95 = timings[Math.floor(timings.length * 0.95)] || 0

  return { label, count: timings.length, averageMs: Number(average.toFixed(2)), p95Ms: Number(p95.toFixed(2)) }
}

const url = `${apiBase}/tracking/${shipmentId}`
const result = await run('tracking-read', url)
console.log(JSON.stringify(result, null, 2))
