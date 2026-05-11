import { useEffect, useMemo, useState } from 'react'
import { updateMe } from '../api'
import { useAuth } from '../auth'
import { BuildingIcon, FlagIcon, SignalIcon } from '../components/IconControls'

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

function ProfileMetaItem({ icon: Icon, label, value }) {
    return (
        <div className="profile-meta-item">
            <span className="profile-meta-icon" aria-hidden="true"><Icon /></span>
            <div>
                <span className="profile-meta-label">{label}</span>
                <strong>{value}</strong>
            </div>
        </div>
    )
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
        <section className="page-stack profile-page">
            <div className="page-heading profile-page-heading">
                <div>
                    <p className="eyebrow">Account</p>
                    <h2>Profile</h2>
                </div>
                <span className="profile-heading-badge">{roleLabel}</span>
            </div>

            <div className="profile-layout">
                <aside className="panel profile-preview-panel">
                    <div className="profile-summary-main">
                        <div className="profile-avatar profile-avatar-xl">
                            {form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : <span>{initials}</span>}
                        </div>
                        <div className="profile-summary-copy">
                            <h2>{displayName}</h2>
                            <p>{titleLabel}</p>
                            <span>{user?.email}</span>
                        </div>
                    </div>

                    <div className="profile-meta-list">
                        <ProfileMetaItem icon={BuildingIcon} label="Organization" value={organizationLabel} />
                        <ProfileMetaItem icon={FlagIcon} label="Review status" value={verificationLabel} />
                        <ProfileMetaItem icon={SignalIcon} label="Email" value={user?.email || 'No email'} />
                    </div>
                </aside>

                <form className="panel form-panel profile-form" onSubmit={submit}>
                    <section className="profile-form-section">
                        <div className="profile-section-head">
                            <p className="eyebrow">Identity</p>
                            <h2>Personal details</h2>
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
                    </section>

                    <section className="profile-form-section">
                        <div className="profile-section-head">
                            <p className="eyebrow">Avatar</p>
                            <h2>Profile image</h2>
                        </div>
                        <div className="profile-avatar-editor">
                            <div className="profile-avatar profile-avatar-large">
                                {form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : <span>{initials}</span>}
                            </div>
                            <div className="profile-upload-copy">
                                <strong>Avatar image</strong>
                                <small>PNG, JPG, WebP or GIF under 2 MB.</small>
                            </div>
                            <div className="profile-upload-actions">
                                <label className="profile-file-picker">
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/gif"
                                        onChange={(event) => uploadAvatar(event.target.files?.[0])}
                                    />
                                    <span>Choose image</span>
                                </label>
                                {form.avatarUrl && (
                                    <button type="button" className="secondary-button" onClick={() => updateForm({ avatarUrl: '' })}>
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="profile-form-section">
                        <div className="profile-section-head">
                            <p className="eyebrow">Security</p>
                            <h2>Password</h2>
                        </div>
                        <label>
                            New password
                            <input type="password" value={form.password} onChange={(event) => updateForm({ password: event.target.value })} minLength={8} autoComplete="new-password" />
                        </label>
                    </section>

                    <div className="profile-form-actions">
                        <button type="submit">Save profile</button>
                        <div aria-live="polite">
                            {message && <p className="notice-text">{message}</p>}
                            {error && <p className="error-text">{error}</p>}
                        </div>
                    </div>
                </form>
            </div>
        </section>
    )
}

export default ProfilePage
