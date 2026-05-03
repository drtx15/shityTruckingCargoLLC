import { useEffect, useState } from 'react'
import { getAnalyticsOverview } from '../api'

function formatPercent(value) {
    if (value === null || value === undefined) return 'N/A'
    return `${Math.round(value * 100)}%`
}

function AnalyticsPage() {
    const [overview, setOverview] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        getAnalyticsOverview().then(setOverview).catch((err) => setError(err.message))
    }, [])

    if (error) return <p className="error-text">{error}</p>
    if (!overview) return <p>Loading analytics...</p>

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Executive dashboard</p>
                    <h2>Analytics</h2>
                </div>
            </div>
            <div className="metrics-grid">
                <div className="metric-card"><span>Total shipments</span><strong>{overview.totalShipments}</strong></div>
                <div className="metric-card"><span>Late shipments</span><strong>{overview.lateShipments}</strong></div>
                <div className="metric-card"><span>Delivered</span><strong>{overview.deliveredShipments}</strong></div>
                <div className="metric-card"><span>Active trucks</span><strong>{overview.activeTrucks}</strong></div>
                <div className="metric-card"><span>Webhook success</span><strong>{formatPercent(overview.webhookSuccessRate)}</strong></div>
                <div className="metric-card"><span>Fleet utilization</span><strong>{formatPercent(overview.fleetUtilization)}</strong></div>
                <div className="metric-card"><span>Avg ETA error</span><strong>{overview.averageEtaAccuracyMinutes === null ? 'N/A' : `${overview.averageEtaAccuracyMinutes.toFixed(1)} min`}</strong></div>
            </div>
        </section>
    )
}

export default AnalyticsPage
