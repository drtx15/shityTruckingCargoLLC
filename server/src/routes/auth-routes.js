const bcrypt = require('bcrypt')

async function authRoutes(app) {
    app.post('/register', async (request, reply) => {
        const { email, password } = request.body || {}

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
                password: hashed
            }
        })

        const token = app.jwt.sign({ userId: user.id, email: user.email })

        return {
            token,
            user: { id: user.id, email: user.email }
        }
    })

    app.post('/login', async (request, reply) => {
        const { email, password } = request.body || {}

        if (!email || !password) {
            return reply.code(400).send({ message: 'Email and password are required' })
        }

        const user = await app.prisma.user.findUnique({ where: { email } })
        if (!user) {
            return reply.code(401).send({ message: 'Invalid credentials' })
        }

        const matches = await bcrypt.compare(password, user.password)
        if (!matches) {
            return reply.code(401).send({ message: 'Invalid credentials' })
        }

        const token = app.jwt.sign({ userId: user.id, email: user.email })

        return {
            token,
            user: { id: user.id, email: user.email }
        }
    })
}

module.exports = authRoutes
