const { getTrackingByCode, getTrackingByShipmentId } = require('../services/shipment-service')
const { toPublicTrackingPayload } = require('../services/tracking-snapshot-service')
const { toSafeUser } = require('../services/auth-code-service')
const { canReadShipmentRecord } = require('../services/role-access-service')

const clients = new Set()

function sendJson(socket, payload) {
    if (socket.readyState === 1) {
        socket.send(JSON.stringify(payload))
    }
}

async function trackingWsRoutes(app) {
    app.decorate('broadcastTracking', (event) => {
        for (const client of clients) {
            const matchesShipment = client.shipmentId && Number(client.shipmentId) === Number(event.shipmentId)
            const matchesCode = client.trackingCode && client.trackingCode === event.trackingCode

            if (matchesShipment || matchesCode) {
                sendJson(client.socket, {
                    type: event.type,
                    payload: client.publicOnly ? event.publicPayload : event.payload,
                    emittedAt: event.emittedAt
                })
            }
        }
    })

    if (app.redis) {
        const subscriber = app.redis.duplicate()
        await subscriber.connect()
        await subscriber.subscribe('tracking:events', (message) => {
            try {
                app.broadcastTracking(JSON.parse(message))
            } catch (error) {
                app.log.warn({ error }, 'Invalid tracking pub/sub event')
            }
        })
        app.addHook('onClose', async () => subscriber.disconnect())
    }

    app.get('/ws/tracking', { websocket: true }, async (socket, request) => {
        const allowed = await app.rateLimit(request, socket, {
            scope: 'ws-tracking',
            capacity: 30,
            refillPerMinute: 30
        }).catch(() => false)

        if (!allowed) {
            sendJson(socket, { type: 'error', message: 'Rate limit exceeded' })
            socket.close()
            return
        }

        const shipmentId = Number(request.query?.shipmentId)
        const trackingCode = typeof request.query?.trackingCode === 'string' ? request.query.trackingCode.trim() : ''
        let user = null

        if (!shipmentId && !trackingCode) {
            sendJson(socket, { type: 'error', message: 'shipmentId or trackingCode is required' })
            socket.close()
            return
        }

        if (shipmentId && !trackingCode) {
            const token = typeof request.query?.token === 'string' ? request.query.token : ''
            try {
                const claims = app.jwt.verify(token)
                const dbUser = await app.prisma.user.findUnique({
                    where: { id: Number(claims.userId) },
                    include: { shipper: true, truck: true }
                })
                user = toSafeUser(dbUser)
            } catch (error) {
                sendJson(socket, { type: 'error', message: 'Unauthorized' })
                socket.close()
                return
            }
        }

        const client = {
            socket,
            shipmentId: shipmentId || null,
            trackingCode: trackingCode || null,
            publicOnly: Boolean(trackingCode)
        }
        clients.add(client)
        app.metrics?.websocketClients?.set(clients.size)

        try {
            const tracking = trackingCode
                ? await getTrackingByCode(app, trackingCode)
                : await getTrackingByShipmentId(app, shipmentId)

            if (!tracking) {
                sendJson(socket, { type: 'error', message: 'Shipment not found' })
                socket.close()
                return
            }

            if (!trackingCode) {
                const shipmentRecord = {
                    shipperId: tracking.shipper?.id,
                    assignedTruckId: tracking.truck?.id
                }

                if (!canReadShipmentRecord(user, shipmentRecord)) {
                    sendJson(socket, { type: 'error', message: 'Forbidden' })
                    socket.close()
                    return
                }
            }

            sendJson(socket, {
                type: 'snapshot',
                payload: trackingCode ? toPublicTrackingPayload(tracking) : tracking,
                emittedAt: new Date().toISOString()
            })
        } catch (error) {
            sendJson(socket, { type: 'error', message: error.message })
        }

        socket.on('close', () => {
            clients.delete(client)
            app.metrics?.websocketClients?.set(clients.size)
        })
    })
}

module.exports = trackingWsRoutes
