import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShippers, getShipments, getWebhookSubscriptions } from '../api'

function ShipperPortalPage() {
    const [shippers, setShippers] = useState([])
    const [shipments, setShipments] = useState([])
    const [subscriptions, setSubscriptions] = useState([])
    const [selectedShipperId, setSelectedShipperId] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([getShippers(), getShipments(), getWebhookSubscriptions()])
            .then(([shipperData, shipmentData, subscriptionData]) => {
                setShippers(shipperData)
                setShipments(shipmentData)
                setSubscriptions(subscriptionData)
                setSelectedShipperId(String(shipperData[0]?.id || ''))
            })
            .catch((err) => setError(err.message))
    }, [])

    const selectedShipper = shippers.find((shipper) => String(shipper.id) === selectedShipperId)
    const shipperShipments = useMemo(() => {
        return shipments.filter((shipment) => String(shipment.shipperId || shipment.shipper?.id || '') === selectedShipperId)
    }, [selectedShipperId, shipments])
    const shipperSubscriptions = subscriptions.filter((subscription) => String(subscription.shipperId) === selectedShipperId)

    return (
        <section className="role-page">
            <div className="role-hero shipper-hero">
                <div>
                    <p className="eyebrow">Shipper portal</p>
                    <h2>Track your freight, webhook setup, and SLA exposure.</h2>
                    <p>For shipper operations teams who need visibility without broker-only or fleet-only controls.</p>
                </div>
                <label className="role-select">
                    Account
                    <select value={selectedShipperId} onChange={(event) => setSelectedShipperId(event.target.value)}>
                        {shippers.map((shipper) => (
                            <option key={shipper.id} value={shipper.id}>{shipper.companyName}</option>
                        ))}
                    </select>
                </label>
            </div>

            {error && <p className="error-text">{error}</p>}

            <div className="metrics-grid">
                <div className="metric-card"><span>Shipments</span><strong>{shipperShipments.length}</strong></div>
                <div className="metric-card"><span>Delayed</span><strong>{shipperShipments.filter((shipment) => shipment.status === 'DELAYED').length}</strong></div>
                <div className="metric-card"><span>In transit</span><strong>{shipperShipments.filter((shipment) => shipment.status === 'IN_TRANSIT').length}</strong></div>
                <div className="metric-card"><span>Webhook events</span><strong>{shipperSubscriptions.length}</strong></div>
                <div className="metric-card"><span>API key</span><strong>{selectedShipper?.apiKeyPrefix ? `${selectedShipper.apiKeyPrefix}...` : 'Not issued'}</strong></div>
            </div>

            <div className="role-grid">
                <div className="panel">
                    <h2>My shipments</h2>
                    <div className="data-list">
                        {shipperShipments.map((shipment) => (
                            <Link key={shipment.id} to={`/track/${shipment.trackingCode}`} className="data-row compact-row">
                                <strong>{shipment.trackingCode}</strong>
                                <span>{shipment.status}</span>
                                <span>{shipment.priority}</span>
                                <span>{shipment.originLabel} to {shipment.destinationLabel}</span>
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="panel">
                    <h2>Notification setup</h2>
                    <div className="data-list">
                        {shipperSubscriptions.map((subscription) => (
                            <div key={subscription.id} className="data-row compact-row">
                                <strong>{subscription.eventType}</strong>
                                <span>{subscription.enabled ? 'Enabled' : 'Disabled'}</span>
                                <span>{subscription.targetUrl}</span>
                                <span>{subscription.maxRetries} retries</span>
                            </div>
                        ))}
                    </div>
                    <Link className="text-action" to="/operations/webhooks">Request webhook change</Link>
                </div>
            </div>
        </section>
    )
}

export default ShipperPortalPage
