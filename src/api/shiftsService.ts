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
  /** Длительность без привязки к часам суток. Взаимоисключающа с парой времён. */
  hours_per_day?: number | string | null
  positions_id_data?: { title?: string } | null
  locations_id_data?: { title?: string } | null
  project?: string | null
  comment?: string | null
  [key: string]: unknown
}

/**
 * Вид смены — то же прочтение, что в админке: ночь выводится из времени,
 * удалёнка из локации, «выходной» — из отсутствия смены. Хранимого поля нет,
 * поэтому расходиться с гридом планировщика тут нечему.
 */
export type ShiftKind = 'day' | 'night' | 'remote' | 'off'

export const SHIFT_KIND_META: Record<ShiftKind, { label: string; color: string; soft: string }> = {
  day: { label: 'Дневная', color: '#2563eb', soft: '#eff6ff' },
  night: { label: 'Ночная', color: '#7c3aed', soft: '#f5f3ff' },
  remote: { label: 'Удалённо', color: '#0e7490', soft: '#ecfeff' },
  off: { label: 'Выходной', color: '#94a3b8', soft: '#f8fafc' },
}

/** Локация считается удалённой по названию — отдельного флага у `locations` нет. */
const REMOTE_LOCATION = /удал|remote|дом/i

export function shiftKind(shift: ShiftRecord): ShiftKind {
  if (isNightShift(shift)) return 'night'
  if (REMOTE_LOCATION.test(String(shift.locations_id_data?.title || ''))) return 'remote'
  return 'day'
}

/** Длительность смены, заданной объёмом («8 часов в день»), а не временем. */
export function shiftHoursPerDay(shift: ShiftRecord): number | null {
  const raw = Number(shift.hours_per_day)
  return Number.isFinite(raw) && raw > 0 ? raw : null
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
  if (start && end) return `${start}–${end}`
  // Смена может быть задана объёмом: тогда известно сколько, но не когда.
  const hours = shiftHoursPerDay(shift)
  return hours != null ? `${hours}ч/день` : '—'
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
