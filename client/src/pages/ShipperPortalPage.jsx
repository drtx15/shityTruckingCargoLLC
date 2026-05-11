import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShippers, getShipments, getWebhookSubscriptions } from '../api'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

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
            <div className="command-bar shipper-hero">
                <div>
                    <p className="eyebrow">Shipper portal</p>
                    <h2>{selectedShipper?.companyName || 'Account'}</h2>
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

            <MetricStrip
                items={[
                    { label: 'Shipments', value: shipperShipments.length },
                    { label: 'Delayed', value: shipperShipments.filter((shipment) => shipment.status === 'DELAYED').length, tone: shipperShipments.some((shipment) => shipment.status === 'DELAYED') ? 'risk' : '' },
                    { label: 'In transit', value: shipperShipments.filter((shipment) => shipment.status === 'IN_TRANSIT').length },
                    { label: 'Webhook events', value: shipperSubscriptions.length },
                    { label: 'API key', value: selectedShipper?.apiKeyPrefix ? `${selectedShipper.apiKeyPrefix}...` : 'Not issued' }
                ]}
            />

            <div className="role-grid">
                <div className="panel">
                    <h2>My shipments</h2>
                    <div className="data-list">
                        {shipperShipments.map((shipment) => (
                            <Link key={shipment.id} to={`/track/${shipment.trackingCode}`} className="account-shipment-row">
                                <div className="account-shipment-main">
                                    <strong>{shipment.trackingCode}</strong>
                                    <StatusIndicator status={shipment.status} />
                                    <span>{shipment.priority}</span>
                                </div>
                                <p>
                                    <span>{shipment.originLabel || 'Origin pending'}</span>
                                    <em>to</em>
                                    <span>{shipment.destinationLabel || 'Destination pending'}</span>
                                </p>
                            </Link>
                        ))}
                    </div>
                </div>
                <div className="panel">
                    <h2>Notification setup</h2>
                    <div className="data-list">
                        {shipperSubscriptions.map((subscription) => (
                            <div key={subscription.id} className="account-webhook-row">
                                <strong>{subscription.eventType}</strong>
                                <span>{subscription.targetUrl}</span>
                                <StatusIndicator status={subscription.enabled ? 'ENABLED' : 'DISABLED'} />
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
