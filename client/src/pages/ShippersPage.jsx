import { useEffect, useMemo, useState } from 'react'
import { createShipper, getShippers, updateShipper } from '../api'
import { ArrowRightIcon, BuildingIcon, CheckIcon, IconButton, IconLink } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

function ShippersPage() {
    const [shippers, setShippers] = useState([])
    const [drafts, setDrafts] = useState({})
    const [form, setForm] = useState({ companyName: '', contactEmail: '' })
    const [createdKey, setCreatedKey] = useState('')
    const [error, setError] = useState('')

    const load = async () => {
        try {
            const data = await getShippers()
            setShippers(data)
            setDrafts((prev) => {
                const next = {}
                data.forEach((shipper) => {
                    next[shipper.id] = prev[shipper.id] || {
                        companyName: shipper.companyName || '',
                        contactEmail: shipper.contactEmail || ''
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

    const stats = useMemo(() => ({
        total: shippers.length,
        active: shippers.filter((shipper) => shipper.isActive !== false).length,
        shipments: shippers.reduce((sum, shipper) => sum + Number(shipper._count?.shipments || 0), 0),
        webhooks: shippers.reduce((sum, shipper) => sum + Number(shipper._count?.webhookSubscriptions || 0), 0)
    }), [shippers])

    const updateDraft = (shipperId, patch) => {
        setDrafts((prev) => ({
            ...prev,
            [shipperId]: {
                ...prev[shipperId],
                ...patch
            }
        }))
    }

    const submit = async (event) => {
        event.preventDefault()
        try {
            const shipper = await createShipper(form)
            setCreatedKey(shipper.apiKey || '')
            setForm({ companyName: '', contactEmail: '' })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const saveShipper = async (shipper) => {
        const draft = drafts[shipper.id] || {}
        try {
            await updateShipper(shipper.id, draft)
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const toggleShipper = async (shipper) => {
        try {
            await updateShipper(shipper.id, { isActive: shipper.isActive === false })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Broker workspace</p>
                    <h2>Shipper accounts</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Accounts', value: stats.total, icon: BuildingIcon },
                    { label: 'Active', value: stats.active, icon: BuildingIcon, state: stats.active ? 'live' : '' },
                    { label: 'Shipments', value: stats.shipments },
                    { label: 'Webhook routes', value: stats.webhooks }
                ]}
            />

            {error && <p className="error-text">{error}</p>}

            <div className="crud-layout">
                <div className="panel">
                    <div className="table-header">
                        <span>Account</span>
                        <span>Contact</span>
                        <span>Status</span>
                        <span>API key</span>
                        <span>Actions</span>
                    </div>
                    <div className="data-list">
                        {shippers.map((shipper) => {
                            const draft = drafts[shipper.id] || {}
                            return (
                                <form key={shipper.id} className="data-row shipper-edit-row" onSubmit={(event) => {
                                    event.preventDefault()
                                    saveShipper(shipper)
                                }}>
                                    <label className="inline-field">
                                        <span>Company</span>
                                        <input value={draft.companyName || ''} onChange={(event) => updateDraft(shipper.id, { companyName: event.target.value })} required />
                                    </label>
                                    <label className="inline-field">
                                        <span>Email</span>
                                        <input type="email" value={draft.contactEmail || ''} onChange={(event) => updateDraft(shipper.id, { contactEmail: event.target.value })} required />
                                    </label>
                                    <div className="row-status">
                                        <StatusIndicator status={shipper.isActive === false ? 'INACTIVE' : 'ACTIVE'} />
                                        <small>{shipper._count?.shipments || 0} loads</small>
                                    </div>
                                    <span>{shipper.apiKeyPrefix ? `Key ${shipper.apiKeyPrefix}...` : 'No API key'}</span>
                                    <div className="row-actions">
                                        <IconButton type="submit" icon={CheckIcon} label={`Save ${shipper.companyName}`} className="icon-button--soft" />
                                        <button type="button" className="secondary-button compact-action" onClick={() => toggleShipper(shipper)}>
                                            {shipper.isActive === false ? 'Activate' : 'Pause'}
                                        </button>
                                        <IconLink to={`/broker/customers/${shipper.id}`} icon={ArrowRightIcon} label={`Open ${shipper.companyName}`} className="icon-link--soft" />
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
                            <h2>New shipper</h2>
                        </div>
                    </div>
                    <label>
                        Company
                        <input value={form.companyName} onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))} required />
                    </label>
                    <label>
                        Contact email
                        <input type="email" value={form.contactEmail} onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))} required />
                    </label>
                    <button type="submit">Create shipper</button>
                    {createdKey && <p className="notice-text">New API key: {createdKey}</p>}
                </form>
            </div>
        </section>
    )
}

export default ShippersPage
