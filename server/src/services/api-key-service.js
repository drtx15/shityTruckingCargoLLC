const crypto = require('crypto')

function hashSecret(value) {
    return crypto.createHash('sha256').update(value).digest('hex')
}

function createApiKey() {
    const secret = `ship_${crypto.randomBytes(24).toString('hex')}`
    return {
        apiKey: secret,
        apiKeyPrefix: secret.slice(0, 12),
        apiKeyHash: hashSecret(secret)
    }
}

module.exports = {
    createApiKey,
    hashSecret
}
