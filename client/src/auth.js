import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

const roleHome = {
    CUSTOMER: '/customer/orders',
    DRIVER: '/driver/road',
    DISPATCHER: '/dispatcher/loads',
    FLEET_MANAGER: '/fleet/load-board',
    BROKER: '/broker/dashboard',
    ADMIN: '/admin/analytics'
}

export function getRoleHome(role) {
    return roleHome[role] || '/login'
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used inside AuthProvider')
    }
    return context
}
