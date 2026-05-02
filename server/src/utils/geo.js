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

module.exports = {
    haversineKm,
    estimateEtaMinutes
}
