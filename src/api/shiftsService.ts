// Свои смены сотрудника — только чтение.
//
// Открытые смены (без user_base_id) сюда не попадают и попасть не должны:
// незакрытая потребность — инструмент планировщика, а не объявление для всех.
// Фильтр по своему user_base_id это обеспечивает сам по себе.
//
// Человек, числящийся в двух компаниях, — это две записи user_base, и mini app
// авторизован под одной из них. Поэтому отдельной развязки по компаниям здесь
// нет: свой guid уже означает свою компанию.

import adminRequest from './adminRequest'

const SHIFT_COLLECTION = 'shift'

export interface ShiftRecord {
  guid: string
  user_base_id?: string | null
  date?: string
  start_time?: string | null
  end_time?: string | null
  positions_id_data?: { title?: string } | null
  locations_id_data?: { title?: string } | null
  project?: string | null
  comment?: string | null
  [key: string]: unknown
}

function encodeData(data: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(data))
}

function extractList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const obj = res && typeof res === 'object' ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})/

/** `HH:MM:SS` из ucode → `HH:MM`. Мусор превращается в пустую строку. */
export function normalizeShiftTime(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) return ''
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return ''
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Смена переходит через полночь — конец не позже начала. */
export function isNightShift(shift: ShiftRecord): boolean {
  const start = normalizeShiftTime(shift.start_time)
  const end = normalizeShiftTime(shift.end_time)
  if (!start || !end) return false
  return end <= start
}

export function formatShiftRange(shift: ShiftRecord): string {
  const start = normalizeShiftTime(shift.start_time)
  const end = normalizeShiftTime(shift.end_time)
  if (!start || !end) return '—'
  return `${start}–${end}`
}

const shiftsService = {
  /** Смены сотрудника за диапазон дат — тем же `$gte`/`$lte`, что в админке. */
  getMine: async (
    userBaseId: string,
    range: { from: string; to: string }
  ): Promise<ShiftRecord[]> => {
    if (!userBaseId || !range.from || !range.to) return []

    const res = await adminRequest.get(`/v2/items/${SHIFT_COLLECTION}`, {
      params: {
        data: encodeData({
          user_base_id: userBaseId,
          date: { $gte: range.from, $lte: range.to },
          with_relations: true,
          limit: 200,
          offset: 0,
        }),
      },
    })

    return extractList<ShiftRecord>(res).sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || ''))
    )
  },
}

export default shiftsService
