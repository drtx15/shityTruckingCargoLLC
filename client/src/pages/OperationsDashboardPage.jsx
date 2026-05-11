import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAnalyticsOverview, getEtaHistory, getShipments, getWebhookAttempts } from '../api'
import MetricStrip from '../components/MetricStrip'

function OperationsDashboardPage() {
    const [shipments, setShipments] = useState([])
    const [etaHistory, setEtaHistory] = useState([])
    const [webhookAttempts, setWebhookAttempts] = useState([])
    const [overview, setOverview] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([
            getShipments(),
            getEtaHistory(),
            getWebhookAttempts(),
            getAnalyticsOverview(),
        ])
            .then(([shipmentData, etaData, webhookData, overviewData]) => {
                setShipments(shipmentData)
                setEtaHistory(etaData)
                setWebhookAttempts(webhookData)
                setOverview(overviewData)
            })
            .catch((err) => setError(err.message))
    }, [])

    const exceptionQueue = useMemo(() => {
        return shipments
            .filter((shipment) => shipment.status === 'DELAYED' || shipment.isPaused || shipment.estimatedAt && new Date(shipment.estimatedAt) < new Date())
            .slice(0, 8)
    }, [shipments])

    const failedWebhooks = webhookAttempts.filter((attempt) => attempt.state === 'FAILED' || attempt.state === 'RETRYING')

    return (
        <section className="role-page">
            <div className="command-bar operations-hero">
                <div>
                    <p className="eyebrow">Operations control room</p>
                    <h2>Exception desk</h2>
                </div>
                <div className="hero-actions">
                    <Link className="text-action" to="/operations/webhooks">Webhook ops</Link>
                    <Link className="text-action" to="/operations/analytics">Analytics</Link>
                </div>
            </div>

            {error && <p className="error-text">{error}</p>}

            <MetricStrip
                items={[
                    { label: 'System loads', value: overview?.totalShipments ?? shipments.length },
                    { label: 'Late loads', value: overview?.lateShipments ?? exceptionQueue.length, tone: exceptionQueue.length ? 'risk' : '' },
                    { label: 'Active trucks', value: overview?.activeTrucks ?? 'N/A' },
                    { label: 'Webhook incidents', value: failedWebhooks.length, tone: failedWebhooks.length ? 'risk' : '' },
                    { label: 'ETA recalcs', value: etaHistory.length }
                ]}
            />

            <div className="role-grid">
                <div className="panel">
                    <h2>Exception queue</h2>
                    <div className="data-list">
                        {exceptionQueue.map((shipment) => (
                            <Link key={shipment.id} to={`/shipments/${shipment.id}`} className="data-row compact-row">
                                <strong>{shipment.trackingCode}</strong>
                                <span>{shipment.status}</span>
                                <span>{shipment.priority}</span>
                                <span>{shipment.delayReason || (shipment.isPaused ? 'Paused' : 'ETA risk')}</span>
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="panel">
                    <h2>Integration incidents</h2>
                    <div className="data-list">
                        {failedWebhooks.slice(0, 8).map((attempt) => (
                            <div key={attempt.id} className="data-row compact-row">
                                <strong>{attempt.eventType}</strong>
                                <span>{attempt.state}</span>
                                <span>{attempt.responseStatus || 'No response'}</span>
                                <span>{attempt.errorMessage || 'Retry scheduled'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default OperationsDashboardPage
