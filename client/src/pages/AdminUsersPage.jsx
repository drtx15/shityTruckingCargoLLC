import { useEffect, useMemo, useState } from 'react'
import { getShippers, getTrucks, getUsers, updateUser } from '../api'
import { BuildingIcon, CheckIcon, IconButton, TruckIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'

const roles = ['CUSTOMER', 'DRIVER', 'DISPATCHER', 'FLEET_MANAGER', 'BROKER', 'ADMIN']

function AdminUsersPage() {
    const [users, setUsers] = useState([])
    const [shippers, setShippers] = useState([])
    const [trucks, setTrucks] = useState([])
    const [drafts, setDrafts] = useState({})
    const [error, setError] = useState('')

    const load = async () => {
        try {
            const [userData, shipperData, truckData] = await Promise.all([
                getUsers(),
                getShippers(),
                getTrucks()
            ])
            setUsers(userData)
            setShippers(shipperData)
            setTrucks(truckData)
            setDrafts((prev) => {
                const next = {}
                userData.forEach((user) => {
                    next[user.id] = prev[user.id] || {
                        displayName: user.displayName || '',
                        organizationName: user.organization?.legalName || user.organizationName || '',
                        role: user.role,
                        shipperId: user.shipper?.id ? String(user.shipper.id) : '',
                        title: user.title || '',
                        truckId: user.truck?.id ? String(user.truck.id) : ''
                    }
                })
                return next
            })
            setError('')
        } catch (err) {
            setError(err.message)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const roleCounts = useMemo(() => roles.reduce((counts, role) => ({
        ...counts,
        [role]: users.filter((user) => user.role === role).length
    }), {}), [users])

    const updateDraft = (userId, patch) => {
        setDrafts((prev) => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                ...patch
            }
        }))
    }

    const saveUser = async (user) => {
        const draft = drafts[user.id] || {}
        try {
            await updateUser(user.id, {
                role: draft.role,
                displayName: draft.displayName,
                organizationName: draft.organizationName,
                shipperId: draft.shipperId || null,
                title: draft.title,
                truckId: draft.truckId || null
            })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Admin</p>
                    <h2>RBAC users</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Users', value: users.length },
                    { label: 'Customers', value: roleCounts.CUSTOMER || 0, icon: BuildingIcon },
                    { label: 'Drivers', value: roleCounts.DRIVER || 0, icon: TruckIcon },
                    { label: 'Admins', value: roleCounts.ADMIN || 0 }
                ]}
            />

            {error && <p className="error-text">{error}</p>}

            <div className="panel">
                <div className="table-header rbac-table-head">
                    <span>User</span>
                    <span>Profile</span>
                    <span>Organization</span>
                    <span>Role</span>
                    <span>Customer scope</span>
                    <span>Driver truck</span>
                    <span>Actions</span>
                </div>
                <div className="data-list">
                    {users.map((user) => {
                        const draft = drafts[user.id] || {}
                        return (
                            <form key={user.id} className="data-row rbac-edit-row" onSubmit={(event) => {
                                event.preventDefault()
                                saveUser(user)
                            }}>
                                <strong>{user.email}</strong>
                                <label className="inline-field">
                                    <span>Name</span>
                                    <input value={draft.displayName || ''} onChange={(event) => updateDraft(user.id, { displayName: event.target.value })} />
                                </label>
                                <label className="inline-field">
                                    <span>Org</span>
                                    <input value={draft.organizationName || ''} onChange={(event) => updateDraft(user.id, { organizationName: event.target.value })} />
                                </label>
                                <label className="inline-field">
                                    <span>Role</span>
                                    <select value={draft.role || user.role} onChange={(event) => updateDraft(user.id, { role: event.target.value })}>
                                        {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </label>
                                <label className="inline-field">
                                    <span>Shipper</span>
                                    <select value={draft.shipperId || ''} onChange={(event) => updateDraft(user.id, { shipperId: event.target.value })}>
                                        <option value="">All / none</option>
                                        {shippers.map((shipper) => <option key={shipper.id} value={shipper.id}>{shipper.companyName}</option>)}
                                    </select>
                                </label>
                                <label className="inline-field">
                                    <span>Truck</span>
                                    <select value={draft.truckId || ''} onChange={(event) => updateDraft(user.id, { truckId: event.target.value })}>
                                        <option value="">No truck</option>
                                        {trucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.label}</option>)}
                                    </select>
                                </label>
                                <div className="row-actions">
                                    <IconButton type="submit" icon={CheckIcon} label={`Save ${user.email}`} className="icon-button--soft" />
                                </div>
                            </form>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}

export default AdminUsersPage
