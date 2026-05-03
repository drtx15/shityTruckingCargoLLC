const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http')
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')

let sdk = null

function startTelemetry(serviceName = 'logistics-backend') {
    if (sdk || process.env.OTEL_ENABLED === 'false') {
        return
    }

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318'

    sdk = new NodeSDK({
        serviceName,
        traceExporter: new OTLPTraceExporter({
            url: `${endpoint.replace(/\/$/, '')}/v1/traces`
        }),
        metricReader: new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
                url: `${endpoint.replace(/\/$/, '')}/v1/metrics`
            }),
            exportIntervalMillis: 15000
        }),
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': { enabled: false }
            })
        ]
    })

    sdk.start()
}

function shutdownTelemetry() {
    return sdk?.shutdown?.()
}

module.exports = {
    shutdownTelemetry,
    startTelemetry
}
