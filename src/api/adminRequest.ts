import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { loadSession, updateSessionTokens } from '../auth/session'
import { refreshTokens } from './authService'
import { handleUnauthorized } from './unauthorizedHandler'

const API_BASE_URL = 'https://api.admin.u-code.io/'
export const DEFAULT_PROJECT_ID = '9a462573-ce11-4288-928a-a6ba754b6998'
const API_KEY = 'P-aUAOU0KNOuRctMIRJDjVb5kElKgxkYpI'
const AUTH_PERSIST_KEY = 'ayva-auth'
const USER_PROFILE_KEY = 'user_profile'

const adminRequest = axios.create({
  baseURL: API_BASE_URL,
  timeout: 100000,
  params: {
    'project-id': DEFAULT_PROJECT_ID,
  },
  headers: {
    'Content-Type': 'application/json',
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeCompanyId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null

const parseStoredRecord = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const getCompaniesId = (): string | null => {
  const persistedSession = parseStoredRecord(localStorage.getItem(AUTH_PERSIST_KEY))
  const persistedUserProfile = parseStoredRecord(localStorage.getItem(USER_PROFILE_KEY))

  return (
    normalizeCompanyId(persistedSession?.companyId) ||
    normalizeCompanyId(persistedSession?.user_data && (persistedSession.user_data as Record<string, unknown>).companies_id) ||
    normalizeCompanyId(persistedSession?.user && (persistedSession.user as Record<string, unknown>).companies_id) ||
    normalizeCompanyId(persistedUserProfile?.companies_id)
  )
}

// Резолвер для UI-слоя: сначала свежие данные профиля/сессии из React-стейта,
// затем сохранённая сессия. Возвращает '' — удобно для query-key и payload'ов.
export const resolveCompaniesId = (...sources: unknown[]): string => {
  for (const source of sources) {
    if (!isRecord(source)) continue
    const value = normalizeCompanyId(source.companies_id)
    if (value) return value
  }

  return getCompaniesId() || ''
}

// GET-фильтры уходят в один query-параметр `data` — либо объектом, либо уже
// закодированной JSON-строкой. Достаём исходные фильтры, чтобы не потерять их
// при добавлении companies_id.
const parseDataQueryParam = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.length === 0) return {}

  const candidates = [value]
  try {
    candidates.push(decodeURIComponent(value))
  } catch {
    // Оставляем исходный вариант.
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (isRecord(parsed)) return parsed
    } catch {
      // Пробуем следующий вариант.
    }
  }

  return {}
}

const isItemsRequest = (url?: string): boolean =>
  typeof url === 'string' && url.includes('/v2/items/')

const isInvokeFunctionRequest = (url?: string): boolean =>
  typeof url === 'string' && url.includes('/v2/invoke_function/')

const withCompaniesId = (value: Record<string, unknown>, companiesId: string): Record<string, unknown> => ({
  ...value,
  companies_id: companiesId,
})

const injectCompaniesIntoItemsRequest = (
  config: InternalAxiosRequestConfig,
  companiesId: string,
): InternalAxiosRequestConfig => {
  if (!isItemsRequest(config.url)) return config

  const method = (config.method || 'get').toLowerCase()
  if (method === 'get') {
    const params = isRecord(config.params) ? { ...config.params } : {}
    params.companies_id = companiesId
    const dataParam = parseDataQueryParam(params.data)
    params.data = encodeURIComponent(JSON.stringify(withCompaniesId(dataParam, companiesId)))
    config.params = params
    return config
  }

  if (!isRecord(config.data)) {
    config.data = { companies_id: companiesId, data: { companies_id: companiesId } }
    return config
  }

  const requestBody: Record<string, unknown> = { ...config.data, companies_id: companiesId }
  if (isRecord(requestBody.data)) {
    requestBody.data = withCompaniesId(requestBody.data, companiesId)
  }
  if (Array.isArray(requestBody.items)) {
    requestBody.items = requestBody.items.map((item) =>
      isRecord(item) ? withCompaniesId(item, companiesId) : item,
    )
  }
  config.data = requestBody
  return config
}

