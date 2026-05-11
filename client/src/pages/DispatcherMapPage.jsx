import { useEffect, useMemo, useState } from 'react'
import { getShipments, getTracking, openTrackingSocket } from '../api'
import { SignalIcon, TruckIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'
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

    const selectedShipment = useMemo(() => {
        return shipments.find((shipment) => String(shipment.id) === String(selectedId)) || null
    }, [selectedId, shipments])

    const stats = useMemo(() => ({
        active: shipments.filter((shipment) => !['ARRIVED', 'CANCELLED'].includes(shipment.status)).length,
        delayed: shipments.filter((shipment) => shipment.status === 'DELAYED' || shipment.isPaused).length,
        assigned: shipments.filter((shipment) => shipment.assignedTruck).length
    }), [shipments])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Dispatcher</p>
                    <h2>Fleet overview map</h2>
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

            <MetricStrip
                items={[
                    { label: 'Active loads', value: stats.active, icon: SignalIcon, state: stats.active ? 'live' : '' },
                    { label: 'Exceptions', value: stats.delayed, tone: stats.delayed ? 'risk' : '' },
                    { label: 'Assigned trucks', value: stats.assigned, icon: TruckIcon },
                    { label: 'Selected load', value: selectedShipment?.trackingCode || 'None' }
                ]}
            />

            <div className="map-console">
                <aside className="panel map-load-list">
                    <div className="page-heading">
                        <div>
                            <p className="eyebrow">Live loads</p>
                            <h2>Dispatch queue</h2>
                        </div>
                    </div>
                    <div className="load-list">
                        {shipments.map((shipment) => (
                            <button
                                key={shipment.id}
                                type="button"
                                className={`load-list-item ${String(shipment.id) === String(selectedId) ? 'is-active' : ''}`.trim()}
                                onClick={() => setSelectedId(String(shipment.id))}
                            >
                                <span>
                                    <strong>{shipment.trackingCode || `Shipment ${shipment.id}`}</strong>
                                    <StatusIndicator status={shipment.status} />
                                </span>
                                <small>{shipment.assignedTruck?.label || 'Unassigned'} / {shipment.priority}</small>
                                <small>{shipment.originLabel || 'Origin'} to {shipment.destinationLabel || 'Destination'}</small>
                            </button>
                        ))}
                    </div>
                </aside>

                <div className="map-workspace">
                    {error && <p className="error-text">{error}</p>}
                    {tracking ? (
                        <TrackingMap route={{ ...tracking.route, etaMinutes: tracking.etaMinutes }} truck={tracking.truck} heading="Dispatch route map" />
                    ) : (
                        <div className="empty-state">
                            <h3>No shipment selected.</h3>
                            <p>Choose a shipment to inspect its route and assigned truck.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

export default DispatcherMapPage
