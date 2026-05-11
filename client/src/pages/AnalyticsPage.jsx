import { useEffect, useState } from 'react'
import { getAnalyticsOverview } from '../api'
import MetricStrip from '../components/MetricStrip'

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
            <MetricStrip
                items={[
                    { label: 'Total shipments', value: overview.totalShipments },
                    { label: 'Late shipments', value: overview.lateShipments, tone: overview.lateShipments ? 'risk' : '' },
                    { label: 'Delivered', value: overview.deliveredShipments },
                    { label: 'Active trucks', value: overview.activeTrucks },
                    { label: 'Webhook success', value: formatPercent(overview.webhookSuccessRate) },
                    { label: 'Fleet utilization', value: formatPercent(overview.fleetUtilization) },
                    { label: 'Avg ETA error', value: overview.averageEtaAccuracyMinutes === null ? 'N/A' : `${overview.averageEtaAccuracyMinutes.toFixed(1)} min` }
                ]}
            />
        </section>
    )
}

export default AnalyticsPage
