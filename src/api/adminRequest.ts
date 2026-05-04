import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = 'https://api.admin.u-code.io/'
const DEFAULT_PROJECT_ID = '9a462573-ce11-4288-928a-a6ba754b6998'
const ENVIRONMENT_ID = '2f73835f-3a29-46c8-951e-75119db9bfc0'
const API_KEY = 'P-bta3QjePSLS84na33QXCvxUEv3vB4iMU'

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

adminRequest.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('auth_token')

  if (!config.headers['Environment-Id']) {
    config.headers['Environment-Id'] = ENVIRONMENT_ID
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    config.headers.Authorization = 'API-KEY'
    config.headers['X-Api-Key'] = API_KEY
  }

  return config
})

adminRequest.interceptors.response.use(
  (response) => response?.data?.data?.data ?? response?.data?.data ?? response?.data,
  (error: AxiosError) => Promise.reject(error),
)

export default adminRequest
