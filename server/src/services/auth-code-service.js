const crypto = require('crypto')
const config = require('../config')
const { ROLES } = require('./role-access-service')

const MAX_AUTH_ATTEMPTS = 5
const CODE_LENGTH = 6

function normalizeEmail(email) {
    return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function generateLoginCode() {
    return String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
}

function hashLoginCode(email, code) {
    return crypto
        .createHmac('sha256', config.jwtSecret)
        .update(`${normalizeEmail(email)}:${String(code).trim()}`)
        .digest('hex')
}

function timingSafeEqualText(left, right) {
    const leftBuffer = Buffer.from(String(left), 'hex')
    const rightBuffer = Buffer.from(String(right), 'hex')

    if (leftBuffer.length !== rightBuffer.length) {
        return false
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function companyNameFromEmail(email) {
    const [local, domain = 'customer'] = email.split('@')
    const source = local || domain
    return source
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
        .join(' ') || email
}

function toSafeUser(user) {
    if (!user) {
        return null
    }

    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName || null,
        avatarUrl: user.avatarUrl || null,
        title: user.title || null,
        organizationName: user.organizationName || null,
        organizationId: user.organizationId || null,
        organizationRole: user.organizationRole || null,
        organization: user.organization ? {
            id: user.organization.id,
            legalName: user.organization.legalName,
            type: user.organization.type,
            dotNumber: user.organization.dotNumber || null,
            docketPrefix: user.organization.docketPrefix || null,
            docketNumber: user.organization.docketNumber || null,
            verificationStatus: user.organization.verificationStatus
        } : null,
        role: user.role,
        shipperId: user.shipperId || null,
        truckId: user.truckId || null,
        shipper: user.shipper ? {
            id: user.shipper.id,
            companyName: user.shipper.companyName,
            contactEmail: user.shipper.contactEmail
        } : null,
        truck: user.truck ? {
            id: user.truck.id,
            label: user.truck.label,
            driverName: user.truck.driverName
        } : null
    }
}

function buildTokenPayload(user) {
    return {
        userId: user.id,
        email: user.email,
        role: user.role,
        ...(user.displayName ? { displayName: user.displayName } : {}),
        ...(user.organizationName ? { organizationName: user.organizationName } : {}),
        ...(user.organizationId ? { organizationId: user.organizationId } : {}),
        ...(user.organizationRole ? { organizationRole: user.organizationRole } : {}),
        ...(user.shipperId ? { shipperId: user.shipperId } : {}),
        ...(user.truckId ? { truckId: user.truckId } : {})
    }
}

async function findUserForEmail(prisma, email) {
    return prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        include: { organization: true, shipper: true, truck: true }
    })
}

async function findOrProvisionUserForEmail(prisma, email) {
    const normalizedEmail = normalizeEmail(email)
    let user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { organization: true, shipper: true, truck: true }
    })

    if (user) {
        return user
    }

    let shipper = await prisma.shipper.findUnique({
        where: { contactEmail: normalizedEmail }
    })

    if (!shipper) {
        shipper = await prisma.shipper.create({
            data: {
                companyName: companyNameFromEmail(normalizedEmail),
                contactEmail: normalizedEmail
            }
        })
    }

    user = await prisma.user.create({
        data: {
            email: normalizedEmail,
            organizationName: shipper.companyName,
            role: ROLES.CUSTOMER,
            shipperId: shipper.id
        },
        include: { organization: true, shipper: true, truck: true }
    })

    return user
}

async function sendLoginCode(app, email, code) {
    const subject = 'Your Transit Grid login code'
    const text = `Your Transit Grid verification code is ${code}. It expires in ${config.authCodeTtlMinutes} minutes.`
    const html = `<p>Your Transit Grid verification code is <strong>${code}</strong>.</p><p>It expires in ${config.authCodeTtlMinutes} minutes.</p>`

    if (!config.resendApiKey) {
        app.log.info({ email, code }, 'Resend is not configured; returning dev login code')
        return { delivered: false, devCode: code }
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${config.resendApiKey}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            from: config.authFromEmail,
            to: [email],
            subject,
            text,
            html
        })
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        app.log.error({ status: response.status, body }, 'Resend login email failed')
        throw new Error('Verification email could not be sent')
    }

    return { delivered: true }
}

async function requestLoginCode(app, email) {
    const normalizedEmail = normalizeEmail(email)

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new Error('Valid email is required')
    }

    const user = await findUserForEmail(app.prisma, normalizedEmail)
    if (!user) {
        throw new Error('Account not found')
    }
    const code = generateLoginCode()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + config.authCodeTtlMinutes * 60 * 1000)

    await app.prisma.authCode.updateMany({
        where: {
            email: normalizedEmail,
            consumedAt: null
        },
        data: {
            consumedAt: now
        }
    })

    await app.prisma.authCode.create({
        data: {
            email: normalizedEmail,
            userId: user.id,
            codeHash: hashLoginCode(normalizedEmail, code),
            expiresAt
        }
    })

    return sendLoginCode(app, normalizedEmail, code)
}

async function verifyLoginCode(app, email, code) {
    const normalizedEmail = normalizeEmail(email)
    const normalizedCode = String(code || '').trim()

    if (!normalizedEmail || !normalizedCode) {
        throw new Error('Email and verification code are required')
    }

    const challenge = await app.prisma.authCode.findFirst({
        where: {
            email: normalizedEmail,
            consumedAt: null
        },
        include: {
            user: {
                include: { organization: true, shipper: true, truck: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    if (!challenge || challenge.expiresAt.getTime() < Date.now() || challenge.attempts >= MAX_AUTH_ATTEMPTS) {
        throw new Error('Verification code is invalid or expired')
    }

    const matches = timingSafeEqualText(challenge.codeHash, hashLoginCode(normalizedEmail, normalizedCode))
    if (!matches) {
        await app.prisma.authCode.update({
            where: { id: challenge.id },
            data: { attempts: { increment: 1 } }
        })
        throw new Error('Verification code is invalid or expired')
    }

    const consumedAt = new Date()
    await app.prisma.authCode.update({
        where: { id: challenge.id },
        data: { consumedAt }
    })

    const user = challenge.user
    if (!user) {
        throw new Error('Account not found')
    }
    const token = app.jwt.sign(buildTokenPayload(user))

    return {
        token,
        user: toSafeUser(user)
    }
}

module.exports = {
    MAX_AUTH_ATTEMPTS,
    buildTokenPayload,
    findUserForEmail,
    findOrProvisionUserForEmail,
    generateLoginCode,
    hashLoginCode,
    normalizeEmail,
    requestLoginCode,
    toSafeUser,
    verifyLoginCode
}
