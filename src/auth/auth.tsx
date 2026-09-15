/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/supabase/client'
import { unsubscribeAll } from '@/supabase/realtime'
import { useAccountsStore } from '@/stores/accountsStore'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useTransactionsStore } from '@/stores/transactionsStore'
import { useBudgetsStore } from '@/stores/budgetsStore'
import { useInvestmentPlansStore } from '@/stores/investmentPlansStore'
import { useRecurringTransactionsStore } from '@/stores/recurringTransactionsStore'
import type { User, Session } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPasswordForEmail: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const appUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '')

/** Every per-user financial collection. Wiped whenever the signed-in identity changes. */
const FINANCIAL_STORES = [
  useAccountsStore,
  useCategoriesStore,
  useTransactionsStore,
  useBudgetsStore,
  useInvestmentPlansStore,
  useRecurringTransactionsStore,
] as const

function resetFinancialStores() {
  unsubscribeAll()
  for (const store of FINANCIAL_STORES) {
    store.getState().reset()
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Tracks the signed-in identity across auth events; `null` until an event
    // establishes it. Reset fires when it changes or on explicit SIGNED_OUT.
    let currentUserId: string | null = null
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // On identity change (sign-out or a different signed-in user), wipe every
      // financial collection and tear down realtime so nothing from the previous
      // session leaks into the next one.
      const uid = session?.user?.id ?? null
      if (event === 'SIGNED_OUT' || uid !== currentUserId) {
        resetFinancialStores()
        currentUserId = uid
      }
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/auth/reset-password') {
        navigate('/auth/reset-password', { replace: true })
      }
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }, [])
  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
  }, [])

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl ?? window.location.origin}/auth/reset-password`,
    })
    if (error) throw new Error(error.message)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }, [])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      resetPasswordForEmail,
      updatePassword,
    }),
    [user, session, loading, signIn, signUp, signOut, resetPasswordForEmail, updatePassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return <>{children}</>
}
