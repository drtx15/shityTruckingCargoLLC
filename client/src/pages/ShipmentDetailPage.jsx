import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
    assignTruck,
    deleteShipment,
    getTruckSuggestions,
    getTracking,
    getTrucks,
    openTrackingSocket,
    pauseShipment,
    resumeShipment
} from '../api'
import StatusTimeline from '../components/StatusTimeline'
import TrackingMap from '../map/TrackingMap'
import {
    ArrowLeftIcon,
    ClockIcon,
    IconButton,
    IconLink,
    PauseIcon,
    PlayIcon,
    RouteIcon,
    SignalIcon,
    SpeedometerIcon,
    TrashIcon,
    TruckIcon
} from '../components/IconControls'
import { getRoleHome, useAuth } from '../auth'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

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

    return `${Math.round(etaMinutes / 60)}h ${Math.round(etaMinutes % 60)}m`
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
    const { user } = useAuth()
    const [tracking, setTracking] = useState(null)
    const [trucks, setTrucks] = useState([])
    const [suggestions, setSuggestions] = useState([])
    const [liveState, setLiveState] = useState('Connecting')
    const [error, setError] = useState('')
    const [actionError, setActionError] = useState('')
    const [copyUrlState, setCopyUrlState] = useState('')
    const loadAbortRef = useRef(null)
    const canAssignTruck = ['DISPATCHER', 'FLEET_MANAGER', 'ADMIN'].includes(user?.role)
    const canPauseShipment = ['DISPATCHER', 'ADMIN'].includes(user?.role)
    const canDeleteShipment = ['BROKER', 'ADMIN'].includes(user?.role)
    const backTo = getRoleHome(user?.role)

    const load = async () => {
        if (loadAbortRef.current) {
            loadAbortRef.current.abort()
        }

        const controller = new AbortController()
        loadAbortRef.current = controller

        try {
            const [trackingData, truckData] = await Promise.all([
                getTracking(id, { signal: controller.signal }),
                canAssignTruck ? getTrucks({ signal: controller.signal }) : Promise.resolve([])
            ])

            if (controller.signal.aborted) {
                return
            }

            setTracking(trackingData)
            setTrucks(truckData)
            if (canAssignTruck) {
                getTruckSuggestions(id).then(setSuggestions).catch(() => setSuggestions([]))
            } else {
                setSuggestions([])
            }
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



    const handleAssignTruck = async (truckId) => {
        if (!truckId) {
            return
        }

        try {
            await assignTruck(id, truckId)
            await load()
            setActionError('')
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
            window.location.href = backTo
        } catch (deleteError) {
            setActionError(deleteError.message)
        }
    }

    const handleCopyTrackingUrl = async () => {
        if (!tracking?.trackingCode || typeof window === 'undefined') {
            return
        }

        const url = `${window.location.origin}/track/${tracking.trackingCode}`
        try {
            await window.navigator.clipboard.writeText(url)
            setCopyUrlState('Copied')
            window.setTimeout(() => setCopyUrlState(''), 1400)
        } catch {
            setCopyUrlState('Copy failed')
        }
    }

    useEffect(() => {
        load()
        const timer = setInterval(load, 1000)
        const socket = openTrackingSocket({
            shipmentId: id,
            onMessage: (event) => {
                if (event.type === 'error') {
                    setLiveState(event.message || 'Live tracking unavailable')
                    return
                }
                setLiveState('Live')
                setTracking(event.payload)
            },
            onError: (socketError) => setLiveState(socketError.message)
        })
        return () => {
            clearInterval(timer)
            socket.close()

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
    const distanceRemainingKm = tracking?.routeRemainingKm !== null && tracking?.routeRemainingKm !== undefined
        ? tracking.routeRemainingKm
        : truckPosition
            ? haversineKm(truckPosition[0], truckPosition[1], tracking.route.destination.lat, tracking.route.destination.lng)
            : null
    const remainingEta = tracking?.etaMinutes !== null && tracking?.etaMinutes !== undefined
        ? formatCountdown(tracking.etaMinutes)
        : 'Pending'
    const lastUpdateValue = tracking?.truck?.lastUpdatedAt || tracking?.updatedAt || tracking?.createdAt || Date.now()
    const lastUpdateDate = new Date(lastUpdateValue).toLocaleString()
    const isLive = liveState === 'Live'
    const hasGps = Boolean(tracking?.truck?.lastUpdatedAt)
    const publicTrackingUrl = tracking?.trackingCode && typeof window !== 'undefined'
        ? `${window.location.origin}/track/${tracking.trackingCode}`
        : 'Pending'
    const detailMetricItems = [
        {
            label: 'Connection',
            value: liveState,
            meta: isLive ? 'WebSocket stream' : 'Waiting for stream',
            icon: SignalIcon,
            state: isLive ? 'live' : 'warn'
        },
        { label: 'Truck', value: tracking?.truck?.label || 'Unassigned', meta: tracking?.truck?.driverName || 'No driver linked', icon: TruckIcon },
        { label: 'Speed', value: truckSpeedText, icon: SpeedometerIcon },
        { label: 'ETA', value: remainingEta, icon: ClockIcon },
        {
            label: 'Remaining',
            value: distanceRemainingKm !== null
                ? `${distanceRemainingKm.toFixed(1)} km`
                : tracking?.truck
                    ? 'Awaiting GPS'
                    : 'Unassigned',
            icon: RouteIcon
        },
        {
            label: 'Telemetry',
            value: hasGps ? 'GPS linked' : 'No fix',
            meta: truckTelemetryLabel,
            icon: TruckIcon,
            state: hasGps ? 'live' : 'warn'
        },
        { label: 'Last update', value: formatTelemetryAge(lastUpdateValue), meta: lastUpdateDate, icon: ClockIcon }
    ]
    const assignedTruckId = tracking?.truck?.id
    const truckById = new Map(trucks.map((truck) => [truck.id, truck]))
    const assignmentCandidates = (suggestions.length ? suggestions : trucks)
        .map((truck) => ({
            ...truckById.get(truck.id),
            ...truck
        }))
        .filter((truck) => truck.id && truck.id !== assignedTruckId)
        .slice(0, 5)

    if (error) {
        return (
            <section className="detail-grid">
                <IconLink to={backTo} icon={ArrowLeftIcon} label="Back to workspace" className="icon-link--soft" />
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
        <section className="detail-grid load-detail-page">
            <div className="panel detail-summary load-control-panel">
                <div className="load-command-row">
                    <IconLink to={backTo} icon={ArrowLeftIcon} label="Back to workspace" className="icon-link--soft" />
                    <div className="load-route-copy">
                        <p className="eyebrow">{tracking.trackingCode || `Shipment #${tracking.shipmentId}`}</p>
                        <h2>
                            {tracking.originLabel || 'Origin'}
                            <span>to</span>
                            {tracking.destinationLabel || 'Destination'}
                        </h2>
                        <div className="load-state-line">
                            <StatusIndicator status={tracking.status} />
                            <span>{tracking.priority || 'STANDARD'}</span>
                            <span>{tracking.shipper?.companyName || 'Unassigned shipper'}</span>
                        </div>
                    </div>
                    <div className="load-command-actions">
                        {canPauseShipment && (
                            <IconButton
                                type="button"
                                icon={tracking.isPaused ? PlayIcon : PauseIcon}
                                label={tracking.isPaused ? 'Resume shipment' : 'Pause shipment'}
                                className="icon-button--soft"
                                aria-pressed={tracking.isPaused}
                                onClick={handlePauseToggle}
                            />
                        )}
                        {canDeleteShipment && (
                            <IconButton
                                type="button"
                                icon={TrashIcon}
                                label="Delete shipment"
                                className="icon-button--danger"
                                onClick={handleDeleteShipment}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="load-execution-grid">
                <TrackingMap route={{ ...tracking.route, etaMinutes: tracking.etaMinutes }} truck={tracking.truck} heading="Route map" />
                <aside className="load-side-panel">
                    <div className="panel load-inspector-panel">
                        <div className="detail-metric-strip">
                            <MetricStrip items={detailMetricItems} />
                        </div>

                        {canAssignTruck && (
                            <div className="dispatch-assignment">
                                <div className="assignment-head">
                                    <div>
                                        <p className="eyebrow">Assignment</p>
                                        <h3>Truck assignment</h3>
                                    </div>
                                </div>

                                <div className="assigned-truck-card">
                                    <span className="assignment-icon" aria-hidden="true">
                                        <TruckIcon />
                                    </span>
                                    <div>
                                        <strong>{tracking.truck?.label || 'Unassigned'}</strong>
                                        <small>{tracking.truck?.driverName || 'No driver linked'}</small>
                                    </div>
                                    {tracking.truck?.status && <StatusIndicator status={tracking.truck.status} />}
                                </div>

                                <div className="assignment-candidates">
                                    <span>Available matches</span>
                                    {assignmentCandidates.length ? assignmentCandidates.map((truck) => (
                                        <button
                                            key={truck.id}
                                            type="button"
                                            className="assignment-candidate"
                                            onClick={() => handleAssignTruck(truck.id)}
                                        >
                                            <span>
                                                <strong>{truck.label}</strong>
                                                <small>{truck.driverName || truck.reason || 'No driver linked'}</small>
                                            </span>
                                            <StatusIndicator status={truck.status || 'IDLE'} />
                                        </button>
                                    )) : (
                                        <p className="form-note">No alternate trucks available.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="dispatch-actions-row">
                            <label className="tracking-url-field">
                                Public tracking URL
                                <span className="copy-field">
                                    <input readOnly value={publicTrackingUrl} />
                                    <button type="button" className="secondary-button compact-action" onClick={handleCopyTrackingUrl}>
                                        {copyUrlState || 'Copy'}
                                    </button>
                                </span>
                            </label>
                        </div>

                        {actionError && <p className="error-text">{actionError}</p>}
                    </div>
                </aside>
            </div>

            <div className="load-progress-panel">
                <StatusTimeline checkpoints={tracking.checkpoints} tracking={tracking} activityFeed={activityFeed} />
            </div>
        </section>
    )
}

export default ShipmentDetailPage
