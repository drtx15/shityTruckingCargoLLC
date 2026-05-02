async function truckRoutes(app) {
    app.get('/', async () => {
        return app.prisma.truck.findMany({
            select: {
                id: true,
                label: true,
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

    app.post('/', async (request, reply) => {
        const { label } = request.body || {}
        if (!label) {
            return reply.code(400).send({ message: 'Truck label is required' })
        }

        try {
            const truck = await app.prisma.truck.create({
                data: { label }
            })

            return reply.code(201).send(truck)
        } catch (error) {
            if (error.code === 'P2002') {
                return reply.code(409).send({ message: 'Truck label must be unique' })
            }
            throw error
        }
    })

    app.patch('/:id', async (request, reply) => {
        const truckId = Number(request.params.id)
        const label = typeof request.body?.label === 'string' ? request.body.label.trim() : ''

        if (!label) {
            return reply.code(400).send({ message: 'Truck label is required' })
        }

        try {
            const truck = await app.prisma.truck.update({
                where: { id: truckId },
                data: { label }
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

    app.delete('/:id', async (request, reply) => {
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
