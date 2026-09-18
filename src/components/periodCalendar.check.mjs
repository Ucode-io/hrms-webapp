// Проверка календарной арифметики: `node src/components/periodCalendar.check.mjs`.
// Ломается она молча: сетка нарисуется всегда, просто не теми днями — а список
// под ней отфильтруется не по тому диапазону. Ловим границы месяца/недели,
// начало недели с понедельника и переходы через границу года.
//
// Логика продублирована из PeriodCalendar.tsx: тянуть .tsx в node без сборки
// нечем, а функции тут чистые и короткие.
import assert from 'node:assert/strict'

const toIsoDate = (value) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate())

const addDays = (value, days) => {
  const next = startOfDay(value)
  next.setDate(next.getDate() + days)
  return next
}

const startOfWeek = (value) => addDays(value, -((value.getDay() + 6) % 7))

const getViewRange = (cursor, view) => {
  if (view === 'day') {
    const iso = toIsoDate(cursor)
    return { from: iso, to: iso }
  }
  if (view === 'week') {
    const first = startOfWeek(cursor)
    return { from: toIsoDate(first), to: toIsoDate(addDays(first, 6)) }
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  return { from: toIsoDate(first), to: toIsoDate(last) }
}

const moveCursor = (cursor, view, direction) => {
  if (view === 'day') return addDays(cursor, direction)
  if (view === 'week') return addDays(cursor, 7 * direction)
  return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
}

const leadingPad = (cursor) =>
  (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7

/* ── Месяц ─────────────────────────────────────────────────────────────── */
assert.deepEqual(
  getViewRange(new Date(2026, 8, 11), 'month'),
  { from: '2026-09-01', to: '2026-09-30' },
  'месяц из 30 дней',
)
// Февраль високосного года — классическое место, где range уезжает на день.
assert.deepEqual(
  getViewRange(new Date(2024, 1, 15), 'month'),
  { from: '2024-02-01', to: '2024-02-29' },
  'февраль високосного года',
)

/* ── Неделя: начинается с понедельника, а не с воскресенья ─────────────── */
assert.deepEqual(
  getViewRange(new Date(2026, 8, 11), 'week'), // пятница
  { from: '2026-09-07', to: '2026-09-13' },
  'неделя вокруг пятницы',
)
// Воскресенье — единственный день, который при getDay()=0 норовит уехать
// в следующую неделю.
assert.deepEqual(
  getViewRange(new Date(2026, 8, 13), 'week'),
  { from: '2026-09-07', to: '2026-09-13' },
  'воскресенье принадлежит уходящей неделе',
)
assert.deepEqual(
  getViewRange(new Date(2026, 8, 7), 'week'),
  { from: '2026-09-07', to: '2026-09-13' },
  'понедельник — первый день своей недели',
)

/* ── День ──────────────────────────────────────────────────────────────── */
assert.deepEqual(
  getViewRange(new Date(2026, 8, 11), 'day'),
  { from: '2026-09-11', to: '2026-09-11' },
  'день — сам себе диапазон',
)

/* ── Шаги навигации через границу года ─────────────────────────────────── */
assert.equal(toIsoDate(moveCursor(new Date(2026, 11, 15), 'month', 1)), '2027-01-01')
assert.equal(toIsoDate(moveCursor(new Date(2026, 0, 15), 'month', -1)), '2025-12-01')
assert.equal(toIsoDate(moveCursor(new Date(2026, 11, 31), 'day', 1)), '2027-01-01')
assert.equal(toIsoDate(moveCursor(new Date(2026, 11, 29), 'week', 1)), '2027-01-05')

/* ── Отступ до первого числа в сетке месяца ────────────────────────────── */
// 1 сентября 2026 — вторник, значит одна пустая клетка слева.
assert.equal(leadingPad(new Date(2026, 8, 1)), 1, 'вторник → 1 пустая клетка')
// 1 ноября 2026 — воскресенье: максимальный отступ, шесть пустых клеток.
assert.equal(leadingPad(new Date(2026, 10, 1)), 6, 'воскресенье → 6 пустых клеток')
// 1 июня 2026 — понедельник: отступа нет.
assert.equal(leadingPad(new Date(2026, 5, 1)), 0, 'понедельник → без отступа')

console.log('periodCalendar: ок')
