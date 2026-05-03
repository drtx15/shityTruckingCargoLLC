import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
    assignTruck,
    deleteShipment,
    getTracking,
    getTrucks,
    pauseShipment,
    resumeShipment
} from '../api'
import StatusTimeline from '../components/StatusTimeline'
import TrackingMap from '../map/TrackingMap'
import { ArrowLeftIcon, IconButton, IconLink, PauseIcon, PlayIcon, TrashIcon } from '../components/IconControls'

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
    const [error, setError] = useState('')
    const [actionError, setActionError] = useState('')
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



    const handleDeleteShipment = async () => {
        const confirmed = window.confirm('Delete this shipment?')

        if (!confirmed) {
            return
        }

        try {
            await deleteShipment(id)
            window.location.href = '/'
        } catch (deleteError) {
            setActionError(deleteError.message)
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
                <IconLink to="/" icon={ArrowLeftIcon} label="Back to dashboard" className="icon-link--soft" />
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
                <IconLink to="/" icon={ArrowLeftIcon} label="Back to dashboard" className="icon-link--soft" />
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
                    <IconButton
                        type="button"
                        icon={tracking.isPaused ? PlayIcon : PauseIcon}
                        label={tracking.isPaused ? 'Resume shipment' : 'Pause shipment'}
                        className="icon-button--soft"
                        aria-pressed={tracking.isPaused}
                        onClick={handlePauseToggle}
                    />
                    <IconButton
                        type="button"
                        icon={TrashIcon}
                        label="Delete shipment"
                        className="icon-button--soft"
                        onClick={handleDeleteShipment}
                    />
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
                </div>

                {actionError && <p className="error-text">{actionError}</p>}
            </div>

            <TrackingMap route={{ ...tracking.route, etaMinutes: tracking.etaMinutes }} truck={tracking.truck} heading="Route map" />
            <StatusTimeline checkpoints={tracking.checkpoints} tracking={tracking} activityFeed={activityFeed} />
        </section>
    )
}

export default ShipmentDetailPage
