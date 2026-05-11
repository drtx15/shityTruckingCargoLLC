const bcrypt = require('bcrypt')
const { persistAvatarValue } = require('../services/avatar-service')
const { ROLES } = require('../services/role-access-service')
const {
    buildTokenPayload,
    requestLoginCode,
    toSafeUser,
    verifyLoginCode
} = require('../services/auth-code-service')

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function digitsOnly(value) {
    return normalizeText(value).replace(/\D/g, '')
}

const publicOrganizationTypes = new Set(['SHIPPER', 'CARRIER', 'BROKER'])
const roleByOrganizationType = {
    SHIPPER: ROLES.CUSTOMER,
    CARRIER: ROLES.FLEET_MANAGER,
    BROKER: ROLES.BROKER
}

function companyNameFromProfile({ companyName, organizationName, displayName, email }) {
    const explicit = normalizeText(companyName) || normalizeText(organizationName)
    if (explicit) {
        return explicit
    }

    const name = normalizeText(displayName)
    if (name) {
        return `${name} Logistics`
    }

    return email.split('@')[0]
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(' ') || email
}

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

    app.patch('/me', { preHandler: app.authenticate }, async (request, reply) => {
        const patch = {}
        const password = typeof request.body?.password === 'string' ? request.body.password : ''

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

        if (password) {
            if (password.length < 8) {
                return reply.code(400).send({ message: 'Password must be at least 8 characters' })
            }
            patch.password = await bcrypt.hash(password, 10)
        }

        if (!Object.keys(patch).length) {
            return reply.code(400).send({ message: 'No profile fields provided' })
        }

        const user = await app.prisma.user.update({
            where: { id: request.user.id },
            data: patch,
            include: { organization: true, shipper: true, truck: true }
        })

        return { user: toSafeUser(user) }
    })

    app.post('/register', async (request, reply) => {
        const allowed = await app.rateLimit(request, reply, { scope: 'auth', capacity: 20, refillPerMinute: 20 })
        if (!allowed) {
            return
        }

        const email = normalizeEmail(request.body?.email)
        const password = typeof request.body?.password === 'string' ? request.body.password : ''
        const displayName = normalizeText(request.body?.displayName)
        let avatarUrl = null
        try {
            avatarUrl = await persistAvatarValue(request.body?.avatarUrl)
        } catch (error) {
            return reply.code(400).send({ message: error.message })
        }
        const title = normalizeText(request.body?.title)
        const organizationType = normalizeText(request.body?.organizationType || request.body?.accountType || 'SHIPPER').toUpperCase()
        const organizationName = normalizeText(request.body?.organizationName || request.body?.legalName || request.body?.companyName)
        const dotNumber = digitsOnly(request.body?.dotNumber)
        const docketPrefix = normalizeText(request.body?.docketPrefix || 'MC').toUpperCase()
        const docketNumber = digitsOnly(request.body?.docketNumber)
        const requestedRole = normalizeText(request.body?.role).toUpperCase()
        const role = roleByOrganizationType[organizationType] || ROLES.CUSTOMER
        const shipperId = null
        const truckId = null

        if (!publicOrganizationTypes.has(organizationType)) {
            return reply.code(403).send({ message: 'This account type is not available for public registration' })
        }

        if (requestedRole && requestedRole !== role) {
            return reply.code(403).send({ message: 'System roles are assigned by account type or by invitation' })
        }

        if (!email || !email.includes('@') || !password || password.length < 8) {
            return reply.code(400).send({ message: 'Valid email and an 8+ character password are required' })
        }

        if (!organizationName) {
            return reply.code(400).send({ message: 'Legal organization name is required' })
        }

        if ((organizationType === 'CARRIER' || organizationType === 'BROKER') && !dotNumber) {
            return reply.code(400).send({ message: 'USDOT number is required for carrier and broker accounts' })
        }

        if (organizationType === 'BROKER' && (!['MC', 'FF', 'MX'].includes(docketPrefix) || !docketNumber)) {
            return reply.code(400).send({ message: 'Broker accounts require an MC, FF, or MX docket number' })
        }

        const existing = await app.prisma.user.findUnique({ where: { email } })
        if (existing) {
            return reply.code(409).send({ message: 'User already exists' })
        }

        const hashed = await bcrypt.hash(password, 10)
        const user = await app.prisma.$transaction(async (tx) => {
            let nextShipperId = shipperId

            if (role === ROLES.CUSTOMER && !nextShipperId) {
                const shipper = await tx.shipper.findUnique({ where: { contactEmail: email } }) || await tx.shipper.create({
                    data: {
                        companyName: companyNameFromProfile({ companyName: request.body?.companyName, organizationName, displayName, email }),
                        contactEmail: email
                    }
                })
                nextShipperId = shipper.id
            }

            const organization = await tx.organization.create({
                data: {
                    legalName: organizationName,
                    type: organizationType,
                    ...(dotNumber ? { dotNumber } : {}),
                    ...(organizationType === 'BROKER' ? { docketPrefix, docketNumber } : {}),
                    verificationStatus: 'PENDING_REVIEW'
                }
            })

            return tx.user.create({
                data: {
                    email,
                    password: hashed,
                    role,
                    ...(displayName ? { displayName } : {}),
                    ...(avatarUrl ? { avatarUrl } : {}),
                    ...(title ? { title } : {}),
                    ...(organizationName ? { organizationName } : {}),
                    organizationId: organization.id,
                    organizationRole: 'OWNER',
                    ...(nextShipperId ? { shipperId: nextShipperId } : {}),
                    ...(truckId ? { truckId } : {})
                },
                include: { organization: true, shipper: true, truck: true }
            })
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

        const email = normalizeEmail(request.body?.email)
        const password = typeof request.body?.password === 'string' ? request.body.password : ''

        if (!email || !password) {
            return reply.code(400).send({ message: 'Email and password are required' })
        }

        const user = await app.prisma.user.findUnique({
            where: { email },
            include: { organization: true, shipper: true, truck: true }
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
