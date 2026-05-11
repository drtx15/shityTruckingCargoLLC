import { TruckIcon } from './IconControls'
import StatusIndicator from './StatusIndicator'

const TRANSIT_CHECKPOINT_INTERVAL_SECONDS = 45
const ASSUMED_CITY_SPEED_KPH = 80
const MAX_PLANNED_TRANSIT_DOTS = 64

function formatTimestamp(value) {
    return value ? new Date(value).toLocaleString() : 'Unknown time'
}

function formatStageLabel(value) {
    return String(value || '')
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/^\w/, (char) => char.toUpperCase())
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

function haversineKm(left, right) {
    if (!left || !right) {
        return null
    }

    const lat1 = Number(left.lat)
    const lng1 = Number(left.lng)
    const lat2 = Number(right.lat)
    const lng2 = Number(right.lng)

    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
        return null
    }

    const toRad = (degrees) => degrees * Math.PI / 180
    const earthRadiusKm = 6371
    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function routeDistanceKm(route) {
    const points = getRoutePoints(route)

    if (points.length < 2) {
        return null
    }

    return points.slice(1).reduce((sum, point, index) => {
        const distance = haversineKm(points[index], point)
        return distance === null ? sum : sum + distance
    }, 0)
}

function getRoutePoints(route) {
    return Array.isArray(route?.routePolyline) && route.routePolyline.length > 1
        ? route.routePolyline
        : [route?.origin, route?.destination].filter(Boolean)
}

function pointToRouteProgress(route, point) {
    const points = getRoutePoints(route)
    if (!point || points.length < 2) {
        return null
    }

    const lat = Number(point.lat ?? point.currentLat)
    const lng = Number(point.lng ?? point.currentLng)
    if (![lat, lng].every(Number.isFinite)) {
        return null
    }

    const validPoints = points
        .map((routePoint) => ({
            lat: Number(routePoint.lat),
            lng: Number(routePoint.lng)
        }))
        .filter((routePoint) => Number.isFinite(routePoint.lat) && Number.isFinite(routePoint.lng))

    if (validPoints.length < 2) {
        return null
    }

    const referenceLat = validPoints.reduce((sum, routePoint) => sum + routePoint.lat, 0) / validPoints.length
    const toXY = (routePoint) => ({
        x: routePoint.lng * Math.cos(referenceLat * Math.PI / 180) * 111.32,
        y: routePoint.lat * 110.57
    })
    const projectedPoint = toXY({ lat, lng })
    const projectedRoute = validPoints.map(toXY)
    const segmentLengths = projectedRoute.slice(1).map((routePoint, index) => {
        const previous = projectedRoute[index]
        return Math.hypot(routePoint.x - previous.x, routePoint.y - previous.y)
    })
    const totalLength = segmentLengths.reduce((sum, distance) => sum + distance, 0)

    if (!totalLength) {
        return null
    }

    let bestDistance = Infinity
    let bestAlong = 0
    let accumulated = 0

    projectedRoute.slice(1).forEach((routePoint, index) => {
        const previous = projectedRoute[index]
        const segmentLength = segmentLengths[index]
        if (!segmentLength) {
            return
        }

        const segmentX = routePoint.x - previous.x
        const segmentY = routePoint.y - previous.y
        const t = clamp(
            ((projectedPoint.x - previous.x) * segmentX + (projectedPoint.y - previous.y) * segmentY) / (segmentLength ** 2),
            0,
            1
        )
        const candidate = {
            x: previous.x + segmentX * t,
            y: previous.y + segmentY * t
        }
        const distance = Math.hypot(projectedPoint.x - candidate.x, projectedPoint.y - candidate.y)
        if (distance < bestDistance) {
            bestDistance = distance
            bestAlong = accumulated + segmentLength * t
        }
        accumulated += segmentLength
    })

    return clamp(bestAlong / totalLength, 0, 1)
}

function sortByTime(items) {
    return items.slice().sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
}

function firstCheckpoint(checkpoints, type) {
    return checkpoints.find((checkpoint) => checkpoint.type === type)
}

function getRouteProgress(tracking, totalKm, delivered) {
    if (delivered) {
        return 1
    }

    const remainingKm = Number(tracking?.routeRemainingKm)
    if (totalKm > 0 && Number.isFinite(remainingKm)) {
        return clamp(1 - remainingKm / totalKm, 0, 1)
    }

    return pointToRouteProgress(tracking?.route, tracking?.truck)
}

