import { formatDateLocal } from '../i18n'
import adminRequest, { getCompaniesId } from './adminRequest'
import { DEFAULT_TIME_ZONE } from './regionService'

const ATTENDANCE_COLLECTION = 'attendance'
// Сырой поток событий прохода: сюда же пишет интеграция с турникетами.
// Запись именно через объектное API — на ней висит custom_event AFTER CREATE,
// который апсертит день в `attendance` и шлёт карточку в Telegram.
const ATTENDANCE_RECORDS_COLLECTION = 'attendance_records'
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

/** Строка потока событий: одна отметка, а не сводка дня. */
export interface AttendanceMark {
  guid: string
  date?: string
  event_time?: string
  action?: string[] | string
  created_at?: string
  [key: string]: unknown
}

/** Ключ сортировки отметок: время события, а при его отсутствии — момент записи. */
function markOrder(mark: AttendanceMark): string {
  return String(mark.event_time || '') || String(mark.created_at || '')
}

/** 'IN' | 'OUT' из MULTISELECT-поля, где лежит либо массив, либо строка. */
export function readMarkAction(mark: AttendanceMark): MarkAction | '' {
  const raw = Array.isArray(mark.action) ? mark.action[0] : mark.action
  const value = String(raw || '').toUpperCase()
  return value === 'IN' || value === 'OUT' ? value : ''
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
  return formatDateLocal(parsed, { day: '2-digit', month: '2-digit', year: 'numeric' })
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

export interface LatenessResult {
  delay_time: string
  action_status: Exclude<AttendanceActionStatus, 'unknown'>
  /** null — графика на этот день нет, порогом стали дефолтные 09:00. */
  work_start_minutes: number | null
}

/**
 * Опоздание и статус считает сервер — тем же расчётом, что применяется к
 * проходу через турникет (`compute_lateness` в udevs-hrms-hickvision).
 *
 * Местной копии здесь нет намеренно: она вычитала бы жёсткие 09:00, а
 * опоздание меряется от начала рабочего дня ЭТОГО сотрудника (ADR-0005,
 * Lateness в CONTEXT.md). `companies_id` дописывает интерцептор adminRequest.
 */
export async function computeLateness(
  userBaseId: string,
  date: string,
  checkInTime: string,
): Promise<LatenessResult> {
  const normalized = normalizeTime(checkInTime)
  // Нет прихода — считать нечего, и сервер на этот случай отвечает константой.
  // Гейт здесь, а не у вызывающих: недоступный шлюз не должен мешать сохранить
  // запись, в которой расчёт не участвует.
  if (!normalized) {
    return { delay_time: '00:00', action_status: 'absent', work_start_minutes: null }
  }

  const res = await adminRequest.post('/v2/invoke_function/udevs-hrms-hickvision', {
    data: {
      method: 'compute_lateness',
      data: { user_base_id: userBaseId, date, check_in_time: normalized },
    },
  })

  const payload = (res && typeof res === 'object' ? res : {}) as Record<string, unknown>
  const result = (payload.result ?? payload) as Partial<LatenessResult>
  if (typeof result?.delay_time !== 'string' || typeof result?.action_status !== 'string') {
    throw new Error('Unexpected response format for compute_lateness')
  }

  return result as LatenessResult
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
 * Пояс — настенные часы сотрудника: зона региона его филиала, а без филиала —
 * зона компании (ADR-0005, `regionService`). Одной общей зоны здесь больше
 * нет: именно она объявляла опоздавшим москвича, пришедшего в девять.
 *
 * Аргументами принимает момент и зону, а не зовёт `new Date()` внутри: так
 * полночь и чужой пояс проверяются подстановкой.
 */
export function buildMarkTimes(now: Date, timeZone: string = DEFAULT_TIME_ZONE): MarkTimes {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
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
  /**
   * Сырые отметки за один день, свежие сверху.
   *
   * Агрегат `attendance` для чередования не годится: там всего две колонки, и
   * второй приход за день в них уже не виден. Чтобы понимать, что человек
   * нажмёт следующим, нужен сам поток событий — в нём и турникет, и webapp.
   */
  getMarksForDate: async (userBaseId: string, date: string): Promise<AttendanceMark[]> => {
    if (!userBaseId || !date) return []

    const res = await adminRequest.get(`/v2/items/${ATTENDANCE_RECORDS_COLLECTION}`, {
      params: {
        data: encodeData({
          user_base_id: userBaseId,
          // Диапазон из одного дня, а не равенство: так же это поле фильтрует
          // админка, и на DATE-колонке это единственный проверенный способ.
          date: { $gte: date, $lte: date },
          with_relations: true,
          limit: 200,
          offset: 0,
        }),
      },
    })

    return extractList<AttendanceMark>(res).sort((a, b) =>
      markOrder(b).localeCompare(markOrder(a)))
  },

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
    const lateness = await computeLateness(userBaseId, date, normalizedCheckIn)

    return adminRequest.post(`/v2/items/${ATTENDANCE_COLLECTION}`, {
      data: {
        user_base_id: userBaseId,
        companies_id: companyId || getCompaniesId(),
        date,
        ...(normalizedCheckIn ? { check_in_time: normalizedCheckIn } : {}),
        ...(normalizedCheckOut ? { check_out_time: normalizedCheckOut } : {}),
        delay_time: lateness.delay_time,
        status: ['requested'],
        action_status: [lateness.action_status],
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
    timeZone,
    now = new Date(),
  }: {
    userBaseId: string
    companyId?: string
    action: MarkAction
    picture?: string
    location?: string
    /** Зона региона филиала сотрудника; без неё — запасной циферблат. */
    timeZone?: string
    now?: Date
  }): Promise<unknown> => {
    return adminRequest.post(`/v2/items/${ATTENDANCE_RECORDS_COLLECTION}`, {
      data: {
        user_base_id: userBaseId,
        companies_id: companyId || getCompaniesId(),
        ...buildMarkTimes(now, timeZone),
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

