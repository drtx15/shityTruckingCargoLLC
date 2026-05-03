import { useEffect, useState } from 'react'
import { getUsers } from '../api'

function AdminUsersPage() {
    const [users, setUsers] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        getUsers().then(setUsers).catch((err) => setError(err.message))
    }, [])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Admin</p>
                    <h2>Users and roles</h2>
                </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="panel data-list">
                {users.map((user) => (
                    <div key={user.id} className="data-row compact-row">
                        <strong>{user.email}</strong>
                        <span>{user.role}</span>
                        <span>{user.shipper?.companyName || 'No customer link'}</span>
                        <span>{user.truck?.label || 'No truck link'}</span>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default AdminUsersPage
