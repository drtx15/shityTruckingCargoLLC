const { searchLocations } = require('./geocoding-service')

const DEFAULT_OSRM_URL = 'http://router.project-osrm.org'

function normalizeCoordinate(value) {
    if (value === undefined || value === null || value === '') {
        return null
    }

    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeLocationText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function toRoutePolyline(coordinates) {
    return coordinates.map(([lng, lat]) => ({ lat, lng }))
}

async function resolveEndpoint(payload, prefix) {
    const latKey = `${prefix}Lat`
    const lngKey = `${prefix}Lng`
    const textKey = prefix

    const lat = normalizeCoordinate(payload[latKey])
    const lng = normalizeCoordinate(payload[lngKey])

    if (lat !== null && lng !== null) {
        return { lat, lng, source: 'coordinates' }
    }

    const text = normalizeLocationText(payload[textKey])
    if (!text) {
        throw new Error(`Provide ${prefix} coordinates or a ${prefix} location (city, address, ZIP, state/country)`)
    }

    const matches = await searchLocations(text, 1)
    if (!matches.length) {
        throw new Error(`Could not find coordinates for "${text}"`)
    }

    return {
        lat: matches[0].lat,
        lng: matches[0].lng,
        source: 'geocoded',
        label: matches[0].label
    }
}

async function buildRoutePolyline(origin, destination) {
    const osrmUrl = process.env.OSRM_BASE_URL || DEFAULT_OSRM_URL
    const url = new URL(`/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`, osrmUrl)
    url.searchParams.set('overview', 'full')
    url.searchParams.set('geometries', 'geojson')

    const response = await fetch(url, {
        headers: {
            accept: 'application/json'
        }
    })

    if (!response.ok) {
        throw new Error(`Route service responded with ${response.status}`)
    }

    const payload = await response.json()
    const route = payload?.routes?.[0]
    const coordinates = route?.geometry?.coordinates

    if (!route || !Array.isArray(coordinates) || coordinates.length < 2) {
        throw new Error('Route service did not return a valid road path')
    }

    return toRoutePolyline(coordinates)
}

async function planShipmentRoute(payload) {
    const origin = await resolveEndpoint(payload, 'origin')
    const destination = await resolveEndpoint(payload, 'destination')
    const routePolyline = await buildRoutePolyline(origin, destination)

    return {
        originLat: origin.lat,
        originLng: origin.lng,
        originLabel: origin.label || normalizeLocationText(payload.originLabel) || normalizeLocationText(payload.origin),
        destinationLat: destination.lat,
        destinationLng: destination.lng,
        destinationLabel: destination.label || normalizeLocationText(payload.destinationLabel) || normalizeLocationText(payload.destination),
        routePolyline
    }
}

module.exports = {
    planShipmentRoute,
    resolveEndpoint,
    buildRoutePolyline
}