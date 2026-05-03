const SNAPSHOT_TTL_SECONDS = 60 * 60

function snapshotKey(shipmentId) {
    return `tracking:snapshot:${shipmentId}`
}

function publicSnapshotKey(trackingCode) {
    return `tracking:public:${trackingCode}`
}

function toPublicTrackingPayload(tracking) {
    if (!tracking) {
        return null
    }

    return {
        trackingCode: tracking.trackingCode,
        status: tracking.status,
        priority: tracking.priority,
        etaMinutes: tracking.etaMinutes,
        estimatedAt: tracking.estimatedAt,
        originLabel: tracking.originLabel,
        destinationLabel: tracking.destinationLabel,
        route: tracking.route,
        truck: tracking.truck
            ? {
                label: tracking.truck.label,
                status: tracking.truck.status,
                currentLat: tracking.truck.currentLat,
                currentLng: tracking.truck.currentLng,
                currentSpeed: tracking.truck.currentSpeed,
                lastUpdatedAt: tracking.truck.lastUpdatedAt
            }
            : null,
        checkpoints: tracking.checkpoints?.map((checkpoint) => ({
            type: checkpoint.type,
            timestamp: checkpoint.timestamp,
            lat: checkpoint.lat,
            lng: checkpoint.lng
        })) || []
    }
}

async function readTrackingSnapshot(redis, shipmentId) {
    if (!redis) {
        return null
    }

    const raw = await redis.get(snapshotKey(shipmentId))
    return raw ? JSON.parse(raw) : null
}

async function readPublicTrackingSnapshot(redis, trackingCode) {
    if (!redis) {
        return null
    }

    const raw = await redis.get(publicSnapshotKey(trackingCode))
    return raw ? JSON.parse(raw) : null
}

async function writeTrackingSnapshot(redis, tracking) {
    if (!redis || !tracking?.shipmentId) {
        return
    }

    await redis.set(snapshotKey(tracking.shipmentId), JSON.stringify(tracking), 'EX', SNAPSHOT_TTL_SECONDS)

    if (tracking.trackingCode) {
        await redis.set(
            publicSnapshotKey(tracking.trackingCode),
            JSON.stringify(toPublicTrackingPayload(tracking)),
            'EX',
            SNAPSHOT_TTL_SECONDS
        )
    }
}

async function publishTrackingEvent(app, tracking, eventType = 'location.updated') {
    if (!tracking) {
        return
    }

    await writeTrackingSnapshot(app.redis, tracking)

    const event = {
        type: eventType,
        shipmentId: tracking.shipmentId,
        trackingCode: tracking.trackingCode,
        payload: tracking,
        publicPayload: toPublicTrackingPayload(tracking),
        emittedAt: new Date().toISOString()
    }

    if (app.redis) {
        await app.redis.publish('tracking:events', JSON.stringify(event))
    }

    if (typeof app.broadcastTracking === 'function') {
        app.broadcastTracking(event)
    }
}

module.exports = {
    publishTrackingEvent,
    readPublicTrackingSnapshot,
    readTrackingSnapshot,
    toPublicTrackingPayload,
    writeTrackingSnapshot
}
