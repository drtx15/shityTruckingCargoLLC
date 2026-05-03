import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShipments, getTrucks } from '../api'

function FleetDashboardPage() {
    const [trucks, setTrucks] = useState([])
    const [shipments, setShipments] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([getTrucks(), getShipments()])
            .then(([truckData, shipmentData]) => {
                setTrucks(truckData)
                setShipments(shipmentData)
            })
            .catch((err) => setError(err.message))
    }, [])

    const stats = useMemo(() => {
        const activeStatuses = new Set(['ASSIGNED', 'MOVING', 'REST'])
        return {
            total: trucks.length,
            idle: trucks.filter((truck) => truck.status === 'IDLE').length,
            active: trucks.filter((truck) => activeStatuses.has(truck.status)).length,
            overloadedRisk: trucks.filter((truck) => Number(truck.currentLoadKg || 0) > Number(truck.maxWeightKg || 0) * 0.85).length,
            assignedLoads: shipments.filter((shipment) => shipment.assignedTruckId).length,
        }
    }, [trucks, shipments])

    const activeLoads = shipments
        .filter((shipment) => shipment.assignedTruck)
        .slice(0, 8)

    return (
        <section className="role-page">
            <div className="role-hero fleet-hero">
                <div>
                    <p className="eyebrow">Fleet manager workspace</p>
                    <h2>See capacity, truck status, and delivery handoff work.</h2>
                    <p>For the fleet manager who decides which truck can move which load and keeps drivers out of overload trouble.</p>
                </div>
                <div className="hero-actions">
                    <Link className="text-action" to="/fleet/trucks">Manage fleet</Link>
                    <Link className="text-action" to="/fleet/proof-of-delivery">Delivery proof</Link>
                </div>
            </div>

            {error && <p className="error-text">{error}</p>}

            <div className="metrics-grid">
                <div className="metric-card"><span>Total trucks</span><strong>{stats.total}</strong></div>
                <div className="metric-card"><span>Idle trucks</span><strong>{stats.idle}</strong></div>
                <div className="metric-card"><span>Active trucks</span><strong>{stats.active}</strong></div>
                <div className="metric-card"><span>High-load trucks</span><strong>{stats.overloadedRisk}</strong></div>
                <div className="metric-card"><span>Assigned loads</span><strong>{stats.assignedLoads}</strong></div>
            </div>

            <div className="role-grid">
                <div className="panel">
                    <h2>Fleet board</h2>
                    <div className="data-list">
                        {trucks.map((truck) => (
                            <div key={truck.id} className="data-row compact-row">
                                <strong>{truck.label}</strong>
                                <span>{truck.driverName || 'Driver TBD'}</span>
                                <span>{truck.status}</span>
                                <span>{Math.round(truck.currentLoadKg || 0)} / {Math.round(truck.maxWeightKg || 0)} kg</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="panel">
                    <h2>Loads on wheels</h2>
                    <div className="data-list">
                        {activeLoads.map((shipment) => (
                            <Link key={shipment.id} to={`/shipments/${shipment.id}`} className="data-row compact-row">
                                <strong>{shipment.trackingCode}</strong>
                                <span>{shipment.assignedTruck?.label}</span>
                                <span>{shipment.status}</span>
                                <span>{shipment.weightKg || 0} kg</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default FleetDashboardPage