function estimateTransitCount({ arrived, departed, observedTransitCount, routeProgress, totalKm, tracking }) {
    const estimates = [observedTransitCount]

    if (departed?.timestamp && arrived?.timestamp) {
        const elapsedSeconds = Math.max(0, (new Date(arrived.timestamp) - new Date(departed.timestamp)) / 1000)
        estimates.push(Math.ceil(elapsedSeconds / TRANSIT_CHECKPOINT_INTERVAL_SECONDS))
    }

    if (observedTransitCount > 0 && routeProgress && routeProgress > 0.04) {
        estimates.push(Math.ceil(observedTransitCount / routeProgress))
    }

    if (departed?.timestamp && Number.isFinite(Number(tracking?.etaMinutes)) && tracking.etaMinutes > 0) {
        const elapsedSeconds = Math.max(0, (Date.now() - new Date(departed.timestamp).getTime()) / 1000)
        estimates.push(Math.ceil((elapsedSeconds + Number(tracking.etaMinutes) * 60) / TRANSIT_CHECKPOINT_INTERVAL_SECONDS))
    }

    if (totalKm > 0) {
        const estimatedSeconds = (totalKm / ASSUMED_CITY_SPEED_KPH) * 3600
        estimates.push(Math.ceil(estimatedSeconds / TRANSIT_CHECKPOINT_INTERVAL_SECONDS))
    }

    const raw = Math.max(1, ...estimates.filter(Number.isFinite))
    return Math.min(Math.max(raw, observedTransitCount), MAX_PLANNED_TRANSIT_DOTS)
}

function buildProgressModel(tracking, activityFeed) {
    const checkpoints = sortByTime(Array.isArray(tracking?.checkpoints) ? tracking.checkpoints : [])
    const created = firstCheckpoint(checkpoints, 'CREATED')
    const assigned = firstCheckpoint(checkpoints, 'ASSIGNED')
    const departed = firstCheckpoint(checkpoints, 'DEPARTED')
    const arrived = firstCheckpoint(checkpoints, 'ARRIVED') || firstCheckpoint(checkpoints, 'DELIVERED')
    const transitCheckpoints = checkpoints.filter((checkpoint) => checkpoint.type === 'IN_TRANSIT')
    const proofDeliveredAt = tracking?.proofOfDelivery?.deliveredAt
    const delivered = tracking?.status === 'ARRIVED' || Boolean(arrived) || Boolean(proofDeliveredAt)
    const createdAt = created?.timestamp || tracking?.createdAt
    const deliveredAt = proofDeliveredAt || arrived?.timestamp
    const totalKm = routeDistanceKm(tracking?.route)
    const routeProgress = getRouteProgress(tracking, totalKm, delivered)
    const expectedTransitCount = estimateTransitCount({
        arrived,
        departed,
        observedTransitCount: transitCheckpoints.length,
        routeProgress,
        totalKm,
        tracking
    })
    const stageSteps = [
        { key: 'created', label: 'Created', timestamp: createdAt, complete: Boolean(createdAt) },
        { key: 'assigned', label: 'Assigned', timestamp: assigned?.timestamp, complete: Boolean(assigned) },
        { key: 'departed', label: 'Departed', timestamp: departed?.timestamp, complete: Boolean(departed) },
        {
            key: 'transit-summary',
            label: 'In transit',
            timestamp: transitCheckpoints.at(-1)?.timestamp,
            complete: transitCheckpoints.length > 0,
            detail: `${transitCheckpoints.length}/${expectedTransitCount} GPS updates`
        },
        { key: 'delivered', label: 'Delivered', timestamp: deliveredAt, complete: Boolean(deliveredAt) }
    ]
    const observedTransitCount = transitCheckpoints.length
    const fallbackProgress = expectedTransitCount > 0
        ? clamp(observedTransitCount / expectedTransitCount, 0, 1)
        : 0
    const transitProgress = routeProgress ?? fallbackProgress
    const progressPercent = delivered
        ? 100
        : departed
            ? Math.round(clamp(transitProgress, 0, 1) * 100)
            : 0
    const transitNodes = transitCheckpoints.map((checkpoint, index) => {
        const checkpointProgress = pointToRouteProgress(tracking?.route, checkpoint)
        const fallbackPosition = expectedTransitCount > 0
            ? ((index + 1) / expectedTransitCount) * 100
            : 0

        return {
            key: `transit-${checkpoint.id || index}`,
            kind: 'transit',
            label: `GPS update ${index + 1}`,
            timestamp: checkpoint.timestamp,
            detail: `${checkpoint.lat.toFixed(4)}, ${checkpoint.lng.toFixed(4)}`,
            complete: true,
            position: clamp((checkpointProgress ?? fallbackPosition / 100) * 100, 0, 100)
        }
    })
    const nodes = [
        { key: 'origin', kind: 'major', label: 'Origin', timestamp: createdAt, complete: Boolean(createdAt), position: 0 },
        ...transitNodes
            .filter((node, index, allNodes) => {
                const previous = allNodes[index - 1]
                return !previous || Math.abs(node.position - previous.position) >= 0.8
            }),
        { key: 'destination', kind: 'major', label: 'Destination', timestamp: deliveredAt, complete: delivered, position: 100 }
    ].sort((left, right) => left.position - right.position)
    const latestCheckpoint = checkpoints.at(-1)
    const latestEvent = activityFeed.at(-1) || latestCheckpoint
    const statusLabel = delivered
        ? 'Delivered'
        : tracking?.status === 'DELAYED'
            ? 'Delayed'
            : departed
                ? `Transit ${observedTransitCount}/${expectedTransitCount}`
                : assigned
                    ? 'Assigned'
                    : 'Created'
    const currentTitle = `${statusLabel} - ${progressPercent}% route`

    return {
        currentTitle,
        expectedTransitCount,
        latestEvent,
        nodes,
        observedTransitCount,
        progressPercent,
        stageSteps,
        statusLabel,
        transitCheckpoints
    }
}

