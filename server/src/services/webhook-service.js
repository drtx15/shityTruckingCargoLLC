const config = require('../config')

async function sendStatusWebhook(app, payload) {
    const webhookUrl = config.webhookUrl

    if (!webhookUrl) {
        return
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        if (!response.ok) {
            app.log.warn({ status: response.status }, 'Webhook returned non-2xx status')
        }
    } catch (error) {
        app.log.error({ error }, 'Failed to send webhook event')
    }
}

module.exports = {
    sendStatusWebhook
}
