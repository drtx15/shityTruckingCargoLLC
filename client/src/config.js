const defaultApiBaseUrl = '/api'

export const API_BASE_URL = import.meta.env.VITE_API_URL || defaultApiBaseUrl

function getDefaultWsBaseUrl() {
    if (typeof window === 'undefined') {
        return 'ws://localhost:8080'
    }

    const wsUrl = new URL(window.location.origin)
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
    return wsUrl.toString().replace(/\/$/, '')
}

export const WS_BASE_URL = import.meta.env.VITE_WS_URL || getDefaultWsBaseUrl()
