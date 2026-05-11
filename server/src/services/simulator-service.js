const config = require('../config')

function normalizeRoutePolyline(routePolyline) {
    if (!Array.isArray(routePolyline)) {
        return []
    }

    return routePolyline
        .map((point) => {
            const lat = Number(point?.lat)
            const lng = Number(point?.lng)

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return null
            }

            return { lat, lng }
        })
        .filter(Boolean)
}

async function startSimulation(app, shipment, truck) {
    const simulatorUrl = config.simulatorUrl.replace(/\/+$/, '')

    if (!simulatorUrl) {
        return { started: false, reason: 'SIMULATOR_URL is not set' }
    }

    const routePolyline = normalizeRoutePolyline(shipment.routePolyline)
    if (routePolyline.length < 2) {
        return { started: false, reason: 'Shipment route polyline is not available' }
    }

    const headers = {
        'content-type': 'application/json'
    }

    if (config.telematicsProviderApiKey) {
        headers['x-api-key'] = config.telematicsProviderApiKey
    }

    try {
        const response = await fetch(`${simulatorUrl}/v1/simulations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                truckId: truck.id,
                shipmentId: shipment.id,
                trackingCode: shipment.trackingCode,
                routePolyline
            })
        })

        if (!response.ok) {
            return {
                started: false,
                reason: `Simulator responded with ${response.status}`
            }
        }

        return { started: true }
    } catch (error) {
        app.log.error({ error }, 'Could not start simulator run')
        return { started: false, reason: 'Simulator unreachable' }
    }
}

module.exports = {
    startSimulation
}
