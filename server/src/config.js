require('dotenv').config()

function readString(name, fallback = '') {
    const value = process.env[name]
    return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumber(name, fallback) {
    const value = Number(process.env[name])
    return Number.isFinite(value) ? value : fallback
}

module.exports = {
    port: readNumber('PORT', 3000),
    host: readString('HOST', '0.0.0.0'),
    corsOrigin: readString('CORS_ORIGIN', 'http://localhost:5173'),
    jwtSecret: readString('JWT_SECRET', 'supersecret'),
    databaseUrl: readString('DATABASE_URL', ''),
    simulatorUrl: readString('SIMULATOR_URL', ''),
    webhookUrl: readString('WEBHOOK_URL', ''),
    nominatimBaseUrl: readString('NOMINATIM_BASE_URL', 'https://nominatim.openstreetmap.org'),
    nominatimUserAgent: readString('NOMINATIM_USER_AGENT', 'shityTruckingCargoLLC/1.0 (local-dev)'),
    osrmBaseUrl: readString('OSRM_BASE_URL', 'http://router.project-osrm.org'),
    trackingCheckpointLimit: readNumber('TRACKING_CHECKPOINT_LIMIT', 100),
    trackingRouteMaxPoints: readNumber('TRACKING_ROUTE_MAX_POINTS', 250)
}