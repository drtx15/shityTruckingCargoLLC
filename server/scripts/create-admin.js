require('dotenv').config()

const bcrypt = require('bcrypt')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const [emailArg, passwordArg, nameArg] = process.argv.slice(2)
const email = String(process.env.ADMIN_EMAIL || emailArg || '').trim().toLowerCase()
const password = String(process.env.ADMIN_PASSWORD || passwordArg || '')
const displayName = String(process.env.ADMIN_NAME || nameArg || 'Platform Admin').trim()

if (!email || !email.includes('@') || password.length < 12) {
    // eslint-disable-next-line no-console
    console.error('Usage: node scripts/create-admin.js admin@example.com "12+ char password" "Admin Name"')
    process.exit(1)
}

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL
})
const prisma = new PrismaClient({ adapter })

async function main() {
    const passwordHash = await bcrypt.hash(password, 10)
    const organization = await prisma.organization.findFirst({
        where: { type: 'PLATFORM' },
        orderBy: { id: 'asc' }
    }) || await prisma.organization.create({
        data: {
            legalName: 'Transit Grid Platform',
            type: 'PLATFORM',
            verificationStatus: 'VERIFIED'
        }
    })

    await prisma.user.upsert({
        where: { email },
        update: {
            displayName,
            organizationId: organization.id,
            organizationName: organization.legalName,
            organizationRole: 'OWNER',
            password: passwordHash,
            role: 'ADMIN',
            title: 'Platform admin'
        },
        create: {
            displayName,
            email,
            organizationId: organization.id,
            organizationName: organization.legalName,
            organizationRole: 'OWNER',
            password: passwordHash,
            role: 'ADMIN',
            title: 'Platform admin'
        }
    })

    // eslint-disable-next-line no-console
    console.log(`Admin account ready: ${email}`)
}

main()
    .finally(async () => {
        await prisma.$disconnect()
    })
