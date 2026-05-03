const { ROLES } = require('../services/role-access-service')

async function analyticsRoutes(app) {
    app.get('/analytics/overview', { preHandler: app.authorize([ROLES.ADMIN]) }, async () => {
        const [
            totalShipments,
            lateShipments,
            activeTrucks,
            deliveredShipments,
            webhookAttempts,
            deliveredWebhooks
        ] = await Promise.all([
            app.prisma.shipment.count(),
            app.prisma.shipment.count({ where: { status: 'DELAYED' } }),
            app.prisma.truck.count({ where: { status: { in: ['ASSIGNED', 'MOVING', 'REST'] } } }),
            app.prisma.shipment.count({ where: { status: 'ARRIVED' } }),
            app.prisma.webhookAttempt.count(),
            app.prisma.webhookAttempt.count({ where: { state: 'DELIVERED' } })
        ])

        const etaRows = await app.prisma.etaHistory.findMany({
            where: { arrivalErrorMinutes: { not: null } },
            select: { arrivalErrorMinutes: true },
            take: 500
        })
        const averageEtaAccuracyMinutes = etaRows.length
            ? etaRows.reduce((sum, row) => sum + Math.abs(row.arrivalErrorMinutes || 0), 0) / etaRows.length
            : null

        return {
            totalShipments,
            lateShipments,
            deliveredShipments,
            activeTrucks,
            averageEtaAccuracyMinutes,
            webhookSuccessRate: webhookAttempts ? deliveredWebhooks / webhookAttempts : null,
            fleetUtilization: totalShipments ? activeTrucks / Math.max(1, await app.prisma.truck.count()) : 0
        }
    })

    app.get('/analytics/eta-history', { preHandler: app.authorize([ROLES.ADMIN]) }, async (request) => {
        const shipmentId = Number(request.query?.shipmentId)

        return app.prisma.etaHistory.findMany({
            where: Number.isFinite(shipmentId) && shipmentId > 0 ? { shipmentId } : {},
            include: {
                shipment: {
                    select: {
                        id: true,
                        trackingCode: true,
                        status: true,
                        priority: true,
                        originLabel: true,
                        destinationLabel: true
                    }
                }
            },
            orderBy: { computedAt: 'desc' },
            take: 200
        })
    })
}

module.exports = analyticsRoutes
