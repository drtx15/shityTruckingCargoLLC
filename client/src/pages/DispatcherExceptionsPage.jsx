import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShipments } from '../api'

function DispatcherExceptionsPage() {
    const [shipments, setShipments] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getShipments().then(setShipments).catch((err) => setError(err.message))
    }, [])

    const exceptions = useMemo(() => shipments.filter((shipment) => shipment.status === 'DELAYED' || shipment.isPaused), [shipments])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Dispatcher</p>
                    <h2>Exception queue</h2>
                </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="panel data-list">
                {exceptions.map((shipment) => (
                    <Link key={shipment.id} to={`/dispatcher/loads/${shipment.id}`} className="data-row compact-row">
                        <strong>{shipment.trackingCode}</strong>
                        <span>{shipment.status}</span>
                        <span>{shipment.priority}</span>
                        <span>{shipment.delayReason || (shipment.isPaused ? 'Paused' : 'Needs review')}</span>
                    </Link>
                ))}
                {!exceptions.length && (
                    <div className="empty-state">
                        <h3>No exceptions right now.</h3>
                        <p>Delayed and paused shipments will appear here for intervention.</p>
                    </div>
                )}
            </div>
        </section>
    )
}

export default DispatcherExceptionsPage
