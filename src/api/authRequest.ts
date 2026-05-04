import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

const AUTH_BASE_URL = 'https://api.auth.u-code.io'
const PROJECT_ID = '84f1983d-5095-490e-ba9c-d2618b164c99'
const ENVIRONMENT_ID = '2f73835f-3a29-46c8-951e-75119db9bfc0'
const API_KEY = 'P-JtJ1lICCMHmhp9JaoxhWh1ZAwoyzFtxw'

const authRequest = axios.create({
  baseURL: AUTH_BASE_URL,
  timeout: 100000,
  params: {
    'project-id': PROJECT_ID,
  },
  headers: {
    'Content-Type': 'application/json',
  },
})

authRequest.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.Authorization = 'API-KEY'
  config.headers['Environment-Id'] = ENVIRONMENT_ID
  config.headers['x-api-key'] = API_KEY

  return config
})

authRequest.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(error),
)

export default authRequest
