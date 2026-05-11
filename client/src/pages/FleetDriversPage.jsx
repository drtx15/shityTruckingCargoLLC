import { useEffect, useMemo, useState } from 'react'
import { getTrucks } from '../api'
import { SignalIcon, TruckIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

function FleetDriversPage() {
    const [trucks, setTrucks] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getTrucks().then(setTrucks).catch((err) => setError(err.message))
    }, [])

    const stats = useMemo(() => ({
        linkedDrivers: trucks.filter((truck) => truck.driverName).length,
        moving: trucks.filter((truck) => truck.status === 'MOVING').length,
        stale: trucks.filter((truck) => !truck.lastUpdatedAt).length
    }), [trucks])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Fleet</p>
                    <h2>Driver roster</h2>
                </div>
            </div>
            <MetricStrip
                items={[
                    { label: 'Linked drivers', value: stats.linkedDrivers, icon: TruckIcon },
                    { label: 'Moving', value: stats.moving, icon: SignalIcon, state: stats.moving ? 'live' : '' },
                    { label: 'No GPS', value: stats.stale, tone: stats.stale ? 'risk' : '' }
                ]}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="panel">
                <div className="table-header">
                    <span>Driver</span>
                    <span>Truck</span>
                    <span>Status</span>
                    <span>Last GPS</span>
                </div>
                <div className="data-list">
                    {trucks.map((truck) => (
                        <div key={truck.id} className="data-row compact-row">
                            <strong>{truck.driverName || 'Driver TBD'}</strong>
                            <span>{truck.label}</span>
                            <StatusIndicator status={truck.status} />
                            <span>{truck.lastUpdatedAt ? new Date(truck.lastUpdatedAt).toLocaleString() : 'No GPS update'}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default FleetDriversPage
