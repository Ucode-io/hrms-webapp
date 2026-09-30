// Какой смене принадлежит «сейчас» — то же правило, что у бэкенда, куда уходит
// сама отметка (udevs-hrms-hickvision, src/utils/shift-time.js, attributePunch):
// зона смены — от 4 часов до начала до 4 часов после конца, из пересекающихся
// зон — ближайшая смена. Разойтись с ним нельзя: кнопка сказала бы «Уход», а
// отметка легла бы приходом в другую смену.
//
// Без импортов из приложения: проверка (`shiftWindow.check.ts`) запускается
// голым node, а i18n тянет TSX.
//
// Все минуты — от полуночи ДАТЫ СМЕНЫ: у ночной 22:00–06:00 конец 1800.

export const WINDOW_BEFORE_MINUTES = 240
export const WINDOW_AFTER_MINUTES = 240
const DAY = 1440

export interface ShiftLike {
  date?: string
  start_time?: string | null
  end_time?: string | null
  hours_per_day?: number | string | null
}

export interface MarkLike {
  date?: string
  event_time?: string
}

/** «09:00», «9:00», «09:00:00» → минуты от полуночи, иначе null. */
export function clockMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? '').trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null
}

/** Номер дня от 1970-01-01 для «ГГГГ-ММ-ДД». Только календарь, без поясов. */
export function dayNumber(date: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''))
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000)
}

export function addDays(date: string, days: number): string {
  const base = dayNumber(date)
  if (base == null) return date
  return new Date((base + days) * 86_400_000).toISOString().slice(0, 10)
}

/** Границы смены; у смены «по часам» — её календарный день. */
export function shiftSpan(shift: ShiftLike): { timed: boolean; start: number; end: number } | null {
  const start = clockMinutes(shift.start_time)
  const end = clockMinutes(shift.end_time)
  if (start != null && end != null) return { timed: true, start, end: end <= start ? end + DAY : end }
  const hours = Number(shift.hours_per_day)
  return Number.isFinite(hours) && hours > 0 ? { timed: false, start: 0, end: DAY } : null
}

/** Зона смены: чьи отметки она забирает. */
export function shiftWindow(shift: ShiftLike): { from: number; to: number } | null {
  const span = shiftSpan(shift)
  if (!span) return null
  if (!span.timed) return { from: 0, to: DAY - 1 }
  return { from: span.start - WINDOW_BEFORE_MINUTES, to: span.end + WINDOW_AFTER_MINUTES }
}

/** Отметка `date` + `time` — в минутах смены, датированной `shiftDate`. */
export function minutesInShift(shiftDate: string | undefined, date: string | undefined, time: string | undefined): number | null {
  const clock = clockMinutes(time)
  const from = dayNumber(shiftDate)
  const on = dayNumber(date)
  if (clock == null || from == null || on == null) return null
  return (on - from) * DAY + clock
}

/**
 * Смена, в чью зону попадает момент `date` + `time`, или null — сейчас вне
 * всех смен. Из нескольких — ближайшая к самой смене; при равенстве — более
 * ранняя: момент между концом ночи и началом утра закрывает ночь, как уход.
 */
export function currentShift<T extends ShiftLike>(shifts: T[], date: string, time: string): T | null {
  let best: { shift: T; distance: number; order: number } | null = null
  for (const shift of shifts) {
    const span = shiftSpan(shift)
    const window = shiftWindow(shift)
    const minutes = minutesInShift(shift.date, date, time)
    const day = dayNumber(shift.date)
    if (!span || !window || minutes == null || day == null) continue
    if (minutes < window.from || minutes > window.to) continue
    const distance = minutes < span.start ? span.start - minutes : minutes > span.end ? minutes - span.end : 0
    const order = day * DAY + span.start
    if (!best || distance < best.distance || (distance === best.distance && order < best.order)) {
      best = { shift, distance, order }
    }
  }
  return best ? best.shift : null
}

/** Отметки, попавшие в зону смены, по порядку — от первой к последней. */
export function marksOfShift<M extends MarkLike>(shift: ShiftLike, marks: M[]): M[] {
  const window = shiftWindow(shift)
  if (!window) return []
  return marks
    .map((mark) => ({ mark, minutes: minutesInShift(shift.date, mark.date?.slice(0, 10), mark.event_time) }))
    .filter((item): item is { mark: M; minutes: number } =>
      item.minutes != null && item.minutes >= window.from && item.minutes <= window.to)
    .sort((a, b) => a.minutes - b.minutes)
    .map((item) => item.mark)
}