function formatLatestTitle(event, fallback) {
    if (!event) {
        return fallback
    }

    if (event.title === 'Shipment created') {
        return event.title
    }

    return formatStageLabel(event.title || event.type) || fallback
}

function StatusTimeline({ checkpoints, tracking, activityFeed = [] }) {
    const normalizedCheckpoints = checkpoints || tracking?.checkpoints || []
    const entries = activityFeed.length ? activityFeed : normalizedCheckpoints.map((checkpoint) => ({
        id: checkpoint.id,
        title: formatStageLabel(checkpoint.type),
        detail: `${checkpoint.lat.toFixed(4)}, ${checkpoint.lng.toFixed(4)}`,
        timestamp: checkpoint.timestamp
    }))
    const hasEntries = Boolean(entries.length || tracking?.createdAt)
    const progress = buildProgressModel({ ...tracking, checkpoints: normalizedCheckpoints }, entries)
    const latestTitle = formatLatestTitle(progress.latestEvent, progress.currentTitle)
    const latestDetail = progress.latestEvent?.detail || (
        progress.latestEvent?.lat !== undefined && progress.latestEvent?.lng !== undefined
            ? `${progress.latestEvent.lat.toFixed(4)}, ${progress.latestEvent.lng.toFixed(4)}`
            : ''
    )
    const majorSteps = progress.stageSteps

    return (
        <div className="panel">
            <div className="timeline-header">
                <div>
                    <p className="eyebrow">Shipment progress</p>
                    <h2>{progress.currentTitle}</h2>
                </div>
                {tracking?.isPaused && <StatusIndicator label="Paused" className="status-paused" />}
            </div>
            {!hasEntries ? (
                <div className="empty-state compact">
                    <h3>No checkpoints yet.</h3>
                    <p>Movement events will appear here once the truck departs.</p>
                </div>
            ) : (
                <div className="shipment-progress" style={{ '--progress': `${progress.progressPercent}%` }}>
                    <div className="shipment-progress-track" aria-label={`Transit updates ${progress.observedTransitCount} of ${progress.expectedTransitCount}`}>
                        <span className="shipment-progress-fill" />
                        <span className="progress-truck" aria-hidden="true">
                            <TruckIcon />
                        </span>
                        {progress.nodes.map((node) => (
                            <span
                                key={node.key}
                                className={`progress-dot progress-dot-${node.kind} ${node.complete ? 'is-complete' : ''}`}
                                style={{ left: `${node.position}%` }}
                                title={`${node.label}${node.timestamp ? ` · ${formatTimestamp(node.timestamp)}` : ''}`}
                            />
                        ))}
                    </div>
                    <ol className="progress-steps" aria-label="Shipment progress">
                        {majorSteps.map((step) => (
                            <li key={step.key} className={step.complete ? 'is-complete' : ''}>
                                <strong>{step.label}</strong>
                                <span>{step.detail || (step.timestamp ? formatTimestamp(step.timestamp) : 'Pending')}</span>
                            </li>
                        ))}
                    </ol>
                    <div className="progress-latest">
                        <span>Last update</span>
                        <strong>{latestTitle}</strong>
                        {latestDetail && <small>{latestDetail}</small>}
                        <time>{formatTimestamp(progress.latestEvent?.timestamp || tracking?.updatedAt)}</time>
                    </div>
                </div>
            )}
        </div>
    )
}

export default StatusTimeline
