import { useEffect, useMemo, useState } from 'react'
import { createWebhookSubscription, getShippers, getWebhookAttempts, getWebhookSubscriptions, retryWebhookAttempt, updateWebhookSubscription } from '../api'
import { CheckIcon, IconButton, SignalIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

const eventTypes = ['shipment.assigned', 'shipment.departed', 'shipment.delayed', 'shipment.arrived']

function WebhooksPage() {
    const [shippers, setShippers] = useState([])
    const [subscriptions, setSubscriptions] = useState([])
    const [attempts, setAttempts] = useState([])
    const [drafts, setDrafts] = useState({})
    const [form, setForm] = useState({ shipperId: '', eventType: 'shipment.arrived', targetUrl: '', signingSecret: '', maxRetries: '3' })
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
            setDrafts((prev) => {
                const next = {}
                subscriptionData.forEach((subscription) => {
                    next[subscription.id] = prev[subscription.id] || {
                        eventType: subscription.eventType,
                        targetUrl: subscription.targetUrl || '',
                        maxRetries: String(subscription.maxRetries || 3)
                    }
                })
                return next
            })
            setError('')
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
            await createWebhookSubscription({ ...form, shipperId: Number(form.shipperId), maxRetries: Number(form.maxRetries) })
            setForm((prev) => ({ ...prev, targetUrl: '', signingSecret: '', maxRetries: '3' }))
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const retry = async (id) => {
        await retryWebhookAttempt(id)
        await load()
    }

    const updateDraft = (subscriptionId, patch) => {
        setDrafts((prev) => ({
            ...prev,
            [subscriptionId]: {
                ...prev[subscriptionId],
                ...patch
            }
        }))
    }

    const saveSubscription = async (subscription) => {
        const draft = drafts[subscription.id] || {}
        try {
            await updateWebhookSubscription(subscription.id, {
                ...draft,
                maxRetries: Number(draft.maxRetries)
            })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const toggleSubscription = async (subscription) => {
        try {
            await updateWebhookSubscription(subscription.id, { enabled: !subscription.enabled })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const stats = useMemo(() => ({
        active: subscriptions.filter((subscription) => subscription.enabled).length,
        failed: attempts.filter((attempt) => attempt.state === 'FAILED' || attempt.state === 'RETRYING').length,
        delivered: attempts.filter((attempt) => attempt.state === 'DELIVERED' || attempt.state === 'SUCCESS').length,
        totalAttempts: attempts.length
    }), [attempts, subscriptions])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Admin operations</p>
                    <h2>Webhook control</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Active routes', value: stats.active, icon: SignalIcon, state: stats.active ? 'live' : '' },
                    { label: 'Attempts', value: stats.totalAttempts },
                    { label: 'Delivered', value: stats.delivered },
                    { label: 'Incidents', value: stats.failed, tone: stats.failed ? 'risk' : '' }
                ]}
            />

            {error && <p className="error-text">{error}</p>}

            <div className="crud-layout">
                <div className="panel">
                    <div className="table-header">
                        <span>Event</span>
                        <span>Shipper</span>
                        <span>Target</span>
                        <span>Status</span>
                        <span>Actions</span>
                    </div>
                    <div className="data-list">
                        {subscriptions.map((subscription) => {
                            const draft = drafts[subscription.id] || {}
                            return (
                                <form key={subscription.id} className="data-row webhook-edit-row" onSubmit={(event) => {
                                    event.preventDefault()
                                    saveSubscription(subscription)
                                }}>
                                    <label className="inline-field">
                                        <span>Event</span>
                                        <select value={draft.eventType || subscription.eventType} onChange={(event) => updateDraft(subscription.id, { eventType: event.target.value })}>
                                            {eventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}
                                        </select>
                                    </label>
                                    <span>{subscription.shipper?.companyName || 'No shipper'}</span>
                                    <label className="inline-field">
                                        <span>Target URL</span>
                                        <input value={draft.targetUrl || ''} onChange={(event) => updateDraft(subscription.id, { targetUrl: event.target.value })} required />
                                    </label>
                                    <div className="row-status">
                                        <StatusIndicator status={subscription.enabled ? 'ENABLED' : 'DISABLED'} />
                                        <small>{subscription._count?.attempts || 0} attempts</small>
                                    </div>
                                    <div className="row-actions">
                                        <IconButton type="submit" icon={CheckIcon} label={`Save ${subscription.eventType}`} className="icon-button--soft" />
                                        <button type="button" className="secondary-button compact-action" onClick={() => toggleSubscription(subscription)}>
                                            {subscription.enabled ? 'Disable' : 'Enable'}
                                        </button>
                                    </div>
                                </form>
                            )
                        })}
                    </div>
                </div>

                <form className="panel form-panel" onSubmit={submit}>
                    <div className="form-header">
                        <div>
                            <p className="eyebrow">CRUD</p>
                            <h2>New subscription</h2>
                        </div>
                    </div>
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
                    <label>
                        Max retries
                        <input type="number" min="0" value={form.maxRetries} onChange={(event) => setForm((prev) => ({ ...prev, maxRetries: event.target.value }))} />
                    </label>
                    <button type="submit">Create subscription</button>
                </form>
            </div>

            <div className="panel">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">Delivery log</p>
                        <h2>Recent attempts</h2>
                    </div>
                </div>
                <div className="data-list">
                    {attempts.map((attempt) => (
                        <div key={attempt.id} className="data-row">
                            <strong>{attempt.eventType}</strong>
                            <StatusIndicator status={attempt.state} label={attempt.state} />
                            <span>{attempt.subscription?.shipper?.companyName || 'No shipper'}</span>
                            <span>{attempt.responseStatus || attempt.errorMessage || 'Pending'}</span>
                            <button type="button" className="secondary-button compact-action" onClick={() => retry(attempt.id)}>Retry</button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default WebhooksPage
