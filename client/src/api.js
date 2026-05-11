import { API_BASE_URL, WS_BASE_URL } from './config'

const TOKEN_KEY = 'transitGrid.authToken'

export function getAuthToken() {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem(TOKEN_KEY) || ''
}

export function setAuthToken(token) {
    if (typeof window === 'undefined') {
        return
    }

    if (token) {
        window.localStorage.setItem(TOKEN_KEY, token)
    } else {
        window.localStorage.removeItem(TOKEN_KEY)
    }
}

async function request(path, options = {}) {
    const headers = new Headers(options.headers || {})
    const hasBody = options.body !== undefined && options.body !== null
    const token = getAuthToken()

    if (hasBody && !headers.has('content-type') && !(options.body instanceof FormData)) {
        headers.set('content-type', 'application/json')
    }

    if (token && !headers.has('authorization')) {
        headers.set('authorization', `Bearer ${token}`)
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers
    })

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        if (response.status === 401) {
            setAuthToken('')
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('transit-grid:unauthorized'))
            }
        }
        throw new Error(payload.message || 'Request failed')
    }

    if (response.status === 204) {
        return null
    }

    return response.json()
}

export function requestLoginCode(email) {
    return request('/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({ email })
    })
}

export function verifyLoginCode(email, code) {
    return request('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code })
    })
}

export function loginWithPassword(email, password) {
    return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    })
}

export function registerAccount(payload) {
    return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export function getMe(options = {}) {
    return request('/auth/me', options)
}

export function updateMe(payload) {
    return request('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload)
    })
}

export function getUsers(options = {}) {
    return request('/users', options)
}

export function updateUser(id, payload) {
    return request(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    })
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

export function getPublicTracking(trackingCode, options = {}) {
    return request(`/tracking/code/${encodeURIComponent(trackingCode)}`, options)
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

export function getMyTruck(options = {}) {
    return request('/trucks/me', options)
}

export function createTruck(label) {
    return request('/trucks', {
        method: 'POST',
        body: JSON.stringify(typeof label === 'object' ? label : { label })
    })
}

export function updateTruck(truckId, label) {
    return request(`/trucks/${truckId}`, {
        method: 'PATCH',
        body: JSON.stringify(typeof label === 'object' ? label : { label })
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

export function getTruckSuggestions(shipmentId, options = {}) {
    return request(`/shipments/${shipmentId}/truck-suggestions`, options)
}

export function submitProofOfDelivery(shipmentId, payload) {
    return request(`/shipments/${shipmentId}/proof-of-delivery`, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export function getShippers(options = {}) {
    return request('/shippers', options)
}

export function getShipper(id, options = {}) {
    return request(`/shippers/${id}`, options)
}

export function createShipper(payload) {
    return request('/shippers', {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export function updateShipper(id, payload) {
    return request(`/shippers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    })
}

export function rotateShipperApiKey(id) {
    return request(`/shippers/${id}/api-key/rotate`, {
        method: 'POST'
    })
}

export function getWebhookSubscriptions(options = {}) {
    const params = options.shipperId ? `?shipperId=${encodeURIComponent(options.shipperId)}` : ''
    return request(`/webhook-subscriptions${params}`, options)
}

export function createWebhookSubscription(payload) {
    return request('/webhook-subscriptions', {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export function updateWebhookSubscription(id, payload) {
    return request(`/webhook-subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    })
}

export function getWebhookAttempts(options = {}) {
    const params = new URLSearchParams()
    if (options.shipmentId) params.set('shipmentId', options.shipmentId)
    if (options.state) params.set('state', options.state)
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return request(`/webhook-attempts${suffix}`, options)
}

export function retryWebhookAttempt(id) {
    return request(`/webhook-attempts/${id}/retry`, {
        method: 'POST'
    })
}

export function getAnalyticsOverview(options = {}) {
    return request('/analytics/overview', options)
}

export function getEtaHistory(options = {}) {
    const params = options.shipmentId ? `?shipmentId=${encodeURIComponent(options.shipmentId)}` : ''
    return request(`/analytics/eta-history${params}`, options)
}

export function openTrackingSocket({ shipmentId, trackingCode, onMessage, onError }) {
    const params = new URLSearchParams()
    if (shipmentId) params.set('shipmentId', shipmentId)
    if (trackingCode) params.set('trackingCode', trackingCode)
    if (shipmentId && !trackingCode) {
        const token = getAuthToken()
        if (token) params.set('token', token)
    }
    const socket = new WebSocket(`${WS_BASE_URL}/ws/tracking?${params.toString()}`)

    socket.addEventListener('message', (event) => {
        try {
            onMessage?.(JSON.parse(event.data))
        } catch (error) {
            onError?.(error)
        }
    })

    socket.addEventListener('error', () => {
        onError?.(new Error('Live tracking connection failed'))
    })

    return socket
}
