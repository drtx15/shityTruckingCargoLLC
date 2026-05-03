const { ROLES } = require('../services/role-access-service')
const { toSafeUser } = require('../services/auth-code-service')

async function userRoutes(app) {
    app.get('/', { preHandler: app.authorize([ROLES.ADMIN]) }, async () => {
        const users = await app.prisma.user.findMany({
            include: { shipper: true, truck: true },
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
                include: { shipper: true, truck: true }
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
