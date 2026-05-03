const fp = require('fastify-plugin')
const config = require('../config')
const { toSafeUser } = require('../services/auth-code-service')

async function authPlugin(app) {
    app.register(require('@fastify/jwt'), {
        secret: config.jwtSecret
    })

    app.decorate('authenticate', async function authenticate(request, reply) {
        try {
            const claims = await request.jwtVerify()
            const userId = Number(claims.userId)
            const user = await app.prisma.user.findUnique({
                where: { id: userId },
                include: { shipper: true, truck: true }
            })

            if (!user) {
                return reply.code(401).send({ message: 'Unauthorized' })
            }

            request.user = toSafeUser(user)
        } catch (error) {
            return reply.code(401).send({ message: 'Unauthorized' })
        }
    })

    app.decorate('authorize', function authorize(roles = []) {
        const allowed = new Set(Array.isArray(roles) ? roles : [roles])

        return async function authorizeRequest(request, reply) {
            await app.authenticate(request, reply)

            if (reply.sent) {
                return
            }

            if (allowed.size > 0 && !allowed.has(request.user?.role)) {
                return reply.code(403).send({ message: 'Forbidden' })
            }
        }
    })
}

module.exports = fp(authPlugin)
