import { useEffect, useMemo, useState } from 'react'
import { getShipments, submitProofOfDelivery } from '../api'
import { CheckIcon, ClockIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

function ProofOfDeliveryPage() {
    const [shipments, setShipments] = useState([])
    const [selectedId, setSelectedId] = useState('')
    const [form, setForm] = useState({ recipientName: '', deliveryNote: '', referenceUrl: '' })
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    const load = () => getShipments().then(setShipments).catch((err) => setError(err.message))

    useEffect(() => {
        load()
    }, [])

    const pendingProof = useMemo(() => shipments.filter((shipment) => shipment.status !== 'ARRIVED' || !shipment.proofDeliveredAt), [shipments])

    const submit = async (event) => {
        event.preventDefault()
        try {
            await submitProofOfDelivery(selectedId, form)
            setMessage('Proof of delivery saved')
            setForm({ recipientName: '', deliveryNote: '', referenceUrl: '' })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const proofSaved = shipments.filter((shipment) => shipment.proofDeliveredAt).length

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Driver console</p>
                    <h2>Proof of delivery</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Pending proof', value: pendingProof.length, icon: ClockIcon, state: pendingProof.length ? 'warn' : '' },
                    { label: 'Proof saved', value: proofSaved, icon: CheckIcon, state: proofSaved ? 'live' : '' },
                    { label: 'Recent loads', value: shipments.length }
                ]}
            />

            {error && <p className="error-text">{error}</p>}

            <div className="crud-layout">
                <div className="panel">
                    <div className="table-header">
                        <span>Load</span>
                        <span>Status</span>
                        <span>Proof</span>
                    </div>
                    <div className="data-list">
                        {shipments.slice(0, 20).map((shipment) => (
                            <div key={shipment.id} className="data-row compact-row">
                                <strong>{shipment.trackingCode || `Shipment ${shipment.id}`}</strong>
                                <StatusIndicator status={shipment.status} />
                                <span>{shipment.proofDeliveredAt ? `Saved ${new Date(shipment.proofDeliveredAt).toLocaleString()}` : 'Pending'}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <form className="panel form-panel" onSubmit={submit}>
                    <div className="form-header">
                        <div>
                            <p className="eyebrow">Submit</p>
                            <h2>Delivery proof</h2>
                        </div>
                    </div>
                    <label>
                        Shipment
                        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>
                            <option value="">Choose shipment</option>
                            {pendingProof.map((shipment) => (
                                <option key={shipment.id} value={shipment.id}>{shipment.trackingCode || `Shipment ${shipment.id}`}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Recipient name
                        <input value={form.recipientName} onChange={(event) => setForm((prev) => ({ ...prev, recipientName: event.target.value }))} required />
                    </label>
                    <label>
                        Delivery note
                        <textarea value={form.deliveryNote} onChange={(event) => setForm((prev) => ({ ...prev, deliveryNote: event.target.value }))} />
                    </label>
                    <label>
                        Proof reference URL
                        <input value={form.referenceUrl} onChange={(event) => setForm((prev) => ({ ...prev, referenceUrl: event.target.value }))} />
                    </label>
                    <button type="submit">Save proof</button>
                    {message && <p className="notice-text">{message}</p>}
                </form>
            </div>
        </section>
    )
}

export default ProofOfDeliveryPage
