import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { loginWithPassword, type UserData } from '../api/authService'
import { getNewsFeed, getUserBaseByGuid, type NewsItem } from '../api/dashboardService'
import { reportsService } from '../api/reportsService'
import { setUnauthorizedHandler } from '../api/unauthorizedHandler'
import {
  clearSession,
  loadSession,
  persistSession,
  type AuthSession,
} from '../auth/session'

function getAuthErrorMessage(error: unknown): string {
  const ax = error as AxiosError<{ description?: string }> | null
  const desc = ax?.response?.data?.description
  return typeof desc === 'string' && desc.trim().length > 0 ? desc : 'Неверный логин или пароль'
}

export function getDisplayName(user: UserData | null): string {
  const full = [user?.first_name, user?.second_name].filter(Boolean).join(' ')
  if (full.trim().length > 0) return full
  if (typeof user?.login === 'string' && user.login.trim().length > 0) return user.login
  return 'Сотрудник'
}

export function getInitials(user: UserData | null): string {
  const f = typeof user?.first_name === 'string' ? user.first_name.trim() : ''
  const s = typeof user?.second_name === 'string' ? user.second_name.trim() : ''
  const initials = `${f.charAt(0)}${s.charAt(0)}`.toUpperCase()
  if (initials) return initials
  if (typeof user?.login === 'string' && user.login.length > 0)
    return user.login.slice(0, 2).toUpperCase()
  return 'HR'
}

interface AuthContextValue {
  session: AuthSession | null
  profile: UserData | null
  newsFeed: NewsItem[]
  isNewsLoading: boolean
  newsError: string
  isAuthorized: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  loginError: string
  isSubmitting: boolean
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  newsFeed: [],
  isNewsLoading: false,
  newsError: '',
  isAuthorized: false,
  login: async () => {},
  logout: () => {},
  loginError: '',
  isSubmitting: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession())
  const [loginError, setLoginError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAuthorized = Boolean(session?.token)
  const userGuid =
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) || ''

  const { data: profileData } = useQuery({
    queryKey: ['profile', userGuid],
    queryFn: async () => {
      if (!userGuid) return null
      try {
        const userBase = await getUserBaseByGuid(userGuid)
        const newProfile = userBase || session?.user_data || session?.user || null
        if (newProfile) {
          localStorage.setItem('user_profile', JSON.stringify(newProfile))
        }
        return newProfile
      } catch {
        return session?.user_data || session?.user || null
      }
    },
    initialData: () => {
      try {
        const cached = localStorage.getItem('user_profile')
        if (cached) return JSON.parse(cached) as UserData
      } catch {}
      return undefined
    },
    initialDataUpdatedAt: 0,
    enabled: isAuthorized && !!userGuid,
  })

  const {
    data: newsFeed = [],
    isLoading: isNewsLoading,
    error: _newsError,
  } = useQuery({
    queryKey: ['newsFeed'],
    queryFn: async () => getNewsFeed(),
    enabled: isAuthorized,
  })

  const profile = profileData || session?.user_data || session?.user || null
  const newsError = _newsError ? 'Не удалось загрузить ленту новостей' : ''

  const login = async (username: string, password: string) => {
    const normalizedUsername = username.trim()
    if (!normalizedUsername || !password) {
      setLoginError('Заполните логин и пароль')
      return
    }
    setLoginError('')
    setIsSubmitting(true)
    try {
      const response = await loginWithPassword(normalizedUsername, password)
      const nextSession = persistSession(response)
      setSession(nextSession)
    } catch (err: unknown) {
      setLoginError(getAuthErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const logout = () => {
    clearSession()
    localStorage.removeItem('user_profile')
    setSession(null)
    setLoginError('')
  }

  // Let the authenticated axios interceptor force a logout on any 401.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem('user_profile')
      setSession(null)
      setLoginError('')
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  // Привязка Telegram-чата к сотруднику. Завязано на isAuthorized, а не на
  // login(): срабатывает и после свежего входа, и при восстановленной сессии —
  // иначе тот, кто уже залогинен, никогда бы не привязался.
  //
  // Молча, без индикации: уведомления в боте — приятный бонус, и упавшая
  // привязка не повод показывать сотруднику ошибку на входе.
  const telegramLinkedRef = useRef(false)
  useEffect(() => {
    if (!isAuthorized || telegramLinkedRef.current) return
    const initData = window.Telegram?.WebApp?.initData
    if (!initData) return // вне Telegram привязывать нечего

    telegramLinkedRef.current = true
    void reportsService.linkTelegram(initData).catch(() => {})
  }, [isAuthorized])

  return (
    <AuthContext.Provider
      value={{
        session, profile, newsFeed, isNewsLoading, newsError,
        isAuthorized, login, logout, loginError, isSubmitting,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
