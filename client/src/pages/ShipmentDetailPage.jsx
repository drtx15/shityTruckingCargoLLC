import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
    assignTruck,
    getTracking,
    getTrucks,
    pauseShipment,
    resumeShipment,
    searchLocations,
    updateShipmentDestination
} from '../api'
import StatusTimeline from '../components/StatusTimeline'
import TrackingMap from '../map/TrackingMap'

const statusMeta = {
    PENDING: { label: 'Created', className: 'status-created' },
    ASSIGNED: { label: 'Assigned', className: 'status-assigned' },
    IN_TRANSIT: { label: 'In Transit', className: 'status-in-transit' },
    ARRIVED: { label: 'Delivered', className: 'status-delivered' }
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (value * Math.PI) / 180
    const earthRadiusKm = 6371
    const deltaLat = toRad(lat2 - lat1)
    const deltaLng = toRad(lng2 - lng1)
    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLng / 2) ** 2
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

function formatCountdown(etaMinutes) {
    if (etaMinutes === null || etaMinutes === undefined) {
        return 'Pending'
    }

    if (etaMinutes <= 0) {
        return 'Arriving now'
    }

    if (etaMinutes < 60) {
        return `${Math.round(etaMinutes)} min`
    }

    return `${Math.round(etaMinutes / 60)} h ${Math.round(etaMinutes % 60)} m`
}

function formatTelemetryAge(value) {
    if (!value) {
        return 'Awaiting first GPS update'
    }

    const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))

    if (ageSeconds < 5) {
        return 'Live now'
    }

    if (ageSeconds < 60) {
        return `${ageSeconds}s ago`
    }

    const ageMinutes = Math.round(ageSeconds / 60)
    return `${ageMinutes}m ago`
}

function getTruckTelemetryLabel(truck) {
    if (!truck) {
        return 'Unassigned'
    }

    if (truck.lastUpdatedAt) {
        return `Updated ${formatTelemetryAge(truck.lastUpdatedAt)}`
    }

    return 'Assigned, awaiting GPS fix'
}

function buildActivityFeed(tracking) {
    const feed = []

    if (tracking?.createdAt) {
        feed.push({
            id: 'created',
            title: 'Shipment created',
            detail: `${tracking.originLabel || 'Origin'} → ${tracking.destinationLabel || 'Destination'}`,
            timestamp: tracking.createdAt
        })
    }

    tracking?.checkpoints?.forEach((checkpoint) => {
        feed.push({
            id: `checkpoint-${checkpoint.id}`,
            title: `${checkpoint.type.replace('_', ' ')}`,
            detail: `${checkpoint.lat.toFixed(4)}, ${checkpoint.lng.toFixed(4)}`,
            timestamp: checkpoint.timestamp
        })
    })

    if (tracking?.status === 'ARRIVED' && tracking?.estimatedAt) {
        feed.push({
            id: 'arrived',
            title: 'Delivered',
            detail: 'Shipment reached destination',
            timestamp: tracking.estimatedAt
        })
    }

    return feed.sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
}

