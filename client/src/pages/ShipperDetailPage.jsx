import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getShipper, rotateShipperApiKey, updateShipper } from '../api'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

function ShipperDetailPage() {
    const { id } = useParams()
    const [shipper, setShipper] = useState(null)
    const [draft, setDraft] = useState({ companyName: '', contactEmail: '' })
    const [newKey, setNewKey] = useState('')
    const [error, setError] = useState('')

    const load = async () => {
        try {
            const data = await getShipper(id)
            setShipper(data)
            setDraft({
                companyName: data.companyName || '',
                contactEmail: data.contactEmail || ''
            })
            setError('')
        } catch (err) {
            setError(err.message)
        }
    }

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

    const saveAccount = async (event) => {
        event.preventDefault()
        try {
            await updateShipper(id, draft)
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const toggleAccount = async () => {
        try {
            await updateShipper(id, { isActive: shipper.isActive === false })
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
                <MetricStrip
                    items={[
                        { label: 'Email', value: shipper.contactEmail },
                        { label: 'Status', value: shipper.isActive ? 'Active' : 'Inactive' },
                        { label: 'API key', value: shipper.apiKeyPrefix ? `${shipper.apiKeyPrefix}...` : 'Not issued' }
                    ]}
                />
                <form className="inline-edit-form" onSubmit={saveAccount}>
                    <label>
                        Company
                        <input value={draft.companyName} onChange={(event) => setDraft((prev) => ({ ...prev, companyName: event.target.value }))} required />
                    </label>
                    <label>
                        Contact email
                        <input type="email" value={draft.contactEmail} onChange={(event) => setDraft((prev) => ({ ...prev, contactEmail: event.target.value }))} required />
                    </label>
                    <div className="row-status">
                        <StatusIndicator status={shipper.isActive === false ? 'INACTIVE' : 'ACTIVE'} />
                    </div>
                    <div className="row-actions">
                        <button type="submit">Save account</button>
                        <button type="button" className="secondary-button" onClick={toggleAccount}>
                            {shipper.isActive === false ? 'Activate' : 'Pause'}
                        </button>
                    </div>
                </form>
                {newKey && <p className="notice-text">New API key: {newKey}</p>}
            </div>
            <div className="panel">
                <h2>Recent shipments</h2>
                <div className="data-list">
                    {shipper.shipments?.map((shipment) => (
                        <Link key={shipment.id} to={`/broker/orders/${shipment.id}`} className="account-shipment-row">
                            <div className="account-shipment-main">
                                <strong>{shipment.trackingCode}</strong>
                                <StatusIndicator status={shipment.status} />
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
                <h2>Webhook subscriptions</h2>
                <div className="data-list">
                    {shipper.webhookSubscriptions?.map((subscription) => (
                        <div key={subscription.id} className="account-webhook-row">
                            <strong>{subscription.eventType}</strong>
                            <span>{subscription.targetUrl}</span>
                            <StatusIndicator status={subscription.enabled ? 'ENABLED' : 'DISABLED'} />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default ShipperDetailPage
