import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getRoleHome, useAuth } from '../auth'
import { requestLoginCode, verifyLoginCode } from '../api'

function LoginPage() {
    const navigate = useNavigate()
    const { signIn, user } = useAuth()
    const [email, setEmail] = useState('customer@drtx.tech')
    const [code, setCode] = useState('')
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [codeRequested, setCodeRequested] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    if (user) {
        return <Navigate to={getRoleHome(user.role)} replace />
    }

    const requestCode = async (event) => {
        event.preventDefault()
        setSubmitting(true)
        setError('')
        try {
            const payload = await requestLoginCode(email)
            setCodeRequested(true)
            setMessage(payload.devCode ? `Development code: ${payload.devCode}` : 'Verification code sent')
            if (payload.devCode) {
                setCode(payload.devCode)
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    const verifyCode = async (event) => {
        event.preventDefault()
        setSubmitting(true)
        setError('')
        try {
            const payload = await verifyLoginCode(email, code)
            signIn(payload.token, payload.user)
            navigate(getRoleHome(payload.user.role), { replace: true })
        } catch (err) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="login-page">
            <section className="login-panel panel">
                <div>
                    <p className="eyebrow">Transit Grid</p>
                    <h1>Sign in to your workspace</h1>
                </div>

                <form className="form-grid" onSubmit={codeRequested ? verifyCode : requestCode}>
                    <label>
                        Email
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            required
                        />
                    </label>
                    {codeRequested && (
                        <label>
                            Verification code
                            <input
                                value={code}
                                onChange={(event) => setCode(event.target.value)}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                            />
                        </label>
                    )}
                    <button type="submit" disabled={submitting}>
                        {codeRequested ? 'Verify code' : 'Send code'}
                    </button>
                </form>

                <div className="demo-login-list">
                    <span>Demo emails</span>
                    <button type="button" onClick={() => setEmail('customer@drtx.tech')}>Customer</button>
                    <button type="button" onClick={() => setEmail('driver@drtx.tech')}>Driver</button>
                    <button type="button" onClick={() => setEmail('dispatcher@drtx.tech')}>Dispatcher</button>
                    <button type="button" onClick={() => setEmail('fleet@drtx.tech')}>Fleet</button>
                    <button type="button" onClick={() => setEmail('broker@drtx.tech')}>Broker</button>
                    <button type="button" onClick={() => setEmail('admin@drtx.tech')}>Admin</button>
                </div>

                {message && <p className="notice-text">{message}</p>}
                {error && <p className="error-text">{error}</p>}
            </section>
        </main>
    )
}

export default LoginPage
