const crypto = require('crypto')

function randomCodePart() {
    return crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
}

async function generateTrackingCode(prisma) {
    const year = new Date().getFullYear()

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const code = `TRK-${year}-${randomCodePart()}`
        const existing = await prisma.shipment.findUnique({ where: { trackingCode: code } })

        if (!existing) {
            return code
        }
    }

    return `TRK-${year}-${Date.now().toString(36).toUpperCase()}`
}

module.exports = {
    generateTrackingCode
}
