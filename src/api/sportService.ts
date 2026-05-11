import adminRequest from './adminRequest'

const SPORT_ATTENDANCE_COLLECTION = 'sport_attendance'
const DEFAULT_COMPANY_GUID = '0de6b2b6-0777-4184-a620-aca70c294111'

export interface SportAttendanceRecord {
  guid: string
  user_base_id?: string
  companies_id?: string
  time: string
  video: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function encodeData(data: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(data))
}

function extractList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

function toIsoDateTime(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const composed = new Date(
    Number.isFinite(y) ? y : 1970,
    Number.isFinite(m) ? m - 1 : 0,
    Number.isFinite(d) ? d : 1,
    Number.isFinite(hh) ? hh : 0,
    Number.isFinite(mm) ? mm : 0,
    0,
    0,
  )
  return composed.toISOString()
}

export function getDefaultSportDateTime(): { date: string; time: string } {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

export function splitSportDateTime(value: string): { date: string; time: string } {
  if (!value) return getDefaultSportDateTime()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return getDefaultSportDateTime()

  return {
    date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
    time: `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`,
  }
}

export function formatSportDate(value: string): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatSportTime(value: string): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export const sportService = {
  getByEmployee: async (userBaseId: string): Promise<SportAttendanceRecord[]> => {
    if (!userBaseId) return []

    const limit = 200
    let offset = 0
    const all: SportAttendanceRecord[] = []

    for (let i = 0; i < 20; i += 1) {
      const res = await adminRequest.get(`/v2/items/${SPORT_ATTENDANCE_COLLECTION}`, {
        params: {
          data: encodeData({
            user_base_id: userBaseId,
            with_relations: true,
            limit,
            offset,
          }),
        },
      })

      const chunk = extractList<SportAttendanceRecord>(res)
      if (chunk.length === 0) break
      all.push(...chunk)
      offset += chunk.length
      if (chunk.length < limit) break
    }

    return all.sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''))
  },

  create: async ({
    userBaseId,
    companyId,
    date,
    time,
    video,
  }: {
    userBaseId: string
    companyId?: string
    date: string
    time: string
    video: string
  }): Promise<unknown> =>
    adminRequest.post(`/v2/items/${SPORT_ATTENDANCE_COLLECTION}`, {
      data: {
        user_base_id: userBaseId,
        companies_id: companyId || DEFAULT_COMPANY_GUID,
        time: toIsoDateTime(date, time),
        video,
      },
    }),

  update: async ({
    guid,
    userBaseId,
    companyId,
    date,
    time,
    video,
  }: {
    guid: string
    userBaseId: string
    companyId?: string
    date: string
    time: string
    video: string
  }): Promise<unknown> =>
    adminRequest.put(`/v2/items/${SPORT_ATTENDANCE_COLLECTION}/${guid}`, {
      data: {
        user_base_id: userBaseId,
        companies_id: companyId || DEFAULT_COMPANY_GUID,
        time: toIsoDateTime(date, time),
        video,
      },
    }),

  remove: async (guid: string): Promise<unknown> =>
    adminRequest.delete(`/v2/items/${SPORT_ATTENDANCE_COLLECTION}/${guid}`),
}
