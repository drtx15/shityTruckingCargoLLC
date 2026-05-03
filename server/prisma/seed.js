const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { createApiKey, hashSecret } = require('../src/services/api-key-service')
const { buildSlaDeadline } = require('../src/services/sla-service')

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL
})
const prisma = new PrismaClient({ adapter })

async function main() {
    const key = createApiKey()
    const acme = await prisma.shipper.upsert({
        where: { contactEmail: 'ops@acme-shipper.test' },
        update: {},
        create: {
            companyName: 'Acme Regional Logistics',
            contactEmail: 'ops@acme-shipper.test',
            apiKeyPrefix: key.apiKeyPrefix,
            apiKeyHash: key.apiKeyHash
        }
    })

    const silk = await prisma.shipper.upsert({
        where: { contactEmail: 'dispatch@silk-road.test' },
        update: {},
        create: {
            companyName: 'Silk Road Exports',
            contactEmail: 'dispatch@silk-road.test',
            apiKeyPrefix: 'ship_seeded',
            apiKeyHash: hashSecret('ship_seeded_demo_key')
        }
    })

    const trucks = await Promise.all([
        prisma.truck.upsert({
            where: { label: 'TG-101' },
            update: {},
            create: { label: 'TG-101', driverName: 'Aziz Karimov', maxWeightKg: 12000, currentLat: 41.3111, currentLng: 69.2797 }
        }),
        prisma.truck.upsert({
            where: { label: 'TG-204' },
            update: {},
            create: { label: 'TG-204', driverName: 'Malika Saidova', maxWeightKg: 8000, currentLat: 40.7834, currentLng: 72.3500 }
        }),
        prisma.truck.upsert({
            where: { label: 'TG-330' },
            update: {},
            create: { label: 'TG-330', driverName: 'Timur Rasulov', maxWeightKg: 20000, currentLat: 39.6542, currentLng: 66.9597 }
        })
    ])

    await Promise.all([
        prisma.user.upsert({
            where: { email: 'customer@drtx.tech' },
            update: { role: 'CUSTOMER', shipperId: acme.id, truckId: null },
            create: { email: 'customer@drtx.tech', role: 'CUSTOMER', shipperId: acme.id }
        }),
        prisma.user.upsert({
            where: { email: 'shipper@drtx.tech' },
            update: { role: 'CUSTOMER', shipperId: silk.id, truckId: null },
            create: { email: 'shipper@drtx.tech', role: 'CUSTOMER', shipperId: silk.id }
        }),
        prisma.user.upsert({
            where: { email: 'driver@drtx.tech' },
            update: { role: 'DRIVER', truckId: trucks[1].id, shipperId: null },
            create: { email: 'driver@drtx.tech', role: 'DRIVER', truckId: trucks[1].id }
        }),
        prisma.user.upsert({
            where: { email: 'dispatcher@drtx.tech' },
            update: { role: 'DISPATCHER', shipperId: null, truckId: null },
            create: { email: 'dispatcher@drtx.tech', role: 'DISPATCHER' }
        }),
        prisma.user.upsert({
            where: { email: 'fleet@drtx.tech' },
            update: { role: 'FLEET_MANAGER', shipperId: null, truckId: null },
            create: { email: 'fleet@drtx.tech', role: 'FLEET_MANAGER' }
        }),
        prisma.user.upsert({
            where: { email: 'broker@drtx.tech' },
            update: { role: 'BROKER', shipperId: null, truckId: null },
            create: { email: 'broker@drtx.tech', role: 'BROKER' }
        }),
        prisma.user.upsert({
            where: { email: 'admin@drtx.tech' },
            update: { role: 'ADMIN', shipperId: null, truckId: null },
            create: { email: 'admin@drtx.tech', role: 'ADMIN' }
        })
    ])

    const created = await prisma.shipment.upsert({
        where: { trackingCode: 'TRK-2026-DEMO01' },
        update: {},
        create: {
            trackingCode: 'TRK-2026-DEMO01',
            shipperId: acme.id,
            originLat: 41.3111,
            originLng: 69.2797,
            originLabel: 'Tashkent, Uzbekistan',
            destinationLat: 39.6542,
            destinationLng: 66.9597,
            destinationLabel: 'Samarkand, Uzbekistan',
            routePolyline: [{ lat: 41.3111, lng: 69.2797 }, { lat: 39.6542, lng: 66.9597 }],
            priority: 'EXPRESS',
            cargoDescription: 'Electronics pallets',
            weightKg: 2800,
            slaDeadline: buildSlaDeadline('EXPRESS'),
            status: 'PENDING',
            checkpoints: {
                create: { type: 'CREATED', lat: 41.3111, lng: 69.2797 }
            }
        }
    })

    const delayed = await prisma.shipment.upsert({
        where: { trackingCode: 'TRK-2026-DELAY1' },
        update: {},
        create: {
            trackingCode: 'TRK-2026-DELAY1',
            shipperId: silk.id,
            assignedTruckId: trucks[1].id,
            originLat: 40.7834,
            originLng: 72.3500,
            originLabel: 'Andijan, Uzbekistan',
            destinationLat: 41.5530,
            destinationLng: 60.6313,
            destinationLabel: 'Urgench, Uzbekistan',
            routePolyline: [{ lat: 40.7834, lng: 72.35 }, { lat: 41.553, lng: 60.6313 }],
            priority: 'URGENT',
            cargoDescription: 'Temperature-sensitive medical stock',
            weightKg: 1200,
            slaDeadline: new Date(Date.now() - 30 * 60 * 1000),
            status: 'DELAYED',
            delayReason: 'ETA exceeds shipment SLA',
            delayedAt: new Date(),
            etaMinutes: 240,
            estimatedAt: new Date(Date.now() + 240 * 60 * 1000),
            checkpoints: {
                create: [
                    { type: 'CREATED', lat: 40.7834, lng: 72.35 },
                    { type: 'ASSIGNED', lat: 40.7834, lng: 72.35 },
                    { type: 'DELAYED', lat: 40.9, lng: 71.7 }
                ]
            }
        }
    })

    await prisma.etaHistory.createMany({
        data: [
            {
                shipmentId: created.id,
                previousEtaMinutes: null,
                newEtaMinutes: 260,
                remainingDistanceKm: 280,
                speedKph: 65,
                reason: 'seed.initial'
            },
            {
                shipmentId: delayed.id,
                previousEtaMinutes: 190,
                newEtaMinutes: 240,
                remainingDistanceKm: 260,
                speedKph: 0,
                reason: 'seed.delay'
            }
        ],
        skipDuplicates: true
    }).catch(() => {})

    const subscription = await prisma.webhookSubscription.create({
        data: {
            shipperId: acme.id,
            eventType: 'shipment.arrived',
            targetUrl: 'https://example.com/webhooks/logistics',
            signingSecretHash: hashSecret('demo-secret'),
            enabled: true
        }
    })

    await prisma.webhookAttempt.create({
        data: {
            subscriptionId: subscription.id,
            shipmentId: created.id,
            eventType: 'shipment.arrived',
            payload: { event: 'shipment.arrived', trackingCode: created.trackingCode },
            state: 'FAILED',
            responseStatus: 503,
            errorMessage: 'Seeded failed delivery for dashboard demo',
            retryCount: 1,
            nextRetryAt: new Date(Date.now() + 15 * 60 * 1000)
        }
    })

    // eslint-disable-next-line no-console
    console.log(`Seeded demo shipper API key: ${key.apiKey}`)
}

main()
    .finally(async () => {
        await prisma.$disconnect()
    })
