import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { createShipper, getShippers } from '../api'

function ShippersPage() {
    const [shippers, setShippers] = useState([])
    const [form, setForm] = useState({ companyName: '', contactEmail: '' })
    const [createdKey, setCreatedKey] = useState('')
    const [error, setError] = useState('')

    const load = () => getShippers().then(setShippers).catch((err) => setError(err.message))

    useEffect(() => {
        load()
    }, [])

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

    return (
        <section className="page-grid">
            <form className="panel form-panel" onSubmit={submit}>
                <h2>New shipper</h2>
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
                {error && <p className="error-text">{error}</p>}
            </form>
            <div className="panel">
                <div className="page-heading">
                    <div>
                        <p className="eyebrow">Accounts</p>
                        <h2>Shippers</h2>
                    </div>
                </div>
                <div className="data-list">
                    {shippers.map((shipper) => (
                        <Link key={shipper.id} to={`/broker/customers/${shipper.id}`} className="data-row">
                            <strong>{shipper.companyName}</strong>
                            <span>{shipper.contactEmail}</span>
                            <span>{shipper._count?.shipments || 0} shipments</span>
                            <span>{shipper.apiKeyPrefix ? `Key ${shipper.apiKeyPrefix}...` : 'No API key'}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default ShippersPage
