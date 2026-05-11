import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getRoleHome, useAuth } from '../auth'
import { loginWithPassword, registerAccount } from '../api'
import { BuildingIcon, FlagIcon, RouteIcon, SignalIcon, SpeedometerIcon, TruckIcon } from '../components/IconControls'

const accountTypes = [
    {
        organizationType: 'SHIPPER',
        label: 'Post freight',
        role: 'CUSTOMER',
        title: 'Shipping team',
        workspace: 'Shipper portal',
        summary: 'Tender freight, manage orders, and track carrier execution.',
        organizationLabel: 'Legal business name',
        organizationPlaceholder: 'Acme Manufacturing LLC',
        icon: BuildingIcon
    },
    {
        organizationType: 'CARRIER',
        label: 'Provide capacity',
        role: 'FLEET_MANAGER',
        title: 'Carrier operator',
        workspace: 'Carrier workspace',
        summary: 'Manage fleet capacity, drivers, compliance, and available freight.',
        organizationLabel: 'Legal carrier name',
        organizationPlaceholder: 'Silk Road Carriers LLC',
        icon: TruckIcon
    },
    {
        organizationType: 'BROKER',
        label: 'Broker loads',
        role: 'BROKER',
        title: 'Brokerage desk',
        workspace: 'Broker desk',
        summary: 'Match shipper demand with qualified carrier capacity.',
        organizationLabel: 'Legal brokerage name',
        organizationPlaceholder: 'Transit Grid Brokerage LLC',
        icon: RouteIcon
    }
]

const inviteOnlyAccounts = [
    { label: 'Driver', text: 'Drivers join a verified carrier account by invitation.', icon: SpeedometerIcon },
    { label: 'Dispatcher', text: 'Dispatchers are added by a carrier, broker, or platform admin.', icon: SignalIcon },
    { label: 'Platform admin', text: 'Admins are provisioned by an internal command, never public signup.', icon: FlagIcon }
]

const signupSteps = [
    { key: 'account', label: 'Account' },
    { key: 'business', label: 'Business' },
    { key: 'profile', label: 'Profile' },
    { key: 'credentials', label: 'Access' }
]

const maxAvatarBytes = 2 * 1024 * 1024

