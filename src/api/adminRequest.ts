import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { handleUnauthorized } from './unauthorizedHandler'

const API_BASE_URL = 'https://api.admin.u-code.io/'
const DEFAULT_PROJECT_ID = '9a462573-ce11-4288-928a-a6ba754b6998'
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

const getCompaniesIdFromStorage = (): string | null => {
  const persistedSession = parseStoredRecord(localStorage.getItem(AUTH_PERSIST_KEY))
  const persistedUserProfile = parseStoredRecord(localStorage.getItem(USER_PROFILE_KEY))

  return (
    normalizeCompanyId(persistedSession?.companyId) ||
    normalizeCompanyId(persistedSession?.user_data && (persistedSession.user_data as Record<string, unknown>).companies_id) ||
    normalizeCompanyId(persistedSession?.user && (persistedSession.user as Record<string, unknown>).companies_id) ||
    normalizeCompanyId(persistedUserProfile?.companies_id)
  )
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

  const requestBody: Record<string, unknown> = isRecord(config.data) ? { ...config.data } : {}
  const gatewayPayload: Record<string, unknown> = isRecord(requestBody.data) ? { ...requestBody.data } : {}

  gatewayPayload.companies_id = companiesId

  if (isRecord(gatewayPayload.data)) {
    gatewayPayload.data = withCompaniesId(gatewayPayload.data, companiesId)
  } else if (Array.isArray(gatewayPayload.data)) {
    gatewayPayload.data = gatewayPayload.data.map((item) =>
      isRecord(item) ? withCompaniesId(item, companiesId) : item,
    )
  } else {
    gatewayPayload.data = { companies_id: companiesId }
  }

  requestBody.companies_id = companiesId
  requestBody.data = gatewayPayload
  config.data = requestBody
  return config
}

adminRequest.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('auth_token')
  const companiesId = getCompaniesIdFromStorage()

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

adminRequest.interceptors.response.use(
  (response) => response?.data?.data?.data ?? response?.data?.data ?? response?.data,
  (error: AxiosError) => {
    // A 401 on an authenticated request means the token is dead — force logout.
    // Only act when we actually had a Bearer token (API-KEY calls can 401 for
    // unrelated reasons and must not bounce an anonymous user).
    if (error.response?.status === 401 && localStorage.getItem('auth_token')) {
      handleUnauthorized()
    }
    return Promise.reject(error)
  },
)

export default adminRequest
