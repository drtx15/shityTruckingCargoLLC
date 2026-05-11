const assert = require('node:assert/strict')
const test = require('node:test')
const {
    requestLoginCode,
    verifyLoginCode
} = require('../src/services/auth-code-service')

function createMockApp() {
    const state = {
        users: [],
        shippers: [],
        authCodes: [],
        nextUserId: 1,
        nextShipperId: 1,
        nextAuthCodeId: 1
    }

    const prisma = {
        user: {
            findUnique: async ({ where }) => state.users.find((user) => user.id === where.id || user.email === where.email) || null,
            create: async ({ data }) => {
                const shipper = data.shipperId ? state.shippers.find((item) => item.id === data.shipperId) : null
                const user = { id: state.nextUserId++, ...data, shipper, truck: null }
                state.users.push(user)
                return user
            }
        },
        shipper: {
            findUnique: async ({ where }) => state.shippers.find((shipper) => shipper.contactEmail === where.contactEmail || shipper.id === where.id) || null,
            create: async ({ data }) => {
                const shipper = { id: state.nextShipperId++, ...data }
                state.shippers.push(shipper)
                return shipper
            }
        },
        authCode: {
            updateMany: async ({ where, data }) => {
                state.authCodes.forEach((challenge) => {
                    if (challenge.email === where.email && challenge.consumedAt === where.consumedAt) {
                        challenge.consumedAt = data.consumedAt
                    }
                })
            },
            create: async ({ data }) => {
                const challenge = { id: state.nextAuthCodeId++, attempts: 0, consumedAt: null, createdAt: new Date(), ...data }
                state.authCodes.push(challenge)
                return challenge
            },
            findFirst: async ({ where }) => {
                return state.authCodes
                    .filter((challenge) => challenge.email === where.email && challenge.consumedAt === where.consumedAt)
                    .sort((left, right) => right.createdAt - left.createdAt)
                    .map((challenge) => ({
                        ...challenge,
                        user: state.users.find((user) => user.id === challenge.userId)
                    }))[0] || null
            },
            update: async ({ where, data }) => {
                const challenge = state.authCodes.find((item) => item.id === where.id)
                if (data.attempts?.increment) {
                    challenge.attempts += data.attempts.increment
                }
                if (data.consumedAt) {
                    challenge.consumedAt = data.consumedAt
                }
                return challenge
            }
        }
    }

    return {
        prisma,
        state,
        jwt: {
            sign: (payload) => `token:${payload.userId}:${payload.role}`
        },
        log: {
            error: () => {},
            info: () => {}
        }
    }
}

test('requestLoginCode only sends codes to existing accounts', async () => {
    const app = createMockApp()
    await app.prisma.user.create({
        data: {
            email: 'new.customer@drtx.tech',
            role: 'CUSTOMER'
        }
    })

    const result = await requestLoginCode(app, 'New.Customer@DRTX.tech')

    assert.match(result.devCode, /^\d{6}$/)
    assert.equal(app.state.users[0].email, 'new.customer@drtx.tech')
    assert.equal(app.state.users[0].role, 'CUSTOMER')
    assert.equal(app.state.authCodes.length, 1)
})

test('requestLoginCode does not auto-provision unknown emails', async () => {
    const app = createMockApp()

    await assert.rejects(() => requestLoginCode(app, 'unknown@drtx.tech'), /Account not found/)
    assert.equal(app.state.users.length, 0)
    assert.equal(app.state.authCodes.length, 0)
})

test('verifyLoginCode rejects wrong codes and consumes the correct code', async () => {
    const app = createMockApp()
    await app.prisma.user.create({
        data: {
            email: 'customer@drtx.tech',
            role: 'CUSTOMER'
        }
    })
    const result = await requestLoginCode(app, 'customer@drtx.tech')

    await assert.rejects(() => verifyLoginCode(app, 'customer@drtx.tech', '000000'), /invalid or expired/)
    assert.equal(app.state.authCodes[0].attempts, 1)

    const verified = await verifyLoginCode(app, 'customer@drtx.tech', result.devCode)

    assert.equal(verified.user.role, 'CUSTOMER')
    assert.match(verified.token, /^token:1:CUSTOMER$/)
    assert.ok(app.state.authCodes[0].consumedAt)
})
