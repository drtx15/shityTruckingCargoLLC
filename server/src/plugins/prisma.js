const fp = require('fastify-plugin')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')
const config = require('../config')

async function prismaPlugin(app) {
    const adapter = new PrismaPg({
        connectionString: config.databaseUrl
    })
    const prisma = new PrismaClient({ adapter })
    await prisma.$connect()

    app.decorate('prisma', prisma)

    app.addHook('onClose', async (instance) => {
        await instance.prisma.$disconnect()
    })
}

module.exports = fp(prismaPlugin)
