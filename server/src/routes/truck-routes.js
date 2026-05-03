const { ROLES, TRUCK_ADMIN_ROLES, roleList } = require('../services/role-access-service')

async function truckRoutes(app) {
    app.get('/', { preHandler: app.authorize([ROLES.DISPATCHER, ROLES.FLEET_MANAGER, ROLES.BROKER, ROLES.ADMIN]) }, async () => {
        return app.prisma.truck.findMany({
            select: {
                id: true,
                label: true,
                driverName: true,
                maxWeightKg: true,
                currentLoadKg: true,
                status: true,
                currentLat: true,
                currentLng: true,
                currentSpeed: true,
                lastUpdatedAt: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { id: 'asc' }
        })
    })

    app.get('/me', { preHandler: app.authorize([ROLES.DRIVER]) }, async (request, reply) => {
        if (!request.user.truckId) {
            return reply.code(404).send({ message: 'Driver is not linked to a truck' })
        }

        const truck = await app.prisma.truck.findUnique({
            where: { id: request.user.truckId },
            include: {
                shipments: {
                    where: { status: { notIn: ['ARRIVED', 'CANCELLED'] } },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        })

        if (!truck) {
            return reply.code(404).send({ message: 'Truck not found' })
        }

        return truck
    })

    app.post('/', { preHandler: app.authorize(roleList(TRUCK_ADMIN_ROLES)) }, async (request, reply) => {
        const { label, driverName } = request.body || {}
        const maxWeightKg = Number(request.body?.maxWeightKg || 10000)
        if (!label) {
            return reply.code(400).send({ message: 'Truck label is required' })
        }

        try {
            const truck = await app.prisma.truck.create({
                data: {
                    label,
                    driverName: typeof driverName === 'string' ? driverName.trim() || null : null,
                    maxWeightKg: Number.isFinite(maxWeightKg) && maxWeightKg > 0 ? maxWeightKg : 10000
                }
            })

            return reply.code(201).send(truck)
        } catch (error) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ message: 'Truck label must be unique' })
            }
            throw error
        }
    })

    app.patch('/:id', { preHandler: app.authorize(roleList(TRUCK_ADMIN_ROLES)) }, async (request, reply) => {
        const truckId = Number(request.params.id)
        const label = typeof request.body?.label === 'string' ? request.body.label.trim() : ''

        const patch = {}

        if (label) {
            patch.label = label
        }

        if (typeof request.body?.driverName === 'string') {
            patch.driverName = request.body.driverName.trim() || null
        }

        if (Number.isFinite(Number(request.body?.maxWeightKg))) {
            patch.maxWeightKg = Number(request.body.maxWeightKg)
        }

        if (!Object.keys(patch).length) {
            return reply.code(400).send({ message: 'No truck fields provided' })
        }

        try {
            const truck = await app.prisma.truck.update({
                where: { id: truckId },
                data: patch
            })

            return truck
        } catch (error) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ message: 'Truck label must be unique' })
            }

            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Truck not found' })
            }

            throw error
        }
    })

    app.delete('/:id', { preHandler: app.authorize(roleList(TRUCK_ADMIN_ROLES)) }, async (request, reply) => {
        const truckId = Number(request.params.id)

        try {
            const assignedShipmentCount = await app.prisma.shipment.count({
                where: { assignedTruckId: truckId }
            })

            if (assignedShipmentCount > 0) {
                return reply.code(400).send({ message: 'Truck is assigned to shipments' })
            }

            await app.prisma.truck.delete({ where: { id: truckId } })
            return reply.code(204).send()
        } catch (error) {
            if (error.code === 'P2025') {
                return reply.code(404).send({ message: 'Truck not found' })
            }

            throw error
        }
    })

}

module.exports = truckRoutes
