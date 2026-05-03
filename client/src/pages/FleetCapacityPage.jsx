import { useEffect, useMemo, useState } from 'react'
import { getTrucks } from '../api'

function FleetCapacityPage() {
    const [trucks, setTrucks] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getTrucks().then(setTrucks).catch((err) => setError(err.message))
    }, [])

    const totals = useMemo(() => trucks.reduce((sum, truck) => ({
        load: sum.load + Number(truck.currentLoadKg || 0),
        max: sum.max + Number(truck.maxWeightKg || 0)
    }), { load: 0, max: 0 }), [trucks])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Fleet</p>
                    <h2>Capacity</h2>
                </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="metrics-grid">
                <div className="metric-card"><span>Total capacity</span><strong>{Math.round(totals.max)} kg</strong></div>
                <div className="metric-card"><span>Current load</span><strong>{Math.round(totals.load)} kg</strong></div>
                <div className="metric-card"><span>Utilization</span><strong>{totals.max ? `${Math.round((totals.load / totals.max) * 100)}%` : '0%'}</strong></div>
            </div>
            <div className="panel data-list">
                {trucks.map((truck) => (
                    <div key={truck.id} className="data-row compact-row">
                        <strong>{truck.label}</strong>
                        <span>{Math.round(truck.currentLoadKg || 0)} kg loaded</span>
                        <span>{Math.round(truck.maxWeightKg || 0)} kg max</span>
                        <span>{truck.status}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default FleetCapacityPage
