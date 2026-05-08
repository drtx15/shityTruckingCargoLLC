function toRad(value) {
    return (value * Math.PI) / 180
}

function haversineKm(fromLat, fromLng, toLat, toLng) {
    const earthRadiusKm = 6371
    const dLat = toRad(toLat - fromLat)
    const dLng = toRad(toLng - fromLng)

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2

    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

function estimateEtaMinutes(distanceKm, speedKph) {
    if (!speedKph || speedKph <= 1) {
        return null
    }

    return Math.max(1, Math.ceil((distanceKm / speedKph) * 60))
}

function normalizeRoutePoint(point) {
    const lat = Number(point?.lat)
    const lng = Number(point?.lng)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null
    }

    return { lat, lng }
}

function routeDistanceKm(routePolyline = []) {
    const points = routePolyline.map(normalizeRoutePoint).filter(Boolean)

    if (points.length < 2) {
        return null
    }

    let distance = 0
    for (let index = 1; index < points.length; index += 1) {
        distance += haversineKm(
            points[index - 1].lat,
            points[index - 1].lng,
            points[index].lat,
            points[index].lng
        )
    }

    return distance
}

function projectToSegmentKm(point, start, end) {
    const referenceLat = toRad((start.lat + end.lat + point.lat) / 3)
    const kmPerDegreeLat = 111.32
    const kmPerDegreeLng = 111.32 * Math.cos(referenceLat)
    const startX = start.lng * kmPerDegreeLng
    const startY = start.lat * kmPerDegreeLat
    const endX = end.lng * kmPerDegreeLng
    const endY = end.lat * kmPerDegreeLat
    const pointX = point.lng * kmPerDegreeLng
    const pointY = point.lat * kmPerDegreeLat
    const segmentX = endX - startX
    const segmentY = endY - startY
    const segmentLengthSquared = segmentX ** 2 + segmentY ** 2

    if (segmentLengthSquared <= 0) {
        return {
            ratio: 0,
            distanceToSegmentKm: haversineKm(point.lat, point.lng, start.lat, start.lng)
        }
    }

    const rawRatio = ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSquared
    const ratio = Math.max(0, Math.min(1, rawRatio))
    const projectedX = startX + segmentX * ratio
    const projectedY = startY + segmentY * ratio
    const dx = pointX - projectedX
    const dy = pointY - projectedY

    return {
        ratio,
        distanceToSegmentKm: Math.sqrt(dx ** 2 + dy ** 2)
    }
}

function remainingRouteDistanceKm(routePolyline = [], lat, lng) {
    const current = normalizeRoutePoint({ lat, lng })
    const points = routePolyline.map(normalizeRoutePoint).filter(Boolean)

    if (!current || points.length < 2) {
        return null
    }

    let best = null
    let distanceBeforeSegmentKm = 0

    for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1]
        const end = points[index]
        const segmentDistanceKm = haversineKm(start.lat, start.lng, end.lat, end.lng)
        const projection = projectToSegmentKm(current, start, end)
        const distanceAlongSegmentKm = segmentDistanceKm * projection.ratio

        if (!best || projection.distanceToSegmentKm < best.distanceToSegmentKm) {
            best = {
                distanceToSegmentKm: projection.distanceToSegmentKm,
                distanceFromRouteStartKm: distanceBeforeSegmentKm + distanceAlongSegmentKm
            }
        }

        distanceBeforeSegmentKm += segmentDistanceKm
    }

    if (!best) {
        return null
    }

    return Math.max(0, distanceBeforeSegmentKm - best.distanceFromRouteStartKm)
}

module.exports = {
    haversineKm,
    estimateEtaMinutes,
    remainingRouteDistanceKm,
    routeDistanceKm
}
