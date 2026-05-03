const ROLES = {
    CUSTOMER: 'CUSTOMER',
    DRIVER: 'DRIVER',
    DISPATCHER: 'DISPATCHER',
    FLEET_MANAGER: 'FLEET_MANAGER',
    BROKER: 'BROKER',
    ADMIN: 'ADMIN'
}

const ALL_ROLES = Object.values(ROLES)
const SHIPMENT_READ_ALL_ROLES = new Set([ROLES.DISPATCHER, ROLES.FLEET_MANAGER, ROLES.BROKER, ROLES.ADMIN])
const SHIPMENT_CREATE_ROLES = new Set([ROLES.CUSTOMER, ROLES.DISPATCHER, ROLES.BROKER, ROLES.ADMIN])
const SHIPMENT_WRITE_ROLES = new Set([ROLES.DISPATCHER, ROLES.BROKER, ROLES.ADMIN])
const TRUCK_ADMIN_ROLES = new Set([ROLES.FLEET_MANAGER, ROLES.ADMIN])
const CUSTOMER_ADMIN_ROLES = new Set([ROLES.BROKER, ROLES.ADMIN])
const ADMIN_ONLY_ROLES = new Set([ROLES.ADMIN])

function hasRole(user, roles) {
    if (!user) {
        return false
    }

    const allowed = roles instanceof Set ? roles : new Set(Array.isArray(roles) ? roles : [roles])
    return allowed.has(user.role)
}

function hasAnyRole(user, roles) {
    return hasRole(user, roles)
}

function roleList(roles) {
    return roles instanceof Set ? Array.from(roles) : roles
}

function buildShipmentWhereForUser(user, baseWhere = {}) {
    if (!user) {
        return { id: -1 }
    }

    if (SHIPMENT_READ_ALL_ROLES.has(user.role)) {
        return baseWhere
    }

    if (user.role === ROLES.CUSTOMER) {
        return {
            ...baseWhere,
            shipperId: user.shipperId || -1
        }
    }

    if (user.role === ROLES.DRIVER) {
        return {
            ...baseWhere,
            assignedTruckId: user.truckId || -1
        }
    }

    return { id: -1 }
}

function canReadShipmentRecord(user, shipment) {
    if (!user || !shipment) {
        return false
    }

    if (SHIPMENT_READ_ALL_ROLES.has(user.role)) {
        return true
    }

    if (user.role === ROLES.CUSTOMER) {
        return Boolean(user.shipperId && Number(shipment.shipperId) === Number(user.shipperId))
    }

    if (user.role === ROLES.DRIVER) {
        return Boolean(user.truckId && Number(shipment.assignedTruckId) === Number(user.truckId))
    }

    return false
}

function applyCreateShipmentOwnership(user, payload = {}) {
    if (user?.role === ROLES.CUSTOMER) {
        return {
            ...payload,
            shipperId: user.shipperId
        }
    }

    return payload
}

module.exports = {
    ADMIN_ONLY_ROLES,
    ALL_ROLES,
    CUSTOMER_ADMIN_ROLES,
    ROLES,
    SHIPMENT_CREATE_ROLES,
    SHIPMENT_READ_ALL_ROLES,
    SHIPMENT_WRITE_ROLES,
    TRUCK_ADMIN_ROLES,
    applyCreateShipmentOwnership,
    buildShipmentWhereForUser,
    canReadShipmentRecord,
    hasAnyRole,
    hasRole,
    roleList
}
