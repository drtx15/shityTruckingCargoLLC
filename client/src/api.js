const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function request(path, options = {}) {
    const headers = new Headers(options.headers || {})
    const hasBody = options.body !== undefined && options.body !== null

    if (hasBody && !headers.has('content-type') && !(options.body instanceof FormData)) {
        headers.set('content-type', 'application/json')
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
    })

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Request failed')
    }

    return response.json()
}

export function getShipments() {
    return request('/shipments')
}

export function getShipment(id) {
    return request(`/shipments/${id}`)
}

export function createShipment(data) {
    return request('/shipments', {
        method: 'POST',
        body: JSON.stringify(data)
    })
}

export function searchLocations(query, limit = 5) {
    const params = new URLSearchParams({
        q: query,
        limit: String(limit)
    })
    return request(`/locations/search?${params.toString()}`)
}

export function getTrucks() {
    return request('/trucks')
}

export function seedTrucks() {
    return request('/trucks/seed', { method: 'POST' })
}

export function assignTruck(shipmentId, truckId) {
    return request(`/shipments/${shipmentId}/assign-truck`, {
        method: 'POST',
        body: JSON.stringify({ truckId })
    })
}

export function updateShipmentDestination(shipmentId, payload) {
    return request(`/shipments/${shipmentId}/destination`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    })
}

export function pauseShipment(shipmentId) {
    return request(`/shipments/${shipmentId}/pause`, {
        method: 'POST'
    })
}

export function resumeShipment(shipmentId) {
    return request(`/shipments/${shipmentId}/resume`, {
        method: 'POST'
    })
}

export function getTracking(shipmentId) {
    return request(`/tracking/${shipmentId}`)
}