function ShipmentDetailPage() {
    const { id } = useParams()
    const [tracking, setTracking] = useState(null)
    const [trucks, setTrucks] = useState([])
    const [destinationQuery, setDestinationQuery] = useState('')
    const [destinationSuggestions, setDestinationSuggestions] = useState([])
    const [selectedDestination, setSelectedDestination] = useState(null)
    const [error, setError] = useState('')
    const [actionError, setActionError] = useState('')
    const destinationTimerRef = useRef(null)
    const loadAbortRef = useRef(null)

    const load = async () => {
        if (loadAbortRef.current) {
            loadAbortRef.current.abort()
        }

        const controller = new AbortController()
        loadAbortRef.current = controller

        try {
            const [trackingData, truckData] = await Promise.all([
                getTracking(id, { signal: controller.signal }),
                getTrucks({ signal: controller.signal })
            ])

            if (controller.signal.aborted) {
                return
            }

            setTracking(trackingData)
            setTrucks(truckData)
            setError('')
        } catch (err) {
            if (err?.name === 'AbortError') {
                return
            }
            setError(err.message)
        } finally {
            if (loadAbortRef.current === controller) {
                loadAbortRef.current = null
            }
        }
    }

    useEffect(() => {
        return () => {
            if (destinationTimerRef.current) {
                clearTimeout(destinationTimerRef.current)
            }
        }
    }, [])

    const lookupDestination = (query) => {
        const normalizedQuery = query.trim()

        if (destinationTimerRef.current) {
            clearTimeout(destinationTimerRef.current)
        }

        if (normalizedQuery.length < 2) {
            setDestinationSuggestions([])
            return
        }

        destinationTimerRef.current = setTimeout(async () => {
            try {
                const results = await searchLocations(normalizedQuery, 5)
                setDestinationSuggestions(results)
            } catch (lookupError) {
                setDestinationSuggestions([])
                setActionError(lookupError.message)
            }
        }, 300)
    }

    const handleDestinationChange = (event) => {
        const value = event.target.value
        setDestinationQuery(value)
        setSelectedDestination(null)
        lookupDestination(value)
    }

    const handleAssignTruck = async (event) => {
        const truckId = Number(event.target.value)

        if (!truckId) {
            return
        }

        try {
            await assignTruck(id, truckId)
            await load()
            setActionError('')
            event.target.value = ''
        } catch (assignError) {
            setActionError(assignError.message)
        }
    }

    const handlePauseToggle = async () => {
        try {
            if (tracking?.isPaused) {
                await resumeShipment(id)
            } else {
                await pauseShipment(id)
            }

            await load()
            setActionError('')
        } catch (toggleError) {
            setActionError(toggleError.message)
        }
    }

    const handleDestinationUpdate = async () => {
        const query = destinationQuery.trim()
        const nextDestination = selectedDestination || (query ? { label: query } : null)

        if (!nextDestination) {
            setActionError('Choose a destination before rerouting')
            return
        }

        try {
            await updateShipmentDestination(id, {
                originLat: tracking?.route?.origin?.lat,
                originLng: tracking?.route?.origin?.lng,
                originLabel: tracking?.originLabel,
                destination: nextDestination.label,
                destinationLat: nextDestination.lat,
                destinationLng: nextDestination.lng,
                destinationLabel: nextDestination.label
            })
            await load()
            setActionError('')
            setDestinationQuery('')
            setSelectedDestination(null)
            setDestinationSuggestions([])
        } catch (rerouteError) {
            setActionError(rerouteError.message)
        }
    }

    useEffect(() => {
        load()
        const timer = setInterval(load, 2500)
        return () => {
            clearInterval(timer)

            if (loadAbortRef.current) {
                loadAbortRef.current.abort()
            }
        }
    }, [id])

    const activityFeed = useMemo(() => buildActivityFeed(tracking), [tracking])
    const truckTelemetryLabel = getTruckTelemetryLabel(tracking?.truck)
    const truckSpeedText = tracking?.truck?.currentSpeed !== null && tracking?.truck?.currentSpeed !== undefined
        ? `${Math.round(tracking.truck.currentSpeed)} kph`
        : 'Awaiting first GPS update'
    const truckPosition = tracking?.truck?.currentLat !== null && tracking?.truck?.currentLat !== undefined && tracking?.truck?.currentLng !== null && tracking?.truck?.currentLng !== undefined
        ? [tracking.truck.currentLat, tracking.truck.currentLng]
        : null
    const distanceRemainingKm = truckPosition
        ? haversineKm(truckPosition[0], truckPosition[1], tracking.route.destination.lat, tracking.route.destination.lng)
        : tracking?.truck ? null : null
    const remainingEta = tracking?.etaMinutes !== null && tracking?.etaMinutes !== undefined
        ? formatCountdown(tracking.etaMinutes)
        : 'Pending'
    const lastUpdateValue = tracking?.truck?.lastUpdatedAt || tracking?.updatedAt || tracking?.createdAt || Date.now()

    if (error) {
        return (
            <section className="detail-grid">
                <Link to="/" className="ghost-link">
                    Back to dashboard
                </Link>
                <p className="error-text">{error}</p>
            </section>
        )
    }

    if (!tracking) {
        return (
            <section className="detail-grid">
                <p>Loading tracking details...</p>
            </section>
        )
    }

    return (
        <section className="detail-grid">
            <div className="detail-topbar">
                <Link to="/" className="ghost-link">
                    Back to dashboard
                </Link>
                <span className={`status-badge ${(statusMeta[tracking.status] || statusMeta.PENDING).className}`}>
                    {(statusMeta[tracking.status] || statusMeta.PENDING).label}
                </span>
            </div>

            <div className="panel detail-summary">
                <div className="detail-summary-head">
                    <div>
                        <p className="eyebrow">Shipment #{tracking.shipmentId}</p>
                        <h2>
                            {tracking.originLabel || 'Origin'}
                            <span>→</span>
                            {tracking.destinationLabel || 'Destination'}
                        </h2>
                    </div>
                    <button type="button" className="secondary-button" onClick={handlePauseToggle}>
                        {tracking.isPaused ? 'Resume shipment' : 'Pause shipment'}
                    </button>
                </div>

                <div className="metrics-grid">
                    <div className="metric-card">
                        <span>Current speed</span>
                        <strong>{truckSpeedText}</strong>
                    </div>
                    <div className="metric-card">
                        <span>ETA countdown</span>
                        <strong>{remainingEta}</strong>
                    </div>
                    <div className="metric-card">
                        <span>Distance remaining</span>
                        <strong>
                            {truckPosition
                                ? `${distanceRemainingKm.toFixed(1)} km`
                                : tracking?.truck
                                    ? 'Awaiting first GPS update'
                                    : 'Unassigned'}
                        </strong>
                    </div>
                    <div className="metric-card">
                        <span>Last update</span>
                        <strong>{new Date(lastUpdateValue).toLocaleString()}</strong>
                    </div>
                    <div className="metric-card">
                        <span>Truck telemetry</span>
                        <strong>{truckTelemetryLabel}</strong>
                    </div>
                </div>

                <div className="detail-controls">
                    <label>
                        Reassign truck
                        <select defaultValue="" onChange={handleAssignTruck}>
                            <option value="">Choose a truck</option>
                            {trucks.map((truck) => (
                                <option key={truck.id} value={truck.id}>
                                    {truck.label} ({truck.status})
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="suggestion-field detail-reroute">
                        <label htmlFor="destination-input">Update destination</label>
                        <input
                            id="destination-input"
                            value={destinationQuery}
                            onChange={handleDestinationChange}
                            placeholder="Search a new destination"
                            autoComplete="off"
                        />
                        {destinationSuggestions.length > 0 && (
                            <div className="suggestions-menu" role="listbox" aria-label="Destination suggestions">
                                {destinationSuggestions.map((location) => (
                                    <button
                                        key={`${location.label}-${location.lat}-${location.lng}`}
                                        type="button"
                                        className="suggestion-item"
                                        onClick={() => {
                                            setSelectedDestination(location)
                                            setDestinationQuery(location.label)
                                            setDestinationSuggestions([])
                                        }}
                                    >
                                        <span className="suggestion-label">{location.label}</span>
                                        <span className="suggestion-meta">
                                            {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <button type="button" onClick={handleDestinationUpdate}>
                            Re-route shipment
                        </button>
                    </div>
                </div>

                {actionError && <p className="error-text">{actionError}</p>}
            </div>

            <TrackingMap route={{ ...tracking.route, etaMinutes: tracking.etaMinutes }} truck={tracking.truck} heading="Route map" />
            <StatusTimeline checkpoints={tracking.checkpoints} tracking={tracking} activityFeed={activityFeed} />
        </section>
    )
}

export default ShipmentDetailPage
