const assert = require('node:assert/strict')
const test = require('node:test')
const {
    ROLES,
    buildShipmentWhereForUser,
    canReadShipmentRecord
} = require('../src/services/role-access-service')

test('customer shipment scope is limited to the linked shipper', () => {
    const user = { role: ROLES.CUSTOMER, shipperId: 7 }

    assert.deepEqual(buildShipmentWhereForUser(user), { shipperId: 7 })
    assert.equal(canReadShipmentRecord(user, { shipperId: 7 }), true)
    assert.equal(canReadShipmentRecord(user, { shipperId: 8 }), false)
})

test('driver shipment scope is limited to the linked truck', () => {
    const user = { role: ROLES.DRIVER, truckId: 3 }

    assert.deepEqual(buildShipmentWhereForUser(user, { status: 'IN_TRANSIT' }), { status: 'IN_TRANSIT', assignedTruckId: 3 })
    assert.equal(canReadShipmentRecord(user, { assignedTruckId: 3 }), true)
    assert.equal(canReadShipmentRecord(user, { assignedTruckId: 4 }), false)
})

test('dispatcher and admin can read all shipment records', () => {
    assert.deepEqual(buildShipmentWhereForUser({ role: ROLES.DISPATCHER }), {})
    assert.equal(canReadShipmentRecord({ role: ROLES.ADMIN }, { shipperId: 1, assignedTruckId: 2 }), true)
})
