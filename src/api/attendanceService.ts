import adminRequest, { getCompaniesId } from './adminRequest'

const ATTENDANCE_COLLECTION = 'attendance'
// Сырой поток событий прохода: сюда же пишет интеграция с турникетами.
// Запись именно через объектное API — на ней висит custom_event AFTER CREATE,
// который апсертит день в `attendance` и шлёт карточку в Telegram.
const ATTENDANCE_RECORDS_COLLECTION = 'attendance_records'
const COMPANY_TIME_ZONE = 'Asia/Tashkent'
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export type AttendanceWorkflowStatus = 'accepted' | 'rejected' | 'requested' | 'unknown'
export type AttendanceActionStatus = 'present' | 'absent' | 'late' | 'unknown'

export interface AttendanceRecord {
  guid: string
  user_base_id?: string
  companies_id?: string
  date?: string
  check_in_time?: string
  check_out_time?: string
  delay_time?: string
  status?: string[] | string
  action_status?: string[] | string
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

export function normalizeTime(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return TIME_PATTERN.test(trimmed) ? trimmed : ''
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function formatDateRu(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value || '—'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function normalizeWorkflowStatus(value: unknown): AttendanceWorkflowStatus {
  const raw = Array.isArray(value) ? value[0] : value
  const normalized = String(raw || '').trim().toLowerCase()
  if (normalized === 'accepted') return 'accepted'
  if (normalized === 'requested') return 'requested'
  if (normalized === 'rejected') return 'rejected'
  return 'unknown'
}

export function normalizeActionStatus(value: unknown): AttendanceActionStatus {
  const raw = Array.isArray(value) ? value[0] : value
  const normalized = String(raw || '').trim().toLowerCase()
  if (normalized === 'present') return 'present'
  if (normalized === 'late') return 'late'
  if (normalized === 'absent') return 'absent'
  return 'unknown'
}

function parseTimeToMinutes(value: string): number | null {
  const normalized = normalizeTime(value)
  if (!normalized) return null
  const [hours, minutes] = normalized.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function toDelayString(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes))
  const hh = String(Math.floor(safe / 60)).padStart(2, '0')
  const mm = String(safe % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export function computeDelayTimeFromCheckIn(checkInTime: string): string {
  const checkInMinutes = parseTimeToMinutes(checkInTime)
  if (checkInMinutes == null) return '00:00'
  const lateMinutes = Math.max(0, checkInMinutes - 9 * 60)
  return toDelayString(lateMinutes)
}

export function resolveActionStatusFromCheckIn(checkInTime: string): Exclude<AttendanceActionStatus, 'unknown'> {
  const normalized = normalizeTime(checkInTime)
  if (!normalized) return 'absent'
  return computeDelayTimeFromCheckIn(normalized) === '00:00' ? 'present' : 'late'
}

export type MarkAction = 'IN' | 'OUT'

export interface MarkTimes {
  date: string
  event_time: string
  action_time: string
}

/**
 * Три поля времени события из одного среза.
 *
 * Часы берём с устройства, а пояс — нет: у человека с телефоном в московском
 * поясе 09:02 превратились бы в 08:02, и опоздание молча исчезло. По той же
 * причине дату берём отсюда же, а не из `toIsoDate` — около полуночи они
 * разъезжаются на сутки.
 *
 * Аргументом принимает момент, а не зовёт `new Date()` внутри: так полночь и
 * чужой пояс проверяются подстановкой.
 */
export function buildMarkTimes(now: Date): MarkTimes {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: COMPANY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})

  const { year, month, day, hour, minute, second } = parts

  return {
    date: `${year}-${month}-${day}`,
    event_time: `${hour}:${minute}:${second}`,
    // Формат ровно как у турникетных строк, иначе колонка в админке станет разнобоем.
    action_time: `${day}.${month}.${year} ${hour}:${minute}`,
  }
}

export const attendanceService = {
  getByEmployee: async (userBaseId: string): Promise<AttendanceRecord[]> => {
    if (!userBaseId) return []

    const limit = 200
    let offset = 0
    const all: AttendanceRecord[] = []

    for (let i = 0; i < 20; i += 1) {
      const res = await adminRequest.get(`/v2/items/${ATTENDANCE_COLLECTION}`, {
        params: {
          data: encodeData({
            user_base_id: userBaseId,
            with_relations: true,
            limit,
            offset,
          }),
        },
      })

      const chunk = extractList<AttendanceRecord>(res)
      if (chunk.length === 0) break
      all.push(...chunk)
      offset += chunk.length
      if (chunk.length < limit) break
    }

    return all.sort((a, b) => {
      const aDate = Date.parse(String(a.created_at || ''))
      const bDate = Date.parse(String(b.created_at || ''))
      return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate)
    })
  },

  create: async ({
    userBaseId,
    companyId,
    date,
    checkInTime,
    checkOutTime,
  }: {
    userBaseId: string
    companyId?: string
    date: string
    checkInTime: string
    checkOutTime: string
  }): Promise<unknown> => {
    const normalizedCheckIn = normalizeTime(checkInTime)
    const normalizedCheckOut = normalizeTime(checkOutTime)
    const delay = computeDelayTimeFromCheckIn(normalizedCheckIn)
    const actionStatus = resolveActionStatusFromCheckIn(normalizedCheckIn)

    return adminRequest.post(`/v2/items/${ATTENDANCE_COLLECTION}`, {
      data: {
        user_base_id: userBaseId,
        companies_id: companyId || getCompaniesId(),
        date,
        ...(normalizedCheckIn ? { check_in_time: normalizedCheckIn } : {}),
        ...(normalizedCheckOut ? { check_out_time: normalizedCheckOut } : {}),
        delay_time: delay,
        status: ['requested'],
        action_status: [actionStatus],
      },
    })
  },

  /**
   * Отметка «я сейчас пришёл/ушёл» из webapp — событие того же веса, что проход
   * через турникет, без согласования. Дальше всё делает триггер AFTER CREATE.
   *
   * `hikvision_id` не заполняем: терминала у такого события нет.
   */
  createMark: async ({
    userBaseId,
    companyId,
    action,
    picture,
    location,
    now = new Date(),
  }: {
    userBaseId: string
    companyId?: string
    action: MarkAction
    picture?: string
    location?: string
    now?: Date
  }): Promise<unknown> => {
    return adminRequest.post(`/v2/items/${ATTENDANCE_RECORDS_COLLECTION}`, {
      data: {
        user_base_id: userBaseId,
        companies_id: companyId || getCompaniesId(),
        ...buildMarkTimes(now),
        action: [action],
        source: 'webapp',
        ...(picture ? { picture } : {}),
        // Ключ `map`, а не `location`: ucode умеет показывать это поле на карте,
        // и координаты становятся кликабельными прямо в его интерфейсе.
        ...(location ? { map: location } : {}),
      },
    })
  },
}

