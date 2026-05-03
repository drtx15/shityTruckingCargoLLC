import { useEffect, useState } from 'react'
import { getEtaHistory } from '../api'

function EtaHistoryPage() {
    const [rows, setRows] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getEtaHistory().then(setRows).catch((err) => setError(err.message))
    }, [])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">ETA intelligence</p>
                    <h2>ETA history</h2>
                </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="panel data-list">
                {rows.map((row) => (
                    <div key={row.id} className="data-row">
                        <strong>{row.shipment?.trackingCode || `Shipment ${row.shipmentId}`}</strong>
                        <span>{row.reason}</span>
                        <span>{row.previousEtaMinutes ?? 'N/A'} min to {row.newEtaMinutes ?? 'N/A'} min</span>
                        <span>{new Date(row.computedAt).toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default EtaHistoryPage
