import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShipments, getShippers } from '../api'
import MetricStrip from '../components/MetricStrip'

function BrokerDashboardPage() {
    const [shipments, setShipments] = useState([])
    const [shippers, setShippers] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([
            getShipments(),
            getShippers(),
        ])
            .then(([shipmentData, shipperData]) => {
                setShipments(shipmentData)
                setShippers(shipperData)
            })
            .catch((err) => setError(err.message))
    }, [])

    const brokerStats = useMemo(() => {
        const openLoads = shipments.filter((shipment) => shipment.status !== 'ARRIVED' && shipment.status !== 'CANCELLED')
        return {
            openLoads: openLoads.length,
            delayedLoads: shipments.filter((shipment) => shipment.status === 'DELAYED').length,
            urgentLoads: shipments.filter((shipment) => shipment.priority === 'URGENT').length,
            activeShippers: shippers.filter((shipper) => shipper.isActive !== false).length,
        }
    }, [shipments, shippers])

    const priorityLoads = shipments
        .filter((shipment) => shipment.status !== 'ARRIVED')
        .sort((left, right) => {
            const order = { URGENT: 0, EXPRESS: 1, STANDARD: 2 }
            return (order[left.priority] ?? 3) - (order[right.priority] ?? 3)
        })
        .slice(0, 8)

    return (
        <section className="role-page">
            <div className="command-bar broker-hero">
                <div>
                    <p className="eyebrow">Broker workspace</p>
                    <h2>Commercial desk</h2>
                </div>
                <div className="hero-actions">
                    <Link className="text-action" to="/broker/orders/new">Create order</Link>
                    <Link className="text-action" to="/broker/customers">Manage customers</Link>
                </div>
            </div>

            {error && <p className="error-text">{error}</p>}

            <MetricStrip
                items={[
                    { label: 'Open loads', value: brokerStats.openLoads },
                    { label: 'Delayed loads', value: brokerStats.delayedLoads, tone: brokerStats.delayedLoads ? 'risk' : '' },
                    { label: 'Urgent loads', value: brokerStats.urgentLoads },
                    { label: 'Active shippers', value: brokerStats.activeShippers }
                ]}
            />

            <div className="role-grid">
                <div className="panel">
                    <div className="page-heading">
                        <div>
                            <p className="eyebrow">Commercial desk</p>
                            <h2>Priority load board</h2>
                        </div>
                    </div>
                    <div className="data-list">
                        {priorityLoads.map((shipment) => (
                            <Link key={shipment.id} to={`/broker/orders/${shipment.id}`} className="data-row compact-row">
                                <strong>{shipment.trackingCode}</strong>
                                <span>{shipment.priority}</span>
                                <span>{shipment.status}</span>
                                <span>{shipment.shipper?.companyName || 'No shipper'}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="panel">
                    <div className="page-heading">
                        <div>
                            <p className="eyebrow">Account health</p>
                            <h2>Shipper portfolio</h2>
                        </div>
                    </div>
                    <div className="data-list">
                        {shippers.slice(0, 6).map((shipper) => (
                            <Link key={shipper.id} to={`/broker/customers/${shipper.id}`} className="data-row compact-row">
                                <strong>{shipper.companyName}</strong>
                                <span>{shipper.contactEmail}</span>
                                <span>{shipper._count?.shipments || 0} loads</span>
                                <span>{shipper.isActive === false ? 'Paused' : 'Active'}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default BrokerDashboardPage