const injectCompaniesIntoInvokeFunctionRequest = (
  config: InternalAxiosRequestConfig,
  companiesId: string,
): InternalAxiosRequestConfig => {
  if (!isInvokeFunctionRequest(config.url)) return config

  // Шлюз разворачивает конверт до объекта с `method`, а метод читает только
  // вложенный `data` — companies_id кладём именно туда (как в hrms-front).
  const requestBody: Record<string, unknown> = isRecord(config.data) ? { ...config.data } : {}
  const gatewayPayload: Record<string, unknown> = isRecord(requestBody.data) ? { ...requestBody.data } : {}

  if (isRecord(gatewayPayload.data)) {
    gatewayPayload.data = withCompaniesId(gatewayPayload.data, companiesId)
  } else if (Array.isArray(gatewayPayload.data)) {
    gatewayPayload.data = gatewayPayload.data.map((item) =>
      isRecord(item) ? withCompaniesId(item, companiesId) : item,
    )
  } else {
    gatewayPayload.data = { companies_id: companiesId }
  }

  requestBody.data = gatewayPayload
  config.data = requestBody
  return config
}

adminRequest.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('auth_token')
  const companiesId = getCompaniesId()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    config.headers.Authorization = 'API-KEY'
    config.headers['X-Api-Key'] = API_KEY
  }

  if (companiesId) {
    const withItems = injectCompaniesIntoItemsRequest(config, companiesId)
    return injectCompaniesIntoInvokeFunctionRequest(withItems, companiesId)
  }

  return config
})

// Один общий запрос на все параллельные 401: иначе десяток висящих запросов
// дёрнет /v2/refresh десять раз, и каждый следующий пойдёт с уже отозванным
// refresh-токеном.
let refreshing: Promise<string | null> | null = null

const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = loadSession()?.refreshToken
      if (!refreshToken) return null
      try {
        const token = await refreshTokens(refreshToken)
        updateSessionTokens(token.access_token, token.refresh_token)
        return token.access_token
      } catch {
        return null
      }
    })().finally(() => {
      refreshing = null
    })
  }

  return refreshing
}

adminRequest.interceptors.response.use(
  (response) => response?.data?.data?.data ?? response?.data?.data ?? response?.data,
  async (error: AxiosError) => {
    // A 401 on an authenticated request means the access token is dead. Access
    // lives a day, the session 30 — сначала пробуем обновить токен и повторить
    // запрос, и только если обновить нечем или не вышло — разлогиниваем.
    // Only act when we actually had a Bearer token (API-KEY calls can 401 for
    // unrelated reasons and must not bounce an anonymous user).
    if (error.response?.status === 401 && localStorage.getItem('auth_token')) {
      const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined

      // Пачка запросов приходит волнами, а не одновременно: общего in-flight
      // мало, каждая следующая волна дёргала бы /v2/refresh заново. Если токен
      // в хранилище уже не тот, с которым запрос ушёл, — его обновил сосед по
      // пачке, просто повторяем с актуальным.
      const current = localStorage.getItem('auth_token')
      const refreshedByNeighbour =
        Boolean(current) && config?.headers?.Authorization !== `Bearer ${current}`

      if (config && !config._retried && (refreshedByNeighbour || (await refreshAccessToken()))) {
        config._retried = true
        // Тело здесь уже сериализовано в строку, а request-интерцептор
        // дописывает companies_id только в объект — иначе payload потеряется.
        if (typeof config.data === 'string') {
          try {
            config.data = JSON.parse(config.data)
          } catch {
            // Не JSON (form-data и т.п.) — отправляем как есть.
          }
        }
        // Authorization подставит request-интерцептор из обновлённого localStorage.
        return adminRequest(config)
      }

      handleUnauthorized()
    }
    return Promise.reject(error)
  },
)

export default adminRequest
