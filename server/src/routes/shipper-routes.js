const { createApiKey } = require('../services/api-key-service')
const { CUSTOMER_ADMIN_ROLES, ROLES, roleList } = require('../services/role-access-service')

function sanitizeShipper(shipper) {
    if (!shipper) {
        return shipper
    }

    const { apiKeyHash, ...safe } = shipper
    return safe
}

async function shipperRoutes(app) {
    app.get('/', { preHandler: app.authorize([ROLES.CUSTOMER, ...roleList(CUSTOMER_ADMIN_ROLES)]) }, async (request) => {
        const shippers = await app.prisma.shipper.findMany({
            where: request.user.role === ROLES.CUSTOMER ? { id: request.user.shipperId || -1 } : {},
            include: {
                _count: {
                    select: {
                        shipments: true,
                        webhookSubscriptions: true
                    }
                }
            },
            orderBy: { companyName: 'asc' }
        })

        return shippers.map(sanitizeShipper)
    })

    app.post('/', { preHandler: app.authorize(roleList(CUSTOMER_ADMIN_ROLES)) }, async (request, reply) => {
        const companyName = typeof request.body?.companyName === 'string' ? request.body.companyName.trim() : ''
        const contactEmail = typeof request.body?.contactEmail === 'string' ? request.body.contactEmail.trim().toLowerCase() : ''

        if (!companyName || !contactEmail) {
            return reply.code(400).send({ message: 'companyName and contactEmail are required' })
        }

        const key = createApiKey()

        try {
            const shipper = await app.prisma.shipper.create({
                data: {
                    companyName,
                    contactEmail,
                    apiKeyPrefix: key.apiKeyPrefix,
                    apiKeyHash: key.apiKeyHash
                }
            })

            return reply.code(201).send({
                ...sanitizeShipper(shipper),
                apiKey: key.apiKey
            })
        } catch (error) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ message: 'Shipper contact email must be unique' })
            }
            throw error
        }
    })

    app.get('/:id', { preHandler: app.authorize([ROLES.CUSTOMER, ...roleList(CUSTOMER_ADMIN_ROLES)]) }, async (request, reply) => {
        const shipperId = Number(request.params.id)

        if (request.user.role === ROLES.CUSTOMER && Number(request.user.shipperId) !== shipperId) {
            return reply.code(403).send({ message: 'Forbidden' })
        }

        const shipper = await app.prisma.shipper.findUnique({
            where: { id: shipperId },
            include: {
                shipments: {
                    orderBy: { createdAt: 'desc' },
                    take: 25,
                    include: {
                        assignedTruck: {
                            select: { id: true, label: true, status: true }
                        }
                    }
                },
                webhookSubscriptions: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        })

        if (!shipper) {
            return reply.code(404).send({ message: 'Shipper not found' })
        }

        return sanitizeShipper(shipper)
    })

    app.patch('/:id', { preHandler: app.authorize(roleList(CUSTOMER_ADMIN_ROLES)) }, async (request, reply) => {
        const shipperId = Number(request.params.id)
        const patch = {}

        if (typeof request.body?.companyName === 'string') {
            patch.companyName = request.body.companyName.trim()
        }

        if (typeof request.body?.contactEmail === 'string') {
            patch.contactEmail = request.body.contactEmail.trim().toLowerCase()
        }

        if (typeof request.body?.isActive === 'boolean') {
            patch.isActive = request.body.isActive
        }

        try {
            const shipper = await app.prisma.shipper.update({
                where: { id: shipperId },
                data: patch
            })

            return sanitizeShipper(shipper)
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Shipper not found' })
            }
            if (error.code === 'P2002') {
                return reply.code(409).send({ message: 'Shipper contact email must be unique' })
            }
            throw error
        }
    })

    app.post('/:id/api-key/rotate', { preHandler: app.authorize(roleList(CUSTOMER_ADMIN_ROLES)) }, async (request, reply) => {
        const shipperId = Number(request.params.id)
        const key = createApiKey()

        try {
            const shipper = await app.prisma.shipper.update({
                where: { id: shipperId },
                data: {
                    apiKeyPrefix: key.apiKeyPrefix,
                    apiKeyHash: key.apiKeyHash
                }
            })

            return {
                ...sanitizeShipper(shipper),
                apiKey: key.apiKey
            }
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Shipper not found' })
            }
            throw error
        }
    })
}

module.exports = shipperRoutes
