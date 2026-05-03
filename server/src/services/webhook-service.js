const crypto = require('crypto')

function signPayload(secret, payload) {
    return crypto.createHmac('sha256', secret || 'development-webhook-secret')
        .update(JSON.stringify(payload))
        .digest('hex')
}

async function createWebhookAttempts(app, eventType, shipment, payload) {
    if (!shipment?.shipperId) {
        return
    }

    const subscriptions = await app.prisma.webhookSubscription.findMany({
        where: {
            shipperId: shipment.shipperId,
            eventType,
            enabled: true
        }
    })

    for (const subscription of subscriptions) {
        await app.prisma.webhookAttempt.create({
            data: {
                subscriptionId: subscription.id,
                shipmentId: shipment.id,
                eventType,
                payload,
                state: 'PENDING'
            }
        })
    }
}

async function deliverWebhookAttempt(app, attemptId) {
    const attempt = await app.prisma.webhookAttempt.findUnique({
        where: { id: attemptId },
        include: { subscription: true }
    })

    if (!attempt || !attempt.subscription || !attempt.subscription.enabled) {
        return null
    }

    const payload = attempt.payload
    const signature = signPayload(attempt.subscription.signingSecretHash, payload)

    try {
        const response = await fetch(attempt.subscription.targetUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-logistics-event': attempt.eventType,
                'x-logistics-signature': signature
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
        })

        const responsePreview = await response.text().then((text) => text.slice(0, 500)).catch(() => '')
        const state = response.ok ? 'DELIVERED' : 'FAILED'

        return app.prisma.webhookAttempt.update({
            where: { id: attempt.id },
            data: {
                state,
                responseStatus: response.status,
                responsePreview,
                errorMessage: response.ok ? null : `HTTP ${response.status}`,
                nextRetryAt: response.ok || attempt.retryCount + 1 >= attempt.subscription.maxRetries
                    ? null
                    : new Date(Date.now() + Math.min(60, 5 * (attempt.retryCount + 1)) * 60 * 1000),
                retryCount: response.ok ? attempt.retryCount : attempt.retryCount + 1
            }
        })
    } catch (error) {
        const retryCount = attempt.retryCount + 1
        const canRetry = retryCount < attempt.subscription.maxRetries
        return app.prisma.webhookAttempt.update({
            where: { id: attempt.id },
            data: {
                state: canRetry ? 'RETRYING' : 'FAILED',
                errorMessage: error.message,
                retryCount,
                nextRetryAt: canRetry
                    ? new Date(Date.now() + Math.min(60, 5 * retryCount) * 60 * 1000)
                    : null
            }
        })
    }
}

async function flushPendingWebhookAttempts(app, limit = 25) {
    const attempts = await app.prisma.webhookAttempt.findMany({
        where: {
            OR: [
                { state: 'PENDING' },
                { state: 'RETRYING', nextRetryAt: { lte: new Date() } }
            ]
        },
        orderBy: { createdAt: 'asc' },
        take: limit
    })

    for (const attempt of attempts) {
        await deliverWebhookAttempt(app, attempt.id)
    }

    return attempts.length
}

async function emitShipmentWebhook(app, eventType, shipment, data = {}) {
    const payload = {
        event: eventType,
        shipmentId: shipment.id,
        trackingCode: shipment.trackingCode,
        status: shipment.status,
        priority: shipment.priority,
        timestamp: new Date().toISOString(),
        data
    }

    await createWebhookAttempts(app, eventType, shipment, payload)
}

module.exports = {
    createWebhookAttempts,
    deliverWebhookAttempt,
    emitShipmentWebhook,
    flushPendingWebhookAttempts,
    signPayload
}
