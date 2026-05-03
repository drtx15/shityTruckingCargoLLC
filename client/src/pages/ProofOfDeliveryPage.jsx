import { useEffect, useMemo, useState } from 'react'
import { getShipments, submitProofOfDelivery } from '../api'

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

    return (
        <section className="page-grid">
            <form className="panel form-panel" onSubmit={submit}>
                <h2>Proof of delivery</h2>
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
                {error && <p className="error-text">{error}</p>}
            </form>
            <div className="panel">
                <h2>Recent delivery states</h2>
                <div className="data-list">
                    {shipments.slice(0, 20).map((shipment) => (
                        <div key={shipment.id} className="data-row">
                            <strong>{shipment.trackingCode || `Shipment ${shipment.id}`}</strong>
                            <span>{shipment.status}</span>
                            <span>{shipment.proofDeliveredAt ? `Proof saved ${new Date(shipment.proofDeliveredAt).toLocaleString()}` : 'Proof pending'}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default ProofOfDeliveryPage
