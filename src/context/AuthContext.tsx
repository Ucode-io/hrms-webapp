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
import { langWithRegion, tr, useI18n } from '../i18n'
import {
  DEFAULT_TIME_ZONE,
  getEmployeeTimeZone,
  getRegionLanguage,
  type EmployeeRegion,
  type EmployeeTimeZone,
} from '../api/regionService'
import { toIsoDate } from '../api/absenceService'

// Человеческий текст ucode кладёт в `data`, а в `description` — константу под
// код ответа: на неверный пароль там «Invalid argument value passed», и именно
// это видел сотрудник. Текст из `data` приходит только по-русски, поэтому он
// нужен ради нечастых случаев («Пользователь заблокирован»), а обычную осечку
// логина перекрывает свой перевод.
function getAuthErrorMessage(error: unknown): string {
  const ax = error as AxiosError<{ data?: unknown }> | null
  const message = ax?.response?.data?.data
  return typeof message === 'string' && message.trim().length > 0
    ? message
    : tr('auth.badCredentials')
}

export function getDisplayName(user: UserData | null): string {
  const full = [user?.first_name, user?.second_name].filter(Boolean).join(' ')
  if (full.trim().length > 0) return full
  if (typeof user?.login === 'string' && user.login.trim().length > 0) return user.login
  return tr('auth.employee')
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
  /** Часы и язык места, где сотрудник работает. См. regionService. */
  region: EmployeeRegion
  /**
   * Пришёл ли пояс от сервера. Пока нет, `region.timezone` — запасной
   * Ташкент, и отметку ставить нельзя: штамп необратим (ADR-0005).
   */
  regionStatus: 'pending' | 'error' | 'success'
  retryRegion: () => void
  newsFeed: NewsItem[]
  isNewsLoading: boolean
  newsError: string
  isAuthorized: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  loginError: string
  isSubmitting: boolean
}

