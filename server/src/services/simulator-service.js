const config = require('../config')

async function startSimulation(app, shipment, truck) {
    const simulatorUrl = config.simulatorUrl

    if (!simulatorUrl) {
        return { started: false, reason: 'SIMULATOR_URL is not set' }
    }

    try {
        const response = await fetch(`${simulatorUrl}/simulate/start`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                truckId: truck.id,
                shipmentId: shipment.id
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
