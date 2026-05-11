import { useQuery } from '@tanstack/react-query'
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

type DashboardAgendaParams = {
  userBaseId: string
  dateFrom: string
  dateTo: string
}

type AggregationResponseRow = Record<string, unknown>

interface DashboardHolidayAggregationRow extends AggregationResponseRow {
  holiday_guid?: string
  holiday_title?: string
  holiday_date?: string
  holiday_policy_guid?: string
  holiday_policy_title?: string
  is_working_holiday?: boolean
  is_weekend_transfer?: boolean
  is_workday_transfer?: boolean
}

export interface DashboardHolidayEvent {
  guid: string
  title: string
  date: string
  holidayPolicyGuid: string
  holidayPolicyTitle: string
  isWorkingHoliday: boolean
  isWeekendTransfer: boolean
  isWorkdayTransfer: boolean
}

export type UpcomingEventType = 'holiday' | 'working_holiday' | 'weekend'

export interface UpcomingEventItem {
  id: string
  date: string
  title: string
  type: UpcomingEventType
}

const encodeJsonToUrlParam = (json: unknown): string => {
  if (!json) return '{}'
  return encodeURIComponent(JSON.stringify(json))
}

const toStringValue = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const escapeSqlValue = (value: string): string => value.replace(/'/g, "''")

const extractRows = <T>(res: unknown): T[] => {
  if (Array.isArray(res)) return res as T[]

  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  const directRows = Array.isArray(obj.response)
    ? obj.response
    : Array.isArray(obj.data)
      ? obj.data
      : []

  return Array.isArray(directRows) ? (directRows as T[]) : []
}

const extractDatePart = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  const matched = trimmed.match(/\d{4}-\d{2}-\d{2}/)
  return matched ? matched[0] : ''
}

const toIsoDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseIsoDate = (iso: string): Date | null => {
  if (!iso) return null
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

const isWeekendDay = (value: Date): boolean => {
  const day = value.getDay()
  return day === 0 || day === 6
}

const buildWeekendEvents = (dateFrom: string, dateTo: string): UpcomingEventItem[] => {
  const start = parseIsoDate(dateFrom)
  const end = parseIsoDate(dateTo)

  if (!start || !end || start > end) return []

  const list: UpcomingEventItem[] = []
  const cursor = new Date(start.getTime())

  while (cursor <= end) {
    if (isWeekendDay(cursor)) {
      const iso = toIsoDate(cursor)
      const day = cursor.getDay()
      list.push({
        id: `weekend-${iso}`,
        date: iso,
        title: day === 6 ? 'Суббота' : 'Воскресенье',
        type: 'weekend',
      })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return list
}

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

export const getAgendaHolidays = async ({
  userBaseId,
  dateFrom,
  dateTo,
}: DashboardAgendaParams): Promise<DashboardHolidayEvent[]> => {
  const normalizedUserBaseId = userBaseId.trim()
  const normalizedDateFrom = dateFrom.trim()
  const normalizedDateTo = dateTo.trim()

  if (!normalizedUserBaseId || !normalizedDateFrom || !normalizedDateTo) {
    return []
  }

  const where = [
    `ub.guid = '${escapeSqlValue(normalizedUserBaseId)}'`,
    `hpd.date >= '${escapeSqlValue(normalizedDateFrom)}'`,
    `hpd.date <= '${escapeSqlValue(normalizedDateTo)}'`,
  ].join(' AND ')

  const res = await adminRequest.post('/v2/items/holiday_policy_days/aggregation', {
    data: {
      operation: 'SELECT',
      table:
        'holiday_policy_days hpd LEFT JOIN holiday_policies hp ON hp.guid = hpd.holiday_policies_id LEFT JOIN locations l ON l.holiday_policies_id = hp.guid LEFT JOIN user_base ub ON ub.locations_id = l.guid',
      columns: [
        'hpd.guid AS holiday_guid',
        'hpd.title AS holiday_title',
        'hpd.date AS holiday_date',
        'hpd.is_working_holiday AS is_working_holiday',
        'hpd.is_weekend_transfer AS is_weekend_transfer',
        'hpd.is_workday_transfer AS is_workday_transfer',
        'hp.guid AS holiday_policy_guid',
        'hp.title AS holiday_policy_title',
      ],
      where,
      order_by: ['hpd.date ASC', 'hpd.created_at ASC'],
      limit: 500,
      offset: 0,
    },
    is_cached: true,
  })

  const rows = extractRows<DashboardHolidayAggregationRow>(res)
  const unique = new Map<string, DashboardHolidayEvent>()

  for (const row of rows) {
    const date = extractDatePart(row.holiday_date)
    const title = typeof row.holiday_title === 'string' ? row.holiday_title.trim() : ''
    const guid = typeof row.holiday_guid === 'string' ? row.holiday_guid : ''

    if (!date || !title) continue

    const key = guid || `${date}-${title}`
    if (unique.has(key)) continue

    unique.set(key, {
      guid: guid || key,
      title,
      date,
      holidayPolicyGuid:
        typeof row.holiday_policy_guid === 'string' ? row.holiday_policy_guid : '',
      holidayPolicyTitle:
        typeof row.holiday_policy_title === 'string' ? row.holiday_policy_title : '',
      isWorkingHoliday: toBoolean(row.is_working_holiday),
      isWeekendTransfer: toBoolean(row.is_weekend_transfer),
      isWorkdayTransfer: toBoolean(row.is_workday_transfer),
    })
  }

  return Array.from(unique.values()).sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title, 'ru')
    return a.date.localeCompare(b.date)
  })
}

export const getUpcomingEvents = async ({
  userBaseId,
  dateFrom,
  dateTo,
}: DashboardAgendaParams): Promise<UpcomingEventItem[]> => {
  const [holidays, weekends] = await Promise.all([
    getAgendaHolidays({ userBaseId, dateFrom, dateTo }),
    Promise.resolve(buildWeekendEvents(dateFrom, dateTo)),
  ])

  const holidayItems: UpcomingEventItem[] = holidays.map((item) => ({
    id: `holiday-${item.guid}`,
    date: item.date,
    title: item.title,
    type: item.isWorkingHoliday ? 'working_holiday' : 'holiday',
  }))

  const unique = new Map<string, UpcomingEventItem>()

  for (const event of [...holidayItems, ...weekends]) {
    const key = `${event.date}-${event.type}-${event.title}`
    if (!unique.has(key)) unique.set(key, event)
  }

  return Array.from(unique.values()).sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title, 'ru')
    return a.date.localeCompare(b.date)
  })
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

export const useUpcomingEventsQuery = ({
  params,
  querySettings = {},
}: {
  params: DashboardAgendaParams
  querySettings?: Record<string, unknown>
}) =>
  useQuery({
    queryKey: ['dashboard-upcoming-events', params.userBaseId, params.dateFrom, params.dateTo],
    queryFn: () => getUpcomingEvents(params),
    enabled: Boolean(params.dateFrom && params.dateTo),
    ...querySettings,
  })
