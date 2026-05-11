import { useEffect, useMemo, useState } from 'react'
import { updateMe } from '../api'
import { useAuth } from '../auth'
import { BuildingIcon, FlagIcon, SignalIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'

const maxAvatarBytes = 2 * 1024 * 1024

function initialsFor(name, email) {
    const source = name || email || 'TG'
    return source
        .split(/[.\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'TG'
}

function formatLabel(value, fallback) {
    return value ? value.replaceAll('_', ' ') : fallback
}

function ProfilePage() {
    const { refresh, user } = useAuth()
    const [form, setForm] = useState({ avatarUrl: '', displayName: '', organizationName: '', password: '', title: '' })
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const initials = useMemo(() => initialsFor(form.displayName, user?.email), [form.displayName, user?.email])
    const displayName = form.displayName || user?.email || 'Profile'
    const roleLabel = formatLabel(user?.role, 'Workspace user')
    const titleLabel = form.title || roleLabel
    const organizationLabel = form.organizationName || user?.organization?.legalName || user?.organizationName || user?.shipper?.companyName || user?.truck?.label || 'No organization'
    const verificationLabel = formatLabel(user?.organization?.verificationStatus, 'Active account')

    useEffect(() => {
        setForm({
            avatarUrl: user?.avatarUrl || '',
            displayName: user?.displayName || '',
            organizationName: user?.organization?.legalName || user?.organizationName || user?.shipper?.companyName || user?.truck?.label || '',
            password: '',
            title: user?.title || ''
        })
    }, [user])

    const updateForm = (patch) => {
        setForm((prev) => ({ ...prev, ...patch }))
    }

    const uploadAvatar = (file) => {
        if (!file) {
            return
        }

        if (!file.type.startsWith('image/')) {
            setError('Choose an image file')
            return
        }

        if (file.size > maxAvatarBytes) {
            setError('Avatar image must be under 2 MB')
            return
        }

        const reader = new FileReader()
        reader.onload = () => {
            setError('')
            updateForm({ avatarUrl: String(reader.result || '') })
        }
        reader.onerror = () => setError('Avatar image could not be loaded')
        reader.readAsDataURL(file)
    }

    const submit = async (event) => {
        event.preventDefault()
        setError('')
        setMessage('')

        try {
            await updateMe({
                avatarUrl: form.avatarUrl,
                displayName: form.displayName,
                organizationName: form.organizationName,
                title: form.title,
                ...(form.password ? { password: form.password } : {})
            })
            setForm((prev) => ({ ...prev, password: '' }))
            await refresh()
            setMessage('Profile updated')
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Account</p>
                    <h2>Profile</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Role', value: roleLabel, icon: SignalIcon },
                    { label: 'Organization', value: organizationLabel, icon: BuildingIcon },
                    { label: 'Review', value: verificationLabel, icon: FlagIcon },
                    { label: 'Email', value: user?.email || 'No email' }
                ]}
            />

            <div className="crud-layout">
                <form className="panel form-panel profile-settings-form" onSubmit={submit}>
                    <div className="form-header">
                        <div>
                            <p className="eyebrow">Profile details</p>
                            <h2>Identity</h2>
                        </div>
                    </div>

                    <div className="profile-field-grid">
                        <label>
                            Display name
                            <input value={form.displayName} onChange={(event) => updateForm({ displayName: event.target.value })} />
                        </label>
                        <label>
                            Title
                            <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} />
                        </label>
                        <label className="profile-field-wide">
                            Organization
                            <input value={form.organizationName} onChange={(event) => updateForm({ organizationName: event.target.value })} />
                        </label>
                    </div>

                    <div className="avatar-upload-row profile-avatar-row">
                        <div className="profile-avatar profile-avatar-large">
                            {form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : <span>{initials}</span>}
                        </div>
                        <label className="avatar-upload-control">
                            Avatar image
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={(event) => uploadAvatar(event.target.files?.[0])}
                            />
                            <small>Upload PNG, JPG, WebP or GIF under 2 MB.</small>
                        </label>
                        {form.avatarUrl && (
                            <button type="button" className="secondary-button" onClick={() => updateForm({ avatarUrl: '' })}>
                                Remove
                            </button>
                        )}
                    </div>

                    <label>
                        New password
                        <input type="password" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} minLength={8} autoComplete="new-password" />
                    </label>

                    <button type="submit">Save profile</button>
                    {message && <p className="notice-text">{message}</p>}
                    {error && <p className="error-text">{error}</p>}
                </form>

                <aside className="panel profile-account-panel">
                    <div className="page-heading">
                        <div>
                            <p className="eyebrow">Signed in as</p>
                            <h2>Account</h2>
                        </div>
                    </div>
                    <div className="profile-account-card">
                        <div className="profile-avatar profile-avatar-large">
                            {form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : <span>{initials}</span>}
                        </div>
                        <div>
                            <strong>{displayName}</strong>
                            <span>{titleLabel}</span>
                            <small>{user?.email}</small>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    )
}

export default ProfilePage
