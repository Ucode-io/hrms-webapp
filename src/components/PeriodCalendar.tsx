import { useMemo } from 'react'
import { Icon } from '@iconify/react'

/** Режимы одинаковы у календаря событий и календаря задач — см. макеты. */
export type CalendarView = 'month' | 'week' | 'day'

const VIEW_TABS: Array<{ key: CalendarView; label: string }> = [
  { key: 'month', label: 'Месяц' },
  { key: 'week', label: 'Неделя' },
  { key: 'day', label: 'День' },
]

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

export const toIsoDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const startOfDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate())

const addDays = (value: Date, days: number): Date => {
  const next = startOfDay(value)
  next.setDate(next.getDate() + days)
  return next
}

/** Понедельник недели, в которую попадает дата (в РФ неделя с понедельника). */
const startOfWeek = (value: Date): Date => {
  const day = value.getDay()
  // getDay(): вс = 0. Сдвигаем так, чтобы понедельник был нулём.
  return addDays(value, -((day + 6) % 7))
}

/** Границы периода — ими страница фильтрует свои элементы. */
export const getViewRange = (cursor: Date, view: CalendarView): { from: string; to: string } => {
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

/** Шаг «назад/вперёд» — по единице текущего режима. */
export const moveCursor = (cursor: Date, view: CalendarView, direction: -1 | 1): Date => {
  if (view === 'day') return addDays(cursor, direction)
  if (view === 'week') return addDays(cursor, 7 * direction)
  return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
}

export const formatCursorTitle = (cursor: Date, view: CalendarView): string => {
  if (view === 'month') return `${MONTHS_NOMINATIVE[cursor.getMonth()]} ${cursor.getFullYear()}`
  if (view === 'day') {
    return cursor
      .toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', weekday: 'long' })
      .replace('.', '')
  }
  const first = startOfWeek(cursor)
  const last = addDays(first, 6)
  const sameMonth = first.getMonth() === last.getMonth()
  const firstLabel = sameMonth
    ? String(first.getDate())
    : first.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
  const lastLabel = last.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
  return `${firstLabel}–${lastLabel} ${last.getFullYear()}`
}

interface PeriodCalendarProps {
  cursor: Date
  view: CalendarView
  /** Даты (ISO), под которыми рисуем точку «здесь что-то есть». */
  markedDates: Set<string>
  onCursorChange: (next: Date) => void
  onViewChange: (next: CalendarView) => void
  accentColor: string
}

/**
 * Шапка календаря: навигация по периоду, переключатель Месяц/Неделя/День и
 * сетка дней. Список под сеткой рисует сама страница — он у событий и у задач
 * разный, а вся остальная механика одна и та же.
 */
export function PeriodCalendar({
  cursor,
  view,
  markedDates,
  onCursorChange,
  onViewChange,
  accentColor,
}: PeriodCalendarProps) {
  const todayIso = toIsoDate(new Date())
  const cursorIso = toIsoDate(cursor)

  const monthCells = useMemo(() => {
    if (view !== 'month') return []
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    // Пустые клетки до первого числа: неделя начинается с понедельника.
    const leading = (first.getDay() + 6) % 7
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) =>
        new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
      ),
    ]
  }, [cursor, view])

  const weekCells = useMemo(() => {
    if (view !== 'week') return []
    const first = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, i) => addDays(first, i))
  }, [cursor, view])

  const renderDayCell = (date: Date, withWeekday: boolean) => {
    const iso = toIsoDate(date)
    const isSelected = iso === cursorIso
    const isToday = iso === todayIso
    return (
      <button
        key={iso}
        type="button"
        onClick={() => onCursorChange(date)}
        className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[13px] font-semibold transition-transform active:scale-95 ${
          isSelected
            ? 'text-white'
            : `bg-[var(--surface)] ${isToday ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`
        }`}
        style={isSelected ? { backgroundColor: accentColor } : undefined}
      >
        {withWeekday && (
          <span className={`text-[10px] font-bold uppercase ${isSelected ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
            {WEEKDAYS[(date.getDay() + 6) % 7]}
          </span>
        )}
        {date.getDate()}
        {/* Точка-маркер: под числом, поэтому высота клетки не скачет. */}
        <span
          className={`h-1 w-1 rounded-full ${
            markedDates.has(iso)
              ? isSelected
                ? 'bg-[#fff]'
                : 'bg-[var(--accent)]'
              : 'bg-transparent'
          }`}
        />
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Навигация по периоду */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCursorChange(moveCursor(cursor, view, -1))}
          aria-label="Предыдущий период"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--text-secondary)] active:scale-95"
        >
          <Icon icon="mdi:chevron-left" width={20} />
        </button>
        <p className="m-0 flex-1 text-center text-[15px] font-extrabold text-[var(--text-main)]">
          {formatCursorTitle(cursor, view)}
        </p>
        <button
          type="button"
          onClick={() => onCursorChange(moveCursor(cursor, view, 1))}
          aria-label="Следующий период"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--text-secondary)] active:scale-95"
        >
          <Icon icon="mdi:chevron-right" width={20} />
        </button>
      </div>

      {/* Месяц / Неделя / День */}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1">
        {VIEW_TABS.map((tab) => {
          const isActive = tab.key === view
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onViewChange(tab.key)}
              className={`rounded-xl py-2 text-[13px] font-bold transition-colors ${
                isActive
                  ? 'bg-[var(--app-bg)] text-[var(--text-main)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {view === 'month' && (
        <div className="rounded-2xl bg-[var(--surface)] p-2.5">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((label) => (
              <span key={label} className="text-center text-[11px] font-semibold text-[var(--text-muted)]">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((date, index) =>
              date ? renderDayCell(date, false) : <span key={`pad-${index}`} />,
            )}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="grid grid-cols-7 gap-1">
          {weekCells.map((date) => renderDayCell(date, true))}
        </div>
      )}
    </div>
  )
}
