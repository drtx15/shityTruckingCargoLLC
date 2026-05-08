import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShipments, getTracking, openTrackingSocket } from '../api'
import TrackingMap from '../map/TrackingMap'

function DriverRoadPage() {
    const [shipments, setShipments] = useState([])
    const [selectedId, setSelectedId] = useState('')
    const [tracking, setTracking] = useState(null)
    const [error, setError] = useState('')

    useEffect(() => {
        getShipments()
            .then((data) => {
                setShipments(data)
                setSelectedId(String(data[0]?.id || ''))
            })
            .catch((err) => setError(err.message))
    }, [])

    useEffect(() => {
        if (!selectedId) {
            setTracking(null)
            return
        }

        let active = true
        const load = () => {
            getTracking(selectedId)
                .then((data) => {
                    if (active) {
                        setTracking(data)
                        setError('')
                    }
                })
                .catch((err) => active && setError(err.message))
        }

        load()
        const timer = setInterval(load, 1000)
        const socket = openTrackingSocket({
            shipmentId: selectedId,
            onMessage: (event) => {
                if (!active) {
                    return
                }
                if (event.type === 'error') {
                    setError(event.message || 'Live tracking unavailable')
                    return
                }
                setTracking(event.payload)
                setError('')
            },
            onError: (err) => active && setError(err.message)
        })

        return () => {
            active = false
            clearInterval(timer)
            socket.close()
        }
    }, [selectedId])

    const selectedShipment = useMemo(() => shipments.find((shipment) => String(shipment.id) === selectedId), [selectedId, shipments])

    return (
        <section className="role-page">
            <div className="role-hero fleet-hero">
                <div>
                    <p className="eyebrow">Driver workspace</p>
                    <h2>Your assigned road, ETA, and delivery handoff.</h2>
                    <p>{selectedShipment ? `${selectedShipment.originLabel || 'Origin'} to ${selectedShipment.destinationLabel || 'Destination'}` : 'No assigned active load.'}</p>
                </div>
                <label className="role-select">
                    Assigned load
                    <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                        <option value="">No load selected</option>
                        {shipments.map((shipment) => (
                            <option key={shipment.id} value={shipment.id}>{shipment.trackingCode}</option>
                        ))}
                    </select>
                </label>
            </div>

            {error && <p className="error-text">{error}</p>}
            {tracking ? (
                <>
                    <div className="metrics-grid">
                        <div className="metric-card"><span>Status</span><strong>{tracking.status}</strong></div>
                        <div className="metric-card"><span>ETA</span><strong>{tracking.etaMinutes ?? 'Pending'} min</strong></div>
                        <div className="metric-card"><span>Truck</span><strong>{tracking.truck?.label || 'Assigned truck'}</strong></div>
                        <div className="metric-card"><span>Speed</span><strong>{tracking.truck?.currentSpeed == null ? 'Waiting GPS' : `${Math.round(tracking.truck.currentSpeed)} kph`}</strong></div>
                    </div>
                    <TrackingMap route={{ ...tracking.route, etaMinutes: tracking.etaMinutes }} truck={tracking.truck} heading="Road view" />
                    <Link className="text-action" to="/driver/proof-of-delivery">Submit proof of delivery</Link>
                </>
            ) : (
                <div className="empty-state">
                    <h3>No active road assigned.</h3>
                    <p>Assigned loads will appear here when dispatch puts your truck on a shipment.</p>
                </div>
            )}
        </section>
    )
}

export default DriverRoadPage
