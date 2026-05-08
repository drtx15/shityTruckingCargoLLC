import { useEffect, useState } from 'react'
import { getShipments, getTracking, openTrackingSocket } from '../api'
import TrackingMap from '../map/TrackingMap'

function DispatcherMapPage() {
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

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Dispatcher</p>
                    <h2>Live map</h2>
                </div>
                <label className="role-select">
                    Shipment
                    <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                        <option value="">Choose shipment</option>
                        {shipments.map((shipment) => (
                            <option key={shipment.id} value={shipment.id}>{shipment.trackingCode}</option>
                        ))}
                    </select>
                </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            {tracking ? (
                <TrackingMap route={{ ...tracking.route, etaMinutes: tracking.etaMinutes }} truck={tracking.truck} heading="Dispatch route map" />
            ) : (
                <div className="empty-state">
                    <h3>No shipment selected.</h3>
                    <p>Choose a shipment to inspect its route and assigned truck.</p>
                </div>
            )}
        </section>
    )
}

export default DispatcherMapPage
