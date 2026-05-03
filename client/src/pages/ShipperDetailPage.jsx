import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getShipper, rotateShipperApiKey } from '../api'

function ShipperDetailPage() {
    const { id } = useParams()
    const [shipper, setShipper] = useState(null)
    const [newKey, setNewKey] = useState('')
    const [error, setError] = useState('')

    const load = () => getShipper(id).then(setShipper).catch((err) => setError(err.message))

    useEffect(() => {
        load()
    }, [id])

    const rotateKey = async () => {
        try {
            const result = await rotateShipperApiKey(id)
            setNewKey(result.apiKey || '')
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    if (error) return <p className="error-text">{error}</p>
    if (!shipper) return <p>Loading shipper...</p>

    return (
        <section className="page-stack">
            <div className="panel">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">Shipper account</p>
                        <h2>{shipper.companyName}</h2>
                    </div>
                    <button type="button" onClick={rotateKey}>Rotate API key</button>
                </div>
                <div className="metrics-grid">
                    <div className="metric-card"><span>Email</span><strong>{shipper.contactEmail}</strong></div>
                    <div className="metric-card"><span>Status</span><strong>{shipper.isActive ? 'Active' : 'Inactive'}</strong></div>
                    <div className="metric-card"><span>API key</span><strong>{shipper.apiKeyPrefix ? `${shipper.apiKeyPrefix}...` : 'Not issued'}</strong></div>
                </div>
                {newKey && <p className="notice-text">New API key: {newKey}</p>}
            </div>
            <div className="panel">
                <h2>Recent shipments</h2>
                <div className="data-list">
                    {shipper.shipments?.map((shipment) => (
                        <Link key={shipment.id} to={`/broker/orders/${shipment.id}`} className="data-row">
                            <strong>{shipment.trackingCode}</strong>
                            <span>{shipment.status}</span>
                            <span>{shipment.originLabel} to {shipment.destinationLabel}</span>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="panel">
                <h2>Webhook subscriptions</h2>
                <div className="data-list">
                    {shipper.webhookSubscriptions?.map((subscription) => (
                        <div key={subscription.id} className="data-row">
                            <strong>{subscription.eventType}</strong>
                            <span>{subscription.targetUrl}</span>
                            <span>{subscription.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default ShipperDetailPage
