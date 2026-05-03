import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function CustomerTrackingHubPage() {
    const navigate = useNavigate()
    const [trackingCode, setTrackingCode] = useState('TRK-2026-DEMO01')

    const submit = (event) => {
        event.preventDefault()
        const normalized = trackingCode.trim().toUpperCase()
        if (normalized) {
            navigate(`/track/${normalized}`)
        }
    }

    return (
        <section className="role-page">
            <div className="role-hero customer-hero">
                <div>
                    <p className="eyebrow">Customer tracking</p>
                    <h2>One public shipment view, no internal operations exposed.</h2>
                    <p>For recipients and customer-service users who only need safe tracking status, ETA, and checkpoint visibility.</p>
                </div>
            </div>

            <form className="panel tracking-hub" onSubmit={submit}>
                <label>
                    Tracking code
                    <input value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} placeholder="TRK-2026-8F3K2A" />
                </label>
                <button type="submit">Open tracking</button>
                <Link className="text-action" to="/track/TRK-2026-DEMO01">Open demo tracking</Link>
            </form>
        </section>
    )
}

export default CustomerTrackingHubPage
