const fp = require('fastify-plugin')

async function authPlugin(app) {
    app.register(require('@fastify/jwt'), {
        secret: process.env.JWT_SECRET || 'supersecret'
    })

    app.decorate('authenticate', async function authenticate(request, reply) {
        try {
            await request.jwtVerify()
        } catch (error) {
            reply.code(401).send({ message: 'Unauthorized' })
        }
    })
}

module.exports = fp(authPlugin)
