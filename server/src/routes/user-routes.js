const { ROLES } = require('../services/role-access-service')
const { toSafeUser } = require('../services/auth-code-service')
const { persistAvatarValue } = require('../services/avatar-service')

async function userRoutes(app) {
    app.get('/', { preHandler: app.authorize([ROLES.ADMIN]) }, async () => {
        const users = await app.prisma.user.findMany({
            include: { organization: true, shipper: true, truck: true },
            orderBy: { email: 'asc' }
        })

        return users.map(toSafeUser)
    })

    app.patch('/:id', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request, reply) => {
        const id = Number(request.params.id)
        const patch = {}

        if (Object.values(ROLES).includes(request.body?.role)) {
            patch.role = request.body.role
        }

        if (typeof request.body?.displayName === 'string') {
            patch.displayName = request.body.displayName.trim() || null
        }

        if (typeof request.body?.avatarUrl === 'string') {
            try {
                patch.avatarUrl = await persistAvatarValue(request.body.avatarUrl)
            } catch (error) {
                return reply.code(400).send({ message: error.message })
            }
        }

        if (typeof request.body?.title === 'string') {
            patch.title = request.body.title.trim() || null
        }

        if (typeof request.body?.organizationName === 'string') {
            patch.organizationName = request.body.organizationName.trim() || null
        }

        if (['OWNER', 'MANAGER', 'DISPATCHER', 'DRIVER', 'ACCOUNTING', 'VIEWER'].includes(request.body?.organizationRole)) {
            patch.organizationRole = request.body.organizationRole
        }

        if ('organizationId' in (request.body || {})) {
            patch.organizationId = request.body.organizationId ? Number(request.body.organizationId) : null
        }

        if ('shipperId' in (request.body || {})) {
            patch.shipperId = request.body.shipperId ? Number(request.body.shipperId) : null
        }

        if ('truckId' in (request.body || {})) {
            patch.truckId = request.body.truckId ? Number(request.body.truckId) : null
        }

        if (!Object.keys(patch).length) {
            return reply.code(400).send({ message: 'No user fields provided' })
        }

        try {
            const user = await app.prisma.user.update({
                where: { id },
                data: patch,
                include: { organization: true, shipper: true, truck: true }
            })

            return toSafeUser(user)
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'User not found' })
            }

            throw error
        }
    })
}

module.exports = userRoutes
