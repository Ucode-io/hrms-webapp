import authRequest from './authRequest'

export interface TokenData {
  access_token: string
  refresh_token: string
  created_at: string
  updated_at: string
  expires_at: string
  refresh_in_seconds: number
}

export interface UserData {
  guid?: string
  login?: string
  first_name?: string
  second_name?: string
  middle_name?: string
  phone?: string
  work_phone?: string
  email?: string
  role_id?: string
  client_type_id?: string
  user_id_auth?: string
  companies_id?: string | null
  avatar?: string
  photo?: string
  [key: string]: unknown
}

export interface LoginResponseData {
  token: TokenData
  user_data: UserData
  companies_id?: string | null
}

interface LoginResponse {
  status: string
  description: string
  data: LoginResponseData
}

interface RefreshResponse {
  status: string
  description: string
  data: { token: TokenData }
}

export const loginWithPassword = async (
  username: string,
  password: string,
): Promise<LoginResponseData> => {
  const response = await authRequest.post<LoginResponse>('/v2/login/with-option', {
    login_strategy: 'LOGIN_PWD',
    data: {
      client_type_id: '1c435896-2f12-4b61-a684-62ad1d2307d1',
      role_id: '52e5168d-660b-4339-9ec4-9c02ae226345',
      username,
      password,
    },
  })

  return response.data.data
}

// Access-токен живёт сутки, сессия в auth-сервисе — 30 дней. Эндпоинт открыт
// (до LoginMiddleware), тело — только refresh_token: role_id/client_type_id
// сервис берёт из самой сессии. В ответе приходят одни токены, данные
// пользователя остаются прежними.
export const refreshTokens = async (refreshToken: string): Promise<TokenData> => {
  const response = await authRequest.put<RefreshResponse>('/v2/refresh', {
    refresh_token: refreshToken,
  })

  return response.data.data.token
}
