import { API_BASE_URL } from './config'

async function request(path, options = {}) {
    const headers = new Headers(options.headers || {})
    const hasBody = options.body !== undefined && options.body !== null

    if (hasBody && !headers.has('content-type') && !(options.body instanceof FormData)) {
        headers.set('content-type', 'application/json')
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers
    })

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Request failed')
    }

    return response.json()
}

export function getShipments(options = {}) {
    return request('/shipments', options)
}

export function getShipment(id, options = {}) {
    return request(`/shipments/${id}`, options)
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

export function getTrucks(options = {}) {
    return request('/trucks', options)
}

export function createTruck(label) {
    return request('/trucks', {
        method: 'POST',
        body: JSON.stringify({ label })
    })
}

export function updateTruck(truckId, label) {
    return request(`/trucks/${truckId}`, {
        method: 'PATCH',
        body: JSON.stringify({ label })
    })
}

export function deleteTruck(truckId) {
    return request(`/trucks/${truckId}`, {
        method: 'DELETE'
    })
}

export function assignTruck(shipmentId, truckId) {
    return request(`/shipments/${shipmentId}/assign-truck`, {
        method: 'POST',
        body: JSON.stringify({ truckId })
    })
}



export function updateShipment(shipmentId, payload) {
    return request(`/shipments/${shipmentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    })
}

export function deleteShipment(shipmentId) {
    return request(`/shipments/${shipmentId}`, {
        method: 'DELETE'
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

export function getTracking(shipmentId, options = {}) {
    return request(`/tracking/${shipmentId}`, options)
}
