async function truckRoutes(app) {
    app.get('/', async () => {
        return app.prisma.truck.findMany({
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

    app.post('/seed', async () => {
        const existingCount = await app.prisma.truck.count()
        if (existingCount > 0) {
            return { created: 0, message: 'Trucks already exist' }
        }

        const labels = ['T-101', 'T-102', 'T-103', 'T-104', 'T-105']
        await app.prisma.truck.createMany({
            data: labels.map((label) => ({ label }))
        })

        return { created: labels.length }
    })
}

module.exports = truckRoutes
