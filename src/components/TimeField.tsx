import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useT } from '../i18n'

// 24-часовой выбор времени барабаном, в стиле DateField: нативный
// <input type="time"> на части телефонов показывает AM/PM и не попадает в тему.

const ITEM = 40
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

/** Колонка-барабан: прокрутка со снапом, значение — то, что в центральной полосе. */
function Wheel({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const settle = useRef<number | undefined>(undefined)
  const [active, setActive] = useState(() => Math.max(0, items.indexOf(value)))

  // Только при открытии: дальше позицией управляет палец, а не value.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = Math.max(0, items.indexOf(value)) * ITEM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => window.clearTimeout(settle.current), [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const index = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)))
    setActive(index)
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      if (items[index] !== value) onChange(items[index])
    }, 120)
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="relative z-10 flex-1 overflow-y-scroll overscroll-contain snap-y snap-mandatory scrollbar-hide"
      style={{ height: ITEM * VISIBLE, paddingTop: PAD, paddingBottom: PAD }}
    >
      {items.map((item, i) => {
        const distance = Math.abs(i - active)
        return (
          <button
            key={item}
            type="button"
            onClick={() => ref.current?.scrollTo({ top: i * ITEM, behavior: 'smooth' })}
            className="flex w-full snap-center items-center justify-center border-0 bg-transparent tabular-nums transition-all duration-150"
            style={{
              height: ITEM,
              fontSize: distance === 0 ? 22 : 18,
              fontWeight: distance === 0 ? 700 : 500,
              color: distance === 0 ? 'var(--text-main)' : 'var(--text-muted)',
              opacity: distance === 0 ? 1 : distance === 1 ? 0.7 : 0.35,
            }}
          >
            {item}
          </button>
        )
      })}
    </div>
  )
}

type TimeFieldProps = {
  /** `HH:MM` или пусто. */
  value: string
  onChange: (hhmm: string) => void
  /** С чего начать барабан, пока значения нет. */
  defaultValue?: string
  accent?: string
  align?: 'left' | 'right'
}

export default function TimeField({
  value,
  onChange,
  defaultValue = '09:00',
  accent = 'var(--accent)',
  align = 'right',
}: TimeFieldProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const current = value || defaultValue
  const [hour, minute] = current.split(':')
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
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

  const toggle = () => {
    // Открыли пустое поле — время на барабане и есть выбор.
    if (!open && !value) onChange(current)
    setOpen((v) => !v)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="mobile-input flex h-12 w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-[14px] font-medium text-[var(--text-main)] outline-none transition-colors"
        style={open ? { borderColor: accent } : undefined}
      >
        <span className={value ? 'tabular-nums' : 'text-[var(--text-muted)]'}>{value || '--:--'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8896a8" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] z-[60] w-[220px] max-w-[calc(100vw-40px)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="relative flex items-center">
            {/* Полоса выбора и затухание к краям барабана. */}
            <div
              className="pointer-events-none absolute inset-x-0 rounded-xl bg-[var(--surface-muted)]"
              style={{ top: PAD, height: ITEM }}
            />
            <Wheel items={HOURS} value={hour} onChange={(h) => onChange(`${h}:${minute}`)} />
            <span className="relative z-10 pb-0.5 text-[22px] font-bold text-[var(--text-main)]">:</span>
            <Wheel items={MINUTES} value={minute} onChange={(m) => onChange(`${hour}:${m}`)} />
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-20"
              style={{ height: PAD, background: 'linear-gradient(var(--surface), transparent)' }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
              style={{ height: PAD, background: 'linear-gradient(transparent, var(--surface))' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 h-10 w-full rounded-xl border-0 text-[14px] font-bold text-white cursor-pointer active:scale-[0.98] transition-transform"
            style={{ background: accent }}
          >
            {t('timeField.done')}
          </button>
        </div>
      )}
    </div>
  )
}
