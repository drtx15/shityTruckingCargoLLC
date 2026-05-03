const { deliverWebhookAttempt } = require('../services/webhook-service')
const { hashSecret } = require('../services/api-key-service')
const { ROLES } = require('../services/role-access-service')

const allowedEvents = new Set([
    'shipment.assigned',
    'shipment.departed',
    'shipment.delayed',
    'shipment.arrived'
])

async function webhookRoutes(app) {
    app.get('/webhook-subscriptions', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request) => {
        const shipperId = Number(request.query?.shipperId)

        return app.prisma.webhookSubscription.findMany({
            where: Number.isFinite(shipperId) && shipperId > 0 ? { shipperId } : {},
            include: {
                shipper: {
                    select: {
                        id: true,
                        companyName: true,
                        contactEmail: true
                    }
                },
                _count: {
                    select: { attempts: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        })
    })

    app.post('/webhook-subscriptions', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request, reply) => {
        const shipperId = Number(request.body?.shipperId)
        const eventType = typeof request.body?.eventType === 'string' ? request.body.eventType : ''
        const targetUrl = typeof request.body?.targetUrl === 'string' ? request.body.targetUrl.trim() : ''
        const secret = typeof request.body?.signingSecret === 'string' ? request.body.signingSecret : ''

        if (!shipperId || !allowedEvents.has(eventType) || !targetUrl) {
            return reply.code(400).send({ message: 'shipperId, supported eventType, and targetUrl are required' })
        }

        const subscription = await app.prisma.webhookSubscription.create({
            data: {
                shipperId,
                eventType,
                targetUrl,
                signingSecretHash: secret ? hashSecret(secret) : null,
                enabled: request.body?.enabled !== false,
                maxRetries: Number.isFinite(Number(request.body?.maxRetries)) ? Number(request.body.maxRetries) : 3
            }
        })

        return reply.code(201).send(subscription)
    })

    app.patch('/webhook-subscriptions/:id', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request, reply) => {
        const id = Number(request.params.id)
        const patch = {}

        if (typeof request.body?.eventType === 'string') {
            if (!allowedEvents.has(request.body.eventType)) {
                return reply.code(400).send({ message: 'Unsupported eventType' })
            }
            patch.eventType = request.body.eventType
        }

        if (typeof request.body?.targetUrl === 'string') {
            patch.targetUrl = request.body.targetUrl.trim()
        }

        if (typeof request.body?.signingSecret === 'string' && request.body.signingSecret) {
            patch.signingSecretHash = hashSecret(request.body.signingSecret)
        }

        if (typeof request.body?.enabled === 'boolean') {
            patch.enabled = request.body.enabled
        }

        if (Number.isFinite(Number(request.body?.maxRetries))) {
            patch.maxRetries = Number(request.body.maxRetries)
        }

        try {
            return await app.prisma.webhookSubscription.update({
                where: { id },
                data: patch
            })
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Webhook subscription not found' })
            }
            throw error
        }
    })

    app.get('/webhook-attempts', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request) => {
        const shipmentId = Number(request.query?.shipmentId)
        const state = typeof request.query?.state === 'string' ? request.query.state : undefined

        return app.prisma.webhookAttempt.findMany({
            where: {
                ...(Number.isFinite(shipmentId) && shipmentId > 0 ? { shipmentId } : {}),
                ...(state ? { state } : {})
            },
            include: {
                subscription: {
                    include: {
                        shipper: {
                            select: {
                                id: true,
                                companyName: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        })
    })

    app.post('/webhook-attempts/:id/retry', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request, reply) => {
        const id = Number(request.params.id)
        const attempt = await deliverWebhookAttempt(app, id)

        if (!attempt) {
            return reply.code(404).send({ message: 'Webhook attempt not found or disabled' })
        }

        return attempt
    })
}

module.exports = webhookRoutes
