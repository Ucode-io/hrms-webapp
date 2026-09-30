/**
 * Проверка правила «какой смене принадлежит сейчас» — то же, что у бэкенда
 * (hickvision shift-time.js). Запуск: `yarn check:shift` (Node 22.6+), руками,
 * как и `check:lang`: образ сборки на Node 20 флага strip-types не знает.
 */

import assert from 'node:assert/strict'
import { addDays, currentShift, marksOfShift, shiftWindow } from './shiftWindow.ts'

const WED = '2026-09-30'
const THU = '2026-10-01'

const night = (date: string) => ({ date, start_time: '22:00', end_time: '06:00' })
const day = (date: string) => ({ date, start_time: '09:00', end_time: '18:00' })

// Зона ночи среды: со среды 18:00 до четверга 10:00.
assert.deepEqual(shiftWindow(night(WED)), { from: 1080, to: 2040 })

// В четверг в 06:10 текущая смена — ночь среды, а не «сегодня».
assert.equal(currentShift([night(WED), night(THU)], THU, '06:10')?.date, WED)
// В четверг в 21:55 — уже ночь четверга.
assert.equal(currentShift([night(WED), night(THU)], THU, '21:55')?.date, THU)
// Между зонами — вне смены.
assert.equal(currentShift([night(WED)], THU, '12:00'), null)
// Ночь среды кончилась в 06:00, день четверга с 09:00: в 07:30 — поровну,
// момент закрывает ночь.
assert.equal(currentShift([night(WED), day(THU)], THU, '07:30')?.date, WED)
assert.equal(currentShift([night(WED), day(THU)], THU, '08:40')?.date, THU)
// Смена «по часам» — весь свой день.
assert.equal(currentShift([{ date: THU, hours_per_day: 8 }], THU, '23:00')?.date, THU)

// Отметки ночи — из двух календарных дат, по порядку внутри смены.
const marks = [
  { date: THU, event_time: '06:05:00', action: 'OUT' },
  { date: WED, event_time: '21:58:00', action: 'IN' },
  { date: WED, event_time: '12:00:00', action: 'IN' },
  { date: THU, event_time: '11:00:00', action: 'IN' },
]
assert.deepEqual(marksOfShift(night(WED), marks).map((mark) => mark.event_time), ['21:58:00', '06:05:00'])

assert.equal(addDays(WED, 1), THU)
assert.equal(addDays('2026-03-01', -1), '2026-02-28')

console.log('shiftWindow: ok')
