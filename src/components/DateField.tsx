import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDateRu, toIsoDate } from '../api/absenceService'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

function parseIso(iso: string): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Monday-indexed weekday (Mon=0 … Sun=6). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

type DateFieldProps = {
  value: string
  onChange: (iso: string) => void
  /** Inclusive lower bound (ISO yyyy-mm-dd). Earlier days are disabled. */
  min?: string
  /** Brand accent for the selected day. */
  accent?: string
  /** Popover horizontal alignment relative to the field. */
  align?: 'left' | 'right'
}

export default function DateField({
  value,
  onChange,
  min,
  accent = 'var(--accent)',
  align = 'left',
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = parseIso(value) || new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Open and snap the visible month to the current value (or today).
  const toggle = () => {
    const next = !open
    if (next) {
      const base = parseIso(value) || new Date()
      setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    }
    setOpen(next)
  }

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const lead = mondayIndex(first)
    const out: Array<{ iso: string; day: number } | null> = []
    for (let i = 0; i < lead; i += 1) out.push(null)
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push({ iso: toIsoDate(new Date(year, month, d)), day: d })
    }
    return out
  }, [viewMonth])

  const todayIso = toIsoDate(new Date())

  const fieldCls =
    'mobile-input flex h-12 w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors'

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={toggle} className={fieldCls}>
        <span>{value ? formatDateRu(value) : 'Выберите дату'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8896a8" strokeWidth="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-[60] w-[300px] max-w-[calc(100vw-40px)] rounded-2xl border border-[var(--line)] bg-white p-3 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header */}
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[14px] font-bold text-[var(--text-main)]">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Предыдущий месяц"
                onClick={() =>
                  setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] active:bg-gray-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Следующий месяц"
                onClick={() =>
                  setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] active:bg-gray-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-[11px] font-semibold text-[var(--text-muted)]">
                {w}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`e${i}`} />
              const isSelected = cell.iso === value
              const isToday = cell.iso === todayIso
              const isDisabled = Boolean(min && cell.iso < min)
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(cell.iso)
                    setOpen(false)
                  }}
                  className={`flex h-9 items-center justify-center rounded-lg text-[13px] font-semibold transition-colors ${
                    isDisabled
                      ? 'cursor-not-allowed text-gray-300'
                      : isSelected
                        ? 'text-white'
                        : isToday
                          ? 'text-[var(--text-main)] ring-1 ring-inset ring-[var(--line)]'
                          : 'text-[var(--text-main)] active:bg-gray-100'
                  }`}
                  style={isSelected && !isDisabled ? { background: accent } : undefined}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-2 flex items-center justify-end border-t border-[var(--line)] pt-2">
            <button
              type="button"
              onClick={() => {
                const t = toIsoDate(new Date())
                if (!(min && t < min)) {
                  onChange(t)
                  setOpen(false)
                } else {
                  setViewMonth(new Date())
                }
              }}
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
              style={{ color: accent }}
            >
              Сегодня
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
