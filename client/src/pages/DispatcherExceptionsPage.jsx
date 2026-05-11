import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShipments } from '../api'
import { FlagIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

function DispatcherExceptionsPage() {
    const [shipments, setShipments] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getShipments().then(setShipments).catch((err) => setError(err.message))
    }, [])

    const exceptions = useMemo(() => shipments.filter((shipment) => shipment.status === 'DELAYED' || shipment.isPaused), [shipments])
    const pausedCount = exceptions.filter((shipment) => shipment.isPaused).length

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Dispatcher</p>
                    <h2>Exception queue</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Open exceptions', value: exceptions.length, icon: FlagIcon, tone: exceptions.length ? 'risk' : '' },
                    { label: 'Paused loads', value: pausedCount, tone: pausedCount ? 'risk' : '' },
                    { label: 'Delayed loads', value: exceptions.length - pausedCount, tone: exceptions.length - pausedCount ? 'risk' : '' }
                ]}
            />

            {error && <p className="error-text">{error}</p>}
            <div className="panel">
                <div className="table-header">
                    <span>Load</span>
                    <span>Status</span>
                    <span>Priority</span>
                    <span>Reason</span>
                    <span>Action</span>
                </div>
                <div className="data-list">
                    {exceptions.map((shipment) => (
                        <Link key={shipment.id} to={`/dispatcher/loads/${shipment.id}`} className="data-row">
                            <strong>{shipment.trackingCode}</strong>
                            <StatusIndicator status={shipment.status} />
                            <span>{shipment.priority}</span>
                            <span>{shipment.delayReason || (shipment.isPaused ? 'Paused' : 'Needs review')}</span>
                            <span>Open load</span>
                        </Link>
                    ))}
                    {!exceptions.length && (
                        <div className="empty-state">
                            <h3>No exceptions right now.</h3>
                            <p>Delayed and paused shipments will appear here for intervention.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default DispatcherExceptionsPage
