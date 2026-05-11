import { useEffect, useMemo, useState } from 'react'
import { getTrucks } from '../api'
import { TruckIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

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
            <MetricStrip
                items={[
                    { label: 'Total capacity', value: `${Math.round(totals.max)} kg`, icon: TruckIcon },
                    { label: 'Current load', value: `${Math.round(totals.load)} kg` },
                    { label: 'Utilization', value: totals.max ? `${Math.round((totals.load / totals.max) * 100)}%` : '0%' }
                ]}
            />
            <div className="panel">
                <div className="table-header">
                    <span>Truck</span>
                    <span>Loaded</span>
                    <span>Max</span>
                    <span>Status</span>
                </div>
                <div className="data-list">
                    {trucks.map((truck) => (
                        <div key={truck.id} className="data-row compact-row">
                            <strong>{truck.label}</strong>
                            <span>{Math.round(truck.currentLoadKg || 0)} kg loaded</span>
                            <span>{Math.round(truck.maxWeightKg || 0)} kg max</span>
                            <StatusIndicator status={truck.status} />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default FleetCapacityPage