function initialsFor(name, email) {
    const source = name || email || 'Transit Grid'
    return source
        .split(/[.\s_-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'TG'
}

function LoginPage({ themeToggle }) {
    const navigate = useNavigate()
    const { signIn, user } = useAuth()
    const [mode, setMode] = useState('signin')
    const [form, setForm] = useState({
        accountType: 'SHIPPER',
        avatarUrl: '',
        complianceAttested: false,
        docketNumber: '',
        docketPrefix: 'MC',
        dotNumber: '',
        displayName: '',
        email: '',
        organizationName: '',
        password: '',
        role: 'CUSTOMER',
        title: ''
    })
    const [signupStep, setSignupStep] = useState(0)
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const selectedAccount = accountTypes.find((account) => account.organizationType === form.accountType) || accountTypes[0]
    const initials = useMemo(() => initialsFor(form.displayName, form.email), [form.displayName, form.email])

    if (user) {
        return <Navigate to={getRoleHome(user.role)} replace />
    }

    const updateForm = (patch) => {
        setForm((prev) => ({ ...prev, ...patch }))
    }

    const selectMode = (nextMode) => {
        setMode(nextMode)
        setError('')
        if (nextMode === 'signup') {
            setSignupStep(0)
        }
    }

    const selectAccount = (nextAccount) => {
        setForm((prev) => {
            const currentAccount = accountTypes.find((account) => account.organizationType === prev.accountType) || accountTypes[0]
            const shouldReplaceTitle = !prev.title || prev.title === currentAccount.title
            return {
                ...prev,
                accountType: nextAccount.organizationType,
                role: nextAccount.role,
                title: shouldReplaceTitle ? nextAccount.title : prev.title
            }
        })
    }

    const businessRequirementsMissing = () => {
        if (!form.organizationName.trim()) {
            return 'Legal organization name is required'
        }

        if ((form.accountType === 'CARRIER' || form.accountType === 'BROKER') && !form.dotNumber.trim()) {
            return 'USDOT number is required for carriers and brokers'
        }

        if (form.accountType === 'BROKER' && !form.docketNumber.trim()) {
            return 'Broker accounts require an MC, FF, or MX docket number'
        }

        if ((form.accountType === 'CARRIER' || form.accountType === 'BROKER') && !form.complianceAttested) {
            return 'Confirm that this business understands FMCSA compliance review'
        }

        return ''
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

    const nextSignupStep = () => {
        if (signupStep === 1) {
            const missing = businessRequirementsMissing()
            if (missing) {
                setError(missing)
                return
            }
        }

        if (signupStep === 2 && !form.displayName.trim()) {
            setError('Full name is required')
            return
        }

        setError('')
        setSignupStep((step) => Math.min(step + 1, signupSteps.length - 1))
    }

    const previousSignupStep = () => {
        setError('')
        setSignupStep((step) => Math.max(step - 1, 0))
    }

    const submit = async (event) => {
        event.preventDefault()

        if (mode === 'signup' && signupStep < signupSteps.length - 1) {
            nextSignupStep()
            return
        }

        if (mode === 'signup' && !form.displayName.trim()) {
            setSignupStep(2)
            setError('Full name is required')
            return
        }

        if (mode === 'signup') {
            const missing = businessRequirementsMissing()
            if (missing) {
                setSignupStep(1)
                setError(missing)
                return
            }
        }

        setSubmitting(true)
        setError('')

        try {
            const payload = mode === 'signin'
                ? await loginWithPassword(form.email, form.password)
                : await registerAccount({
                    avatarUrl: form.avatarUrl,
                    companyName: form.organizationName,
                    docketNumber: form.docketNumber,
                    docketPrefix: form.docketPrefix,
                    dotNumber: form.dotNumber,
                    displayName: form.displayName,
                    email: form.email,
                    organizationName: form.organizationName,
                    organizationType: form.accountType,
                    password: form.password,
                    role: form.role,
                    title: form.title || selectedAccount.title
                })

            signIn(payload.token, payload.user)
            navigate(getRoleHome(payload.user.role), { replace: true })
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="login-page auth-page">
            <section className="auth-shell">
                <aside className="auth-brand-panel">
                    <div className="auth-brand-top">
                        <div className="brand-mark" aria-hidden="true">TG</div>
                        <div>
                            <p className="eyebrow">Transit Grid</p>
                            <h1>Logistics marketplace workspace</h1>
                        </div>
                    </div>
                    <div className="auth-profile-preview">
                        <div className="profile-avatar profile-avatar-large">
                            {form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : <span>{initials}</span>}
                        </div>
                        <div>
                            <strong>{form.displayName || 'Your profile'}</strong>
                            <span>{form.title || selectedAccount.title}</span>
                            <small>{form.organizationName || form.email || 'name@company.com'}</small>
                        </div>
                    </div>
                    <div className="auth-market-preview">
                        <span>{form.accountType} account</span>
                        <strong>{selectedAccount.workspace}</strong>
                        <p>{selectedAccount.summary}</p>
                        <div className="auth-market-lanes" aria-label="Marketplace sides">
                            <small>Freight demand</small>
                            <small>Carrier capacity</small>
                            <small>Compliance review</small>
                        </div>
                    </div>
                </aside>

                <section className="login-panel panel auth-card">
                    <div className="login-panel-header">
                        <div>
                            <p className="eyebrow">Account</p>
                            <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
                        </div>
                        {themeToggle}
                    </div>

                    <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
                        <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => selectMode('signin')}>
                            Sign in
                        </button>
                        <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => selectMode('signup')}>
                            Sign up
                        </button>
                    </div>

                    <form className="form-grid auth-form" onSubmit={submit}>
                        {mode === 'signup' && (
                            <>
                                <div className="auth-stepper" aria-label="Sign up steps">
                                    {signupSteps.map((step, index) => (
                                        <button
                                            key={step.key}
                                            type="button"
                                            className={[
                                                'auth-step',
                                                index === signupStep ? 'is-active' : '',
                                                index < signupStep ? 'is-complete' : ''
                                            ].filter(Boolean).join(' ')}
                                            onClick={() => setSignupStep(index)}
                                        >
                                            <span>{index + 1}</span>
                                            <strong>{step.label}</strong>
                                        </button>
                                    ))}
                                </div>

                                {signupStep === 0 && (
                                    <div className="auth-step-panel marketplace-onboarding">
                                        <div className="section-kicker">
                                            <p className="eyebrow">Business account</p>
                                            <strong>Which side of the freight market are you joining?</strong>
                                        </div>
                                        <div className="marketplace-role-grid">
                                            {accountTypes.map((account) => {
                                                const Icon = account.icon
                                                const active = account.organizationType === form.accountType
                                                return (
                                                    <button
                                                        key={account.organizationType}
                                                        type="button"
                                                        className={`marketplace-role-option ${active ? 'is-active' : ''}`}
                                                        aria-pressed={active}
                                                        onClick={() => selectAccount(account)}
                                                    >
                                                        <span className="role-option-icon"><Icon /></span>
                                                        <span>
                                                            <strong>{account.label}</strong>
                                                            <small>{account.workspace}</small>
                                                        </span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        <div className="invite-only-grid">
                                            {inviteOnlyAccounts.map((account) => {
                                                const Icon = account.icon
                                                return (
                                                    <div key={account.label} className="invite-only-item">
                                                        <span className="role-option-icon"><Icon /></span>
                                                        <span>
                                                            <strong>{account.label}</strong>
                                                            <small>{account.text}</small>
                                                        </span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {signupStep === 1 && (
                                    <div className="auth-step-panel">
                                        <label>
                                            {selectedAccount.organizationLabel}
                                            <input
                                                value={form.organizationName}
                                                onChange={(event) => updateForm({ organizationName: event.target.value })}
                                                placeholder={selectedAccount.organizationPlaceholder}
                                                required
                                            />
                                        </label>
                                        {(form.accountType === 'CARRIER' || form.accountType === 'BROKER') && (
                                            <label>
                                                USDOT number
                                                <input
                                                    value={form.dotNumber}
                                                    onChange={(event) => updateForm({ dotNumber: event.target.value })}
                                                    inputMode="numeric"
                                                    placeholder="1234567"
                                                    required
                                                />
                                            </label>
                                        )}
                                        {form.accountType === 'BROKER' && (
                                            <div className="split-fields">
                                                <label>
                                                    Docket prefix
                                                    <select value={form.docketPrefix} onChange={(event) => updateForm({ docketPrefix: event.target.value })}>
                                                        <option value="MC">MC</option>
                                                        <option value="FF">FF</option>
                                                        <option value="MX">MX</option>
                                                    </select>
                                                </label>
                                                <label>
                                                    Docket number
                                                    <input
                                                        value={form.docketNumber}
                                                        onChange={(event) => updateForm({ docketNumber: event.target.value })}
                                                        inputMode="numeric"
                                                        placeholder="123456"
                                                        required
                                                    />
                                                </label>
                                            </div>
                                        )}
                                        {(form.accountType === 'CARRIER' || form.accountType === 'BROKER') && (
                                            <label className="checkbox-card">
                                                <input
                                                    type="checkbox"
                                                    checked={form.complianceAttested}
                                                    onChange={(event) => updateForm({ complianceAttested: event.target.checked })}
                                                />
                                                <span>
                                                    I understand this business must pass compliance review before operating on the marketplace.
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                )}

                                {signupStep === 2 && (
                                    <div className="auth-step-panel">
                                        <label>
                                            Full name
                                            <input
                                                value={form.displayName}
                                                onChange={(event) => updateForm({ displayName: event.target.value })}
                                                autoComplete="name"
                                                required
                                            />
                                        </label>
                                        <label>
                                            Title
                                            <input
                                                value={form.title}
                                                onChange={(event) => updateForm({ title: event.target.value })}
                                                placeholder={selectedAccount.title}
                                            />
                                        </label>
                                        <div className="avatar-upload-row">
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
                                    </div>
                                )}
                            </>
                        )}

                        {(mode === 'signin' || signupStep === 3) && (
                            <div className="auth-step-panel">
                                <label>
                                    Email
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(event) => updateForm({ email: event.target.value })}
                                        autoComplete="email"
                                        required
                                    />
                                </label>
                                <label>
                                    Password
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={(event) => updateForm({ password: event.target.value })}
                                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                        minLength={8}
                                        required
                                    />
                                </label>
                            </div>
                        )}

                        <div className="auth-step-actions">
                            {mode === 'signup' && signupStep > 0 && (
                                <button type="button" className="secondary-button" onClick={previousSignupStep}>
                                    Back
                                </button>
                            )}
                            <button type="submit" disabled={submitting}>
                                {submitting
                                    ? 'Working...'
                                    : mode === 'signin'
                                        ? 'Sign in'
                                        : signupStep < signupSteps.length - 1
                                            ? 'Continue'
                                            : 'Create account'}
                            </button>
                        </div>
                    </form>

                    {error && <p className="error-text">{error}</p>}
                </section>
            </section>
        </main>
    )
}

export default LoginPage
