import type { LoginResponseData, UserData } from '../api/authService'

const PERSIST_KEY = 'ayva-auth'
const AUTH_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

export interface AuthSession {
  isAuth: boolean
  token: string
  refreshToken: string | null
  companyId: string | null
  user: UserData
  user_data: UserData
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeCompanyId = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null

export const persistSession = (authData: LoginResponseData): AuthSession => {
  const token = authData.token.access_token
  const refreshToken = authData.token.refresh_token || null
  const companyId =
    normalizeCompanyId(authData.companies_id) || normalizeCompanyId(authData.user_data?.companies_id)
  const normalizedUserData: UserData = companyId
    ? { ...authData.user_data, companies_id: companyId }
    : authData.user_data

  const session: AuthSession = {
    isAuth: true,
    token,
    refreshToken,
    companyId,
    user: normalizedUserData,
    user_data: normalizedUserData,
  }

  localStorage.setItem(PERSIST_KEY, JSON.stringify(session))
  localStorage.setItem(AUTH_TOKEN_KEY, token)

  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }

  return session
}

export const loadSession = (): AuthSession | null => {
  const raw = localStorage.getItem(PERSIST_KEY)
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed) && typeof parsed.token === 'string' && parsed.token.length > 0) {
        return {
          isAuth: true,
          token: parsed.token,
          refreshToken:
            typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
          companyId: normalizeCompanyId(parsed.companyId),
          user: isRecord(parsed.user) ? (parsed.user as UserData) : {},
          user_data: isRecord(parsed.user_data)
            ? (parsed.user_data as UserData)
            : isRecord(parsed.user)
              ? (parsed.user as UserData)
              : {},
        }
      }
    } catch {
      localStorage.removeItem(PERSIST_KEY)
    }
  }

  const fallbackToken = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!fallbackToken) {
    return null
  }

  const fallbackRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)

  return {
    isAuth: true,
    token: fallbackToken,
    refreshToken: fallbackRefresh,
    companyId: null,
    user: {},
    user_data: {},
  }
}

export const clearSession = (): void => {
  localStorage.removeItem(PERSIST_KEY)
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
