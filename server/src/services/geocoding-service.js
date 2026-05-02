const config = require('../config')

const CACHE_TTL_MS = 10 * 60 * 1000

const searchCache = new Map()

function normalizeLimit(value) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
        return 5
    }

    return Math.min(10, Math.max(1, Math.floor(parsed)))
}

function normalizeQuery(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function makeCacheKey(query, limit) {
    return `${normalizeQuery(query).toLowerCase()}::${normalizeLimit(limit)}`
}

function readCache(key) {
    const entry = searchCache.get(key)
    if (!entry) {
        return null
    }

    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
        searchCache.delete(key)
        return null
    }

    return entry.results
}

function writeCache(key, results) {
    searchCache.set(key, {
        cachedAt: Date.now(),
        results
    })
}

function formatPhotonLabel(properties) {
    const parts = [
        properties.name,
        properties.street,
        properties.city || properties.town || properties.village || properties.county,
        properties.state,
        properties.country
    ]

    return parts.filter((part, index, array) => part && array.indexOf(part) === index).join(', ')
}

async function searchPhotonLocations(query, limit) {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', query)
    url.searchParams.set('limit', String(normalizeLimit(limit)))

    const response = await fetch(url, {
        headers: {
            accept: 'application/json'
        }
    })

    if (!response.ok) {
        throw new Error(`Fallback location service responded with ${response.status}`)
    }

    const payload = await response.json()
    if (!payload || !Array.isArray(payload.features)) {
        return []
    }

    return payload.features
        .map((feature) => {
            const coordinates = feature?.geometry?.coordinates
            const properties = feature?.properties || {}

            if (!Array.isArray(coordinates) || coordinates.length < 2) {
                return null
            }

            const lng = Number(coordinates[0])
            const lat = Number(coordinates[1])
            const label = formatPhotonLabel(properties)

            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label) {
                return null
            }

            return {
                label,
                lat,
                lng,
                placeType: properties.type || null,
                category: properties.osm_key || null
            }
        })
        .filter(Boolean)
}

async function searchLocations(query, limit = 5) {
    const normalizedQuery = normalizeQuery(query)
    if (normalizedQuery.length < 2) {
        return []
    }

    const cacheKey = makeCacheKey(normalizedQuery, limit)
    const cachedResults = readCache(cacheKey)
    if (cachedResults) {
        return cachedResults
    }

    const url = new URL('/search', config.nominatimBaseUrl)
    url.searchParams.set('q', normalizedQuery)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('limit', String(normalizeLimit(limit)))

    const headers = {
        'accept': 'application/json',
        'user-agent': config.nominatimUserAgent
    }

    const response = await fetch(url, { headers })
    if (!response.ok) {
        const fallbackResults = await searchPhotonLocations(normalizedQuery, limit).catch(() => [])
        if (fallbackResults.length) {
            writeCache(cacheKey, fallbackResults)
            return fallbackResults
        }

        throw new Error(`Location service responded with ${response.status}`)
    }

    const payload = await response.json()
    if (!Array.isArray(payload)) {
        return []
    }

    const results = payload
        .map((item) => {
            const lat = Number(item.lat)
            const lng = Number(item.lon)

            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !item.display_name) {
                return null
            }

            return {
                label: item.display_name,
                lat,
                lng,
                placeType: item.type || null,
                category: item.class || null
            }
        })
        .filter(Boolean)

    writeCache(cacheKey, results)

    return results
}

async function geocodeSingleLocation(query) {
    const candidates = await searchLocations(query, 1)
    if (!candidates.length) {
        throw new Error(`Could not find coordinates for "${query}"`)
    }

    return candidates[0]
}

module.exports = {
    searchLocations,
    geocodeSingleLocation
}
