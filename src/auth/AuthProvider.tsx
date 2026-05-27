import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAppStore } from '@/store/appStore'

type PremiumStatus = {
  isPremium: boolean
  plan: 'one_time' | 'monthly' | 'unknown' | 'admin' | null
  expiresAt: string | null
  oneTimePasses: number
}

type AuthUser = {
  id?: string
  email: string
  name: string
  avatarUrl?: string
}

type AuthContextValue = {
  loading: boolean
  loggedIn: boolean
  user: AuthUser | null
  premium: PremiumStatus
  isAdmin: boolean
  login: (redirect?: string) => void
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const EMPTY_PREMIUM: PremiumStatus = {
  isPremium: false,
  plan: null,
  expiresAt: null,
  oneTimePasses: 0,
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [premium, setPremium] = useState<PremiumStatus>(EMPTY_PREMIUM)
  const [isAdmin, setIsAdmin] = useState(false)
  const setPremiumUnlocked = useAppStore((state) => state.setPremiumUnlocked)

  const refreshAuth = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await response.json().catch(() => ({})) as Partial<AuthContextValue>
      const nextPremium = data.premium || EMPTY_PREMIUM
      const nextIsAdmin = Boolean(data.isAdmin)
      setLoggedIn(Boolean(data.loggedIn))
      setUser(data.user || null)
      setPremium(nextPremium)
      setIsAdmin(nextIsAdmin)
      setPremiumUnlocked(nextIsAdmin || Boolean(nextPremium.isPremium))
    } catch (err) {
      console.error('Auth status failed:', err)
      setLoggedIn(false)
      setUser(null)
      setPremium(EMPTY_PREMIUM)
      setIsAdmin(false)
      setPremiumUnlocked(false)
    } finally {
      setLoading(false)
    }
  }, [setPremiumUnlocked])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  const login = useCallback((redirect = `${window.location.pathname}${window.location.search}`) => {
    window.location.href = `/api/auth/google?redirect=${encodeURIComponent(redirect || '/')}`
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => null)
    await refreshAuth()
  }, [refreshAuth])

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    loggedIn,
    user,
    premium,
    isAdmin,
    login,
    logout,
    refreshAuth,
  }), [isAdmin, loading, loggedIn, login, logout, premium, refreshAuth, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
