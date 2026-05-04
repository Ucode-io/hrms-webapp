import adminRequest from './adminRequest'
import type { UserData } from './authService'

const NEWS_COLLECTION = 'news'
const FEED_PAGE_SIZE = 6

export interface NewsItem {
  guid: string
  title: string
  text: string
  photo: string
  published_at: string
  is_active: boolean
}

interface NewsListResponse {
  count: number
  response: NewsItem[]
}

const encodeJsonToUrlParam = (json: unknown): string => {
  if (!json) return '{}'
  return encodeURIComponent(JSON.stringify(json))
}

const toStringValue = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const toBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return fallback
}

const normalizeNewsItem = (raw: unknown): NewsItem => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const guid = toStringValue(source.guid || source.id)

  return {
    guid,
    title: toStringValue(source.title).trim() || 'Без заголовка',
    text:
      toStringValue(source.text).trim() ||
      toStringValue(source.description).trim() ||
      toStringValue(source.content).trim(),
    photo:
      toStringValue(source.photo).trim() ||
      toStringValue(source.image).trim() ||
      toStringValue(source.cover).trim(),
    published_at:
      toStringValue(source.published_at).trim() ||
      toStringValue(source.created_at).trim(),
    is_active: toBoolean(source.is_active, true),
  }
}

const normalizeNewsList = (raw: unknown): NewsListResponse => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const rawItems = Array.isArray(source.response)
    ? source.response
    : Array.isArray(raw)
      ? raw
      : []

  const response = rawItems
    .map(normalizeNewsItem)
    .filter((item) => item.guid)
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at))

  return {
    count: typeof source.count === 'number' ? source.count : response.length,
    response,
  }
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

const normalizeUserBaseData = (raw: unknown): UserData | null => {
  const root = toRecord(raw)
  if (!root) return null

  const candidates = [
    root,
    toRecord(root.response),
    toRecord(root.data),
    toRecord(toRecord(root.data)?.response),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (typeof candidate.guid === 'string' || typeof candidate.login === 'string') {
      return candidate as UserData
    }
  }

  return null
}

export const getNewsFeed = async (): Promise<NewsItem[]> => {
  const payload = {
    limit: FEED_PAGE_SIZE,
    offset: 0,
    is_active: true,
  }

  const response = await adminRequest.get(`/v2/items/${NEWS_COLLECTION}`, {
    params: { data: encodeJsonToUrlParam(payload) },
  })

  return normalizeNewsList(response).response
}

export const getUserBaseByGuid = async (guid: string): Promise<UserData | null> => {
  if (!guid) return null

  const response = await adminRequest.get(`/v2/items/user_base/${guid}`, {
    params: { with_relations: true },
  })

  return normalizeUserBaseData(response)
}

export const updateUserBase = async (guid: string, data: Partial<UserData>): Promise<UserData | null> => {
  if (!guid) return null

  const response = await adminRequest.put(`/v2/items/user_base/${guid}`, {
    data,
  })

  return normalizeUserBaseData(response)
}

export const uploadFile = async (file: File): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)

  const extension = file.name.split('.').pop() || 'png'

  const response = await adminRequest.post('/v1/files/folder_upload', formData, {
    params: {
      folder_name: 'Media',
      format: extension,
    },
    headers: {
      'Content-Type': 'multipart/form-data',
      'Environment-Id': '75643e1b-4557-4626-a754-ffe7a86f4008',
    },
  })
  
  // The backend might return { filename: string } or { url: string }, or just a string URL
  if (typeof response === 'string') return response
  const rec = response as unknown as Record<string, unknown>
  if (typeof rec?.link === 'string') return `https://cdn.u-code.io/${rec.link}`
  if (typeof rec?.filename === 'string') return `https://cdn.u-code.io/${rec.filename}`
  if (typeof rec?.url === 'string') return rec.url
  if (typeof rec?.file_name === 'string') return `https://cdn.u-code.io/${rec.file_name}`
  return ''
}
