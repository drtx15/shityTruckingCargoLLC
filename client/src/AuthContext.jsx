import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAuthToken, getMe, setAuthToken } from './api'
import { AuthContext } from './auth'

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(Boolean(getAuthToken()))

    const refresh = useCallback(async () => {
        if (!getAuthToken()) {
            setUser(null)
            setLoading(false)
            return null
        }

        setLoading(true)
        try {
            const payload = await getMe()
            setUser(payload.user)
            return payload.user
        } catch {
            setUser(null)
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        refresh()
    }, [refresh])

    useEffect(() => {
        const handleUnauthorized = () => {
            setAuthToken('')
            setUser(null)
        }

        window.addEventListener('transit-grid:unauthorized', handleUnauthorized)
        return () => window.removeEventListener('transit-grid:unauthorized', handleUnauthorized)
    }, [])

    const signIn = useCallback((token, nextUser) => {
        setAuthToken(token)
        setUser(nextUser)
    }, [])

    const signOut = useCallback(() => {
        setAuthToken('')
        setUser(null)
    }, [])

    const value = useMemo(() => ({
        loading,
        refresh,
        signIn,
        signOut,
        user
    }), [loading, refresh, signIn, signOut, user])

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
