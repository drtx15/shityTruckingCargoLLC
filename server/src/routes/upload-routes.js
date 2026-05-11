const { readAvatar } = require('../services/avatar-service')

async function uploadRoutes(app) {
    app.get('/uploads/avatars/:fileName', async (request, reply) => {
        try {
            const avatar = await readAvatar(request.params.fileName)
            if (!avatar) {
                return reply.code(404).send({ message: 'Avatar not found' })
            }

            reply.header('cache-control', 'public, max-age=31536000, immutable')
            reply.type(avatar.mimeType)
            return reply.send(avatar.buffer)
        } catch (error) {
            if (error.code === 'ENOENT') {
                return reply.code(404).send({ message: 'Avatar not found' })
            }
            throw error
        }
    })
}

module.exports = uploadRoutes
