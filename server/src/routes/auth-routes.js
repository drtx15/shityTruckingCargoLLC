const bcrypt = require('bcrypt')
const {
    buildTokenPayload,
    requestLoginCode,
    toSafeUser,
    verifyLoginCode
} = require('../services/auth-code-service')

async function authRoutes(app) {
    app.post('/request-code', async (request, reply) => {
        const allowed = await app.rateLimit(request, reply, { scope: 'auth-code', capacity: 10, refillPerMinute: 10 })
        if (!allowed) {
            return
        }

        try {
            const delivery = await requestLoginCode(app, request.body?.email)
            return {
                message: 'Verification code sent',
                ...(delivery.devCode ? { devCode: delivery.devCode } : {})
            }
        } catch (error) {
            const statusCode = error.message.includes('email') ? 400 : 502
            return reply.code(statusCode).send({ message: error.message })
        }
    })

    app.post('/verify-code', async (request, reply) => {
        const allowed = await app.rateLimit(request, reply, { scope: 'auth-code-verify', capacity: 20, refillPerMinute: 20 })
        if (!allowed) {
            return
        }

        try {
            return await verifyLoginCode(app, request.body?.email, request.body?.code)
        } catch (error) {
            return reply.code(401).send({ message: error.message })
        }
    })

    app.get('/me', { preHandler: app.authenticate }, async (request) => {
        return { user: request.user }
    })

    app.post('/register', async (request, reply) => {
        const allowed = await app.rateLimit(request, reply, { scope: 'auth', capacity: 20, refillPerMinute: 20 })
        if (!allowed) {
            return
        }

        const { email, password } = request.body || {}
        const role = typeof request.body?.role === 'string' ? request.body.role : undefined
        const shipperId = Number(request.body?.shipperId) || null
        const truckId = Number(request.body?.truckId) || null

        if (!email || !password) {
            return reply.code(400).send({ message: 'Email and password are required' })
        }

        const existing = await app.prisma.user.findUnique({ where: { email } })
        if (existing) {
            return reply.code(409).send({ message: 'User already exists' })
        }

        const hashed = await bcrypt.hash(password, 10)
        const user = await app.prisma.user.create({
            data: {
                email,
                password: hashed,
                ...(role ? { role } : {}),
                ...(shipperId ? { shipperId } : {}),
                ...(truckId ? { truckId } : {})
            },
            include: { shipper: true, truck: true }
        })

        const token = app.jwt.sign(buildTokenPayload(user))

        return {
            token,
            user: toSafeUser(user)
        }
    })

    app.post('/login', async (request, reply) => {
        const allowed = await app.rateLimit(request, reply, { scope: 'auth', capacity: 20, refillPerMinute: 20 })
        if (!allowed) {
            return
        }

        const { email, password } = request.body || {}

        if (!email || !password) {
            return reply.code(400).send({ message: 'Email and password are required' })
        }

        const user = await app.prisma.user.findUnique({
            where: { email },
            include: { shipper: true, truck: true }
        })
        if (!user) {
            return reply.code(401).send({ message: 'Invalid credentials' })
        }

        if (!user.password) {
            return reply.code(401).send({ message: 'Use email code login for this account' })
        }

        const matches = await bcrypt.compare(password, user.password)
        if (!matches) {
            return reply.code(401).send({ message: 'Invalid credentials' })
        }

        const token = app.jwt.sign(buildTokenPayload(user))

        return {
            token,
            user: toSafeUser(user)
        }
    })
}

module.exports = authRoutes
