import { useEffect, useState } from 'react'
import { getTrucks } from '../api'

function FleetDriversPage() {
    const [trucks, setTrucks] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getTrucks().then(setTrucks).catch((err) => setError(err.message))
    }, [])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Fleet</p>
                    <h2>Drivers</h2>
                </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="panel data-list">
                {trucks.map((truck) => (
                    <div key={truck.id} className="data-row compact-row">
                        <strong>{truck.driverName || 'Driver TBD'}</strong>
                        <span>{truck.label}</span>
                        <span>{truck.status}</span>
                        <span>{truck.lastUpdatedAt ? new Date(truck.lastUpdatedAt).toLocaleString() : 'No GPS update'}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default FleetDriversPage