/** Запасной циферблат и пустой язык — пока нет ни одного ответа о поясе. */
const NO_LANGUAGES: EmployeeRegion['languages'] = []
const FALLBACK_REGION: EmployeeRegion = { timezone: DEFAULT_TIME_ZONE, language: null, languages: NO_LANGUAGES }

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  region: FALLBACK_REGION,
  regionStatus: 'pending',
  retryRegion: () => {},
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
  const { setLang, setAllowedLangs } = useI18n()
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
  const newsError = _newsError ? tr('auth.newsFailed') : ''

  // Регион сотрудника — часы его филиала и язык места. Часы нужны всегда:
  // ими штампуется каждая отметка (ADR-0005), поэтому запрос идёт независимо
  // от того, дошла ли до региона очередь по языку. Филиал на дату сервер
  // находит сам, развёрнутые связи профиля не нужны.
  //
  // Запрос — раз в сутки устройства: дата в ключе. Мини-апп живёт в Telegram
  // сутками, а с первого дня перевода в филиал другого пояса штамп обязан
  // смениться. Минутный тик ничего не запрашивает — ключ меняется только со
  // сменой даты; возврат из фона проверяет сразу, таймеры там стоят.
  const [today, setToday] = useState(() => toIsoDate(new Date()))
  useEffect(() => {
    const tick = () => setToday(toIsoDate(new Date()))
    const timer = window.setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  // Тот же guid, что у отметки (`CheckInActions`): профиль бывает без guid, и
  // запрос, ждущий только его, не стартовал бы никогда.
  const employeeGuid =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  const companiesId = typeof profile?.companies_id === 'string' ? profile.companies_id : ''
  const { data: zone, status, fetchStatus, refetch: refetchRegion } = useQuery({
    queryKey: ['employeeTimeZone', employeeGuid, today],
    queryFn: () => getEmployeeTimeZone(employeeGuid, today),
    enabled: isAuthorized && Boolean(employeeGuid),
  })
  // Последний удачный пояс — для «сегодня» на экране и для языка, пока новый
  // день грузится или упал. Штамповать по нему нельзя — это решает статус ниже.
  const [lastZone, setLastZone] = useState<EmployeeTimeZone | null>(null)
  if (zone && zone !== lastZone) setLastZone(zone)
  const shownZone = zone ?? (isAuthorized ? lastZone : null)
  // Язык — отдельным запросом: медленный GET за ним не держит отметку. Пока
  // грузится новый, держим прошлый — язык догадка, мигать ему незачем.
  const { data: regionLanguage } = useQuery({
    queryKey: ['regionLanguage', shownZone?.regionId ?? '', companiesId],
    queryFn: () => getRegionLanguage(shownZone?.regionId ?? '', companiesId),
    enabled: Boolean(shownZone),
    placeholderData: (previous) => previous,
  })
  const region: EmployeeRegion = shownZone
    ? {
        timezone: shownZone.timezone,
        language: regionLanguage?.language ?? null,
        languages: regionLanguage?.languages ?? NO_LANGUAGES,
      }
    : FALLBACK_REGION
  // Штамп — только по ответу на сегодня. Он есть — упавший фоновый
  // перезапрос его не отменяет. Его нет — ждём, а «повторить» показываем
  // после отказа (не во время повтора) и без сети: там запрос стоит на паузе
  // и сам не кончится.
  const regionStatus: AuthContextValue['regionStatus'] = zone
    ? 'success'
    : (status === 'error' && fetchStatus !== 'fetching') || fetchStatus === 'paused'
      ? 'error'
      : 'pending'

  // Язык региона — предположение о месте, и в цепочке он отвечает последним
  // (ADR-0006): всё, что известно про самого человека, побеждает регион.
  // Порядок звеньев держит `pickLang`; здесь только применяем его ответ, и
  // без записи в хранилище — догадка не должна пережить настоящий выбор.
  // Набор разрешённых языков приезжает тем же запросом и фильтрует всю
  // цепочку — до его приезда ограничения нет (`pickLang.ts`).
  useEffect(() => {
    setAllowedLangs(region.languages)
    setLang(langWithRegion(region.language, region.languages), false)
  }, [region.language, region.languages, setAllowedLangs, setLang])

  const login = async (username: string, password: string) => {
    const normalizedUsername = username.trim()
    if (!normalizedUsername || !password) {
      setLoginError(tr('auth.emptyCredentials'))
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
  //
  // Раз на карточку, а не на запуск: выход не перезагружает приложение, и вход
  // под другой карточкой в том же запуске иначе оставался непривязанным.
  //
  // initData пуст и тогда, когда мини-апп открыт кнопкой клавиатуры бота
  // («Отпроситься»): такой запуск Telegram не подписывает. Привяжется при
  // следующем открытии через кнопку меню.
  const telegramLinkedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isAuthorized || !userGuid || telegramLinkedRef.current === userGuid) return
    const initData = window.Telegram?.WebApp?.initData
    if (!initData) return // вне Telegram привязывать нечего

    telegramLinkedRef.current = userGuid
    void reportsService.linkTelegram(initData).catch(() => {})
  }, [isAuthorized, userGuid])

  // «Последний вход» в админке. Отдельно от привязки Telegram: та требует
  // подписанный initData и обновляет одну строку из нескольких у человека в
  // нескольких компаниях, из-за чего часть входов до админки не доходила.
  // Один раз на запуск приложения — и после свежего входа, и после
  // восстановленной сессии, то есть ровно «человек открыл приложение».
  const loginTouchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isAuthorized || !userGuid || loginTouchedRef.current === userGuid) return
    loginTouchedRef.current = userGuid
    void reportsService.touchLogin(userGuid).catch(() => {})
  }, [isAuthorized, userGuid])

  return (
    <AuthContext.Provider
      value={{
        session, profile, region, regionStatus, retryRegion: () => void refetchRegion(), newsFeed, isNewsLoading, newsError,
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
