const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const maxAvatarBytes = 2 * 1024 * 1024
const uploadDir = path.resolve(__dirname, '../../uploads/avatars')
const publicPrefix = '/api/uploads/avatars'
const mimeTypes = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : ''
}

function parseAvatarDataUrl(value) {
    const match = normalizeText(value).match(/^data:(image\/(?:gif|jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i)
    if (!match) {
        return null
    }

    return {
        mimeType: match[1].toLowerCase(),
        payload: match[2].replace(/\s/g, '')
    }
}

async function persistAvatarValue(value) {
    const normalized = normalizeText(value)
    if (!normalized) {
        return null
    }

    const parsed = parseAvatarDataUrl(normalized)
    if (!parsed) {
        return normalized
    }

    const extension = mimeTypes[parsed.mimeType]
    if (!extension) {
        throw new Error('Unsupported avatar image type')
    }

    const buffer = Buffer.from(parsed.payload, 'base64')
    if (!buffer.length || buffer.length > maxAvatarBytes) {
        throw new Error('Avatar image must be under 2 MB')
    }

    await fs.mkdir(uploadDir, { recursive: true })
    const fileName = `${crypto.randomUUID()}.${extension}`
    await fs.writeFile(path.join(uploadDir, fileName), buffer)

    return `${publicPrefix}/${fileName}`
}

async function readAvatar(fileName) {
    const safeName = path.basename(String(fileName || ''))
    const extension = safeName.split('.').pop()?.toLowerCase()
    const mimeType = Object.entries(mimeTypes).find(([, ext]) => ext === extension)?.[0]

    if (!mimeType || safeName !== fileName) {
        return null
    }

    const buffer = await fs.readFile(path.join(uploadDir, safeName))
    return { buffer, mimeType }
}

module.exports = {
    maxAvatarBytes,
    persistAvatarValue,
    readAvatar
}
