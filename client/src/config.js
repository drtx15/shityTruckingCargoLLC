const defaultApiBaseUrl =
    typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : 'http://localhost:3000'

export const API_BASE_URL = import.meta.env.VITE_API_URL || defaultApiBaseUrl

const apiUrl = new URL(
    API_BASE_URL,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
)
apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'
apiUrl.pathname = ''

export const WS_BASE_URL = import.meta.env.VITE_WS_URL || apiUrl.toString().replace(/\/$/, '')
