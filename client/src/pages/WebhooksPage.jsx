import { useEffect, useState } from 'react'
import { createWebhookSubscription, getShippers, getWebhookAttempts, getWebhookSubscriptions, retryWebhookAttempt } from '../api'

const eventTypes = ['shipment.assigned', 'shipment.departed', 'shipment.delayed', 'shipment.arrived']

function WebhooksPage() {
    const [shippers, setShippers] = useState([])
    const [subscriptions, setSubscriptions] = useState([])
    const [attempts, setAttempts] = useState([])
    const [form, setForm] = useState({ shipperId: '', eventType: 'shipment.arrived', targetUrl: '', signingSecret: '' })
    const [error, setError] = useState('')

    const load = async () => {
        try {
            const [shipperData, subscriptionData, attemptData] = await Promise.all([
                getShippers(),
                getWebhookSubscriptions(),
                getWebhookAttempts()
            ])
            setShippers(shipperData)
            setSubscriptions(subscriptionData)
            setAttempts(attemptData)
        } catch (err) {
            setError(err.message)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const submit = async (event) => {
        event.preventDefault()
        try {
            await createWebhookSubscription({ ...form, shipperId: Number(form.shipperId) })
            setForm((prev) => ({ ...prev, targetUrl: '', signingSecret: '' }))
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const retry = async (id) => {
        await retryWebhookAttempt(id)
        await load()
    }

    return (
        <section className="page-grid">
            <form className="panel form-panel" onSubmit={submit}>
                <h2>Webhook subscription</h2>
                <label>
                    Shipper
                    <select value={form.shipperId} onChange={(event) => setForm((prev) => ({ ...prev, shipperId: event.target.value }))} required>
                        <option value="">Choose shipper</option>
                        {shippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.companyName}</option>)}
                    </select>
                </label>
                <label>
                    Event
                    <select value={form.eventType} onChange={(event) => setForm((prev) => ({ ...prev, eventType: event.target.value }))}>
                        {eventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}
                    </select>
                </label>
                <label>
                    Target URL
                    <input value={form.targetUrl} onChange={(event) => setForm((prev) => ({ ...prev, targetUrl: event.target.value }))} placeholder="https://shipper.example/webhooks" required />
                </label>
                <label>
                    Signing secret
                    <input value={form.signingSecret} onChange={(event) => setForm((prev) => ({ ...prev, signingSecret: event.target.value }))} />
                </label>
                <button type="submit">Create subscription</button>
                {error && <p className="error-text">{error}</p>}
            </form>
            <div className="page-stack">
                <div className="panel">
                    <h2>Subscriptions</h2>
                    <div className="data-list">
                        {subscriptions.map((subscription) => (
                            <div key={subscription.id} className="data-row">
                                <strong>{subscription.eventType}</strong>
                                <span>{subscription.shipper?.companyName}</span>
                                <span>{subscription.targetUrl}</span>
                                <span>{subscription.enabled ? 'Enabled' : 'Disabled'}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="panel">
                    <h2>Delivery attempts</h2>
                    <div className="data-list">
                        {attempts.map((attempt) => (
                            <div key={attempt.id} className="data-row">
                                <strong>{attempt.eventType}</strong>
                                <span>{attempt.state}</span>
                                <span>{attempt.responseStatus || attempt.errorMessage || 'Pending'}</span>
                                <button type="button" onClick={() => retry(attempt.id)}>Retry</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default WebhooksPage
