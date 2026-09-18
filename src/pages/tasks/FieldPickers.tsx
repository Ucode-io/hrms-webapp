import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

/**
 * Пикеры полей карточки задачи.
 *
 * Раскрывающиеся прямо в строке списки раздвигали раскладку «Деталей» и на
 * длинных справочниках уезжали за край, поэтому любой выбор открывается
 * отдельным слоем снизу (`PickerSheet`) — строка при этом не двигается.
 */

/* ── Слой выбора ───────────────────────────────────────────────────────── */

/**
 * Bottom sheet поверх шторки задачи. Рендерится порталом в <body>: внутри
 * `Drawer.Content` у vaul живёт собственный transform анимации, и `fixed`
 * элемент внутри неё привязался бы к шторке, а не к экрану.
 */
export function PickerSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="picker-layer fixed inset-0 z-[70] flex flex-col justify-end"
      // Шторка задачи закрывается по нажатию «мимо себя», а лист выбора для неё
      // как раз «мимо». Без остановки всплытия выбор значения захлопывал бы всю
      // карточку задачи.
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        role="presentation"
      />
      <div className="picker-sheet relative flex max-h-[78vh] flex-col rounded-t-3xl bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_40px_rgba(12,26,46,0.22)]">
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-[4px] w-9 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-1">
          <p className="m-0 text-[14.5px] font-extrabold text-[var(--text-main)]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--surface-muted)] text-[var(--text-secondary)] active:bg-gray-200"
            aria-label="Закрыть"
          >
            <Icon icon="mdi:close" width={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
        {footer ? <div className="border-t border-[var(--line)] px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

/* ── Строка поля ───────────────────────────────────────────────────────── */

export function FieldRow({
  icon,
  label,
  children,
}: {
  icon?: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-1">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-muted)]">
        {icon ? <Icon icon={icon} width={14} className="shrink-0 opacity-80" /> : null}
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** Кнопка-значение: то, что видно в строке. Высота фиксирована — открытие
 * пикера больше не меняет раскладку «Деталей». */
function ValueButton({
  onClick,
  disabled,
  children,
  empty,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  empty?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center justify-end gap-1 rounded-lg border-0 bg-transparent px-1 py-2 text-right active:bg-gray-100 disabled:opacity-60"
    >
      <span
        className={`flex min-w-0 flex-wrap items-center justify-end gap-1 truncate text-[12.5px] ${
          empty ? 'text-[var(--text-muted)]' : 'font-bold text-[var(--text-main)]'
        }`}
      >
        {children}
      </span>
      <Icon
        icon="mdi:chevron-right"
        width={15}
        className="shrink-0 text-[var(--text-muted)] opacity-70"
      />
    </button>
  )
}

export interface Option {
  id: string
  title: string
  color?: string
}

/* ── Одиночный выбор ───────────────────────────────────────────────────── */

export function SelectField({
  value,
  options,
  placeholder,
  label,
  disabled,
  allowEmpty = true,
  onChange,
  renderValue,
}: {
  value: string | null
  options: Option[]
  placeholder: string
  /** Заголовок листа выбора. */
  label: string
  disabled?: boolean
  allowEmpty?: boolean
  onChange: (id: string | null) => void
  renderValue?: (option: Option) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = useMemo(() => options.find((o) => o.id === value) || null, [options, value])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.title.toLowerCase().includes(q))
  }, [options, search])

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  return (
    <>
      <ValueButton onClick={() => setOpen(true)} disabled={disabled} empty={!selected}>
        {selected ? (renderValue ? renderValue(selected) : selected.title) : placeholder}
      </ValueButton>

      <PickerSheet open={open} title={label} onClose={close}>
        {/* Поиск — только на длинных справочниках: на пяти пунктах он лишний. */}
        {options.length > 7 ? (
          <div className="sticky top-0 z-10 bg-[var(--surface)] pb-2 pt-1">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск…"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-0.5">
          {allowEmpty ? (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                close()
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border-0 px-3 py-3 text-left text-[13.5px] text-[var(--text-muted)] active:bg-gray-100 ${
                value == null ? 'bg-[var(--accent-soft)]' : 'bg-transparent'
              }`}
            >
              <span className="flex-1">{placeholder}</span>
              {value == null ? (
                <Icon icon="mdi:check" width={16} className="text-[var(--accent)]" />
              ) : null}
            </button>
          ) : null}

          {filtered.length === 0 ? (
            <p className="m-0 px-3 py-4 text-center text-[12.5px] text-[var(--text-muted)]">
              Ничего не найдено
            </p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id)
                  close()
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-0 px-3 py-3 text-left text-[13.5px] font-semibold active:bg-gray-100 ${
                  option.id === value ? 'bg-[var(--accent-soft)]' : 'bg-transparent'
                }`}
              >
                {option.color ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: option.color }}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-[var(--text-main)]">
                  {option.title}
                </span>
                {option.id === value ? (
                  <Icon icon="mdi:check" width={16} className="text-[var(--accent)]" />
                ) : null}
              </button>
            ))
          )}
        </div>
      </PickerSheet>
    </>
  )
}

/* ── Мультивыбор ───────────────────────────────────────────────────────── */

export function MultiSelectField({
  values,
  options,
  placeholder,
  label,
  searchPlaceholder,
  disabled,
  onChange,
  renderChip,
  renderOption,
}: {
  values: string[]
  options: Option[]
  placeholder: string
  label: string
  searchPlaceholder: string
  disabled?: boolean
  onChange: (ids: string[]) => void
  renderChip: (option: Option) => ReactNode
  renderOption?: (option: Option) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  // Правки копим локально и отправляем одним патчем по «Готово»: иначе выбор
  // трёх исполнителей — это три запроса и три перерисовки списка под шторкой.
  const [draft, setDraft] = useState<string[]>(values)

  const selected = useMemo(
    () => values.map((id) => options.find((o) => o.id === id)).filter((o): o is Option => Boolean(o)),
    [values, options],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.title.toLowerCase().includes(q))
  }, [options, search])

  const openSheet = () => {
    setDraft(values)
    setSearch('')
    setOpen(true)
  }

  const toggle = (id: string) => {
    setDraft((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const apply = () => {
    setOpen(false)
    const changed =
      draft.length !== values.length || draft.some((id) => !values.includes(id))
    if (changed) onChange(draft)
  }

  // Крестик и тап по затемнению — отмена: пользователь ждёт от них «закрыть,
  // ничего не меняя», а не тихого сохранения набранного.
  const cancel = () => {
    setOpen(false)
    setDraft(values)
  }

  return (
    <>
      <ValueButton onClick={openSheet} disabled={disabled} empty={selected.length === 0}>
        {selected.length > 0
          ? selected.map((option) => <span key={option.id}>{renderChip(option)}</span>)
          : placeholder}
      </ValueButton>

      <PickerSheet
        open={open}
        title={label}
        onClose={cancel}
        footer={
          <button
            type="button"
            onClick={apply}
            className="w-full cursor-pointer rounded-xl border-0 bg-[var(--accent)] px-4 py-3 text-[13.5px] font-bold text-white active:scale-[0.99]"
          >
            Готово{draft.length > 0 ? ` · ${draft.length}` : ''}
          </button>
        }
      >
        {options.length > 7 ? (
          <div className="sticky top-0 z-10 bg-[var(--surface)] pb-2 pt-1">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[13px] outline-none focus:border-[var(--accent)]"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-0.5">
          {filtered.length === 0 ? (
            <p className="m-0 px-3 py-4 text-center text-[12.5px] text-[var(--text-muted)]">
              Ничего не найдено
            </p>
          ) : (
            filtered.map((option) => {
              const isOn = draft.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggle(option.id)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border-0 px-3 py-2.5 text-left text-[13.5px] font-semibold active:bg-gray-100 ${
                    isOn ? 'bg-[var(--accent-soft)]' : 'bg-transparent'
                  }`}
                >
                  <Icon
                    icon={isOn ? 'mdi:checkbox-marked' : 'mdi:checkbox-blank-outline'}
                    width={18}
                    className={`shrink-0 ${isOn ? 'text-[var(--accent)]' : 'text-gray-300'}`}
                  />
                  {renderOption ? (
                    renderOption(option)
                  ) : (
                    <>
                      {option.color ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: option.color }}
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[var(--text-main)]">
                        {option.title}
                      </span>
                    </>
                  )}
                </button>
              )
            })
          )}
        </div>
      </PickerSheet>
    </>
  )
}

/* ── Дата ──────────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const toIso = (date: Date): string => {
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

const parseIso = (iso: string | null): Date | null => {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

const formatRu = (iso: string): string => {
  const parsed = parseIso(iso)
  if (!parsed) return iso
  const short = parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
  // Год показываем только когда он не текущий: в строке поля «2026 г.» рядом с
  // каждой датой — шум, который ничего не уточняет.
  const year = parsed.getFullYear()
  return year === new Date().getFullYear() ? short : `${short} ${year}`
}

/** Понедельник = 0. */
const mondayIndex = (date: Date): number => (date.getDay() + 6) % 7

/**
 * Дата — собственный календарь в листе выбора. Нативный `<input type="date">`
 * на телефоне выглядит как набор цифровых сегментов и позволяет вбить руками
 * что угодно; календарь и читается быстрее, и ошибиться в нём нельзя.
 */
export function DateField({
  value,
  label,
  disabled,
  tone,
  placeholder = 'Не указана',
  onChange,
}: {
  value: string | null
  label: string
  disabled?: boolean
  tone?: string
  placeholder?: string
  onChange: (iso: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = parseIso(value) || new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const openSheet = () => {
    const base = parseIso(value) || new Date()
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    setOpen(true)
  }

  const cells = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const lead = mondayIndex(new Date(year, month, 1))
    const out: Array<{ iso: string; day: number } | null> = []
    for (let i = 0; i < lead; i += 1) out.push(null)
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push({ iso: toIso(new Date(year, month, d)), day: d })
    }
    return out
  }, [viewMonth])

  const todayIso = toIso(new Date())

  const pick = (iso: string | null) => {
    setOpen(false)
    if (iso !== value) onChange(iso)
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        disabled={disabled}
        className="flex w-full cursor-pointer items-center justify-end gap-1.5 rounded-lg border-0 bg-transparent px-1 py-2 text-right active:bg-gray-100 disabled:opacity-60"
      >
        <span
          className={`truncate text-[12.5px] ${
            value ? `font-bold ${tone || 'text-[var(--text-main)]'}` : 'text-[var(--text-muted)]'
          }`}
        >
          {value ? formatRu(value) : placeholder}
        </span>
        <Icon
          icon="mdi:calendar-blank-outline"
          width={15}
          className="shrink-0 text-[var(--text-muted)] opacity-70"
        />
      </button>

      <PickerSheet
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex-1 cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px] font-bold text-[var(--text-secondary)] active:bg-gray-50"
            >
              Очистить
            </button>
            <button
              type="button"
              onClick={() => pick(todayIso)}
              className="flex-1 cursor-pointer rounded-xl border-0 bg-[var(--accent)] px-4 py-3 text-[13px] font-bold text-white active:scale-[0.99]"
            >
              Сегодня
            </button>
          </div>
        }
      >
        <div className="px-1 pt-1">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-0 bg-[var(--surface-muted)] text-[var(--text-secondary)] active:bg-gray-200"
            >
              <Icon icon="mdi:chevron-left" width={20} />
            </button>
            <span className="text-[14px] font-extrabold text-[var(--text-main)]">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-0 bg-[var(--surface-muted)] text-[var(--text-secondary)] active:bg-gray-200"
            >
              <Icon icon="mdi:chevron-right" width={20} />
            </button>
          </div>

          <div className="grid grid-cols-7">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="py-1 text-center text-[11px] font-bold text-[var(--text-muted)]"
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, index) => {
              if (!cell) return <div key={`empty-${index}`} />
              const isSelected = cell.iso === value
              const isToday = cell.iso === todayIso
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => pick(cell.iso)}
                  className={`flex h-10 cursor-pointer items-center justify-center rounded-xl border-0 text-[13.5px] font-bold transition-colors ${
                    isSelected
                      ? 'bg-[var(--accent)] text-white'
                      : isToday
                        ? 'bg-transparent text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]'
                        : 'bg-transparent text-[var(--text-main)] active:bg-gray-100'
                  }`}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>
        </div>
      </PickerSheet>
    </>
  )
}

/* ── Текст ─────────────────────────────────────────────────────────────── */

/**
 * Текст, редактируемый по тапу. Пока поле не трогают, оно выглядит текстом —
 * карточка задачи не должна встречать пользователя формой из пустых инпутов.
 */
export function EditableText({
  value,
  placeholder,
  multiline,
  disabled,
  appearance = 'body',
  onCommit,
}: {
  value: string
  placeholder: string
  multiline?: boolean
  disabled?: boolean
  appearance?: 'body' | 'title'
  onCommit: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    const end = el.value.length
    el.setSelectionRange(end, end)
  }, [editing])

  const startEdit = () => {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value.trim()) onCommit(next)
  }

  const isTitle = appearance === 'title'

  if (!editing) {
    return (
      <div
        role="button"
        tabIndex={disabled ? undefined : 0}
        onClick={startEdit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            startEdit()
          }
        }}
        className={`group w-full rounded-xl transition-colors ${
          disabled ? '' : 'cursor-text active:bg-black/[0.03]'
        } ${isTitle ? '' : '-mx-1 px-1 py-0.5'}`}
      >
        {value ? (
          <p
            className={`m-0 whitespace-pre-line ${
              isTitle
                ? 'text-[18px] font-extrabold leading-snug text-[var(--text-main)]'
                : 'text-[13px] leading-relaxed text-[var(--text-secondary)]'
            }`}
          >
            {value}
          </p>
        ) : (
          <p
            className={`m-0 inline-flex items-center gap-1.5 ${
              isTitle
                ? 'text-[18px] font-bold text-[var(--text-muted)]'
                : 'text-[13px] text-[var(--text-muted)]'
            }`}
          >
            {!isTitle ? <Icon icon="mdi:pencil-outline" width={13} /> : null}
            {placeholder}
          </p>
        )}
      </div>
    )
  }

  const shared = {
    value: draft,
    disabled,
    placeholder,
    onBlur: commit,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
  }
  const editClass = isTitle
    ? 'w-full rounded-xl border border-[var(--accent)] bg-[var(--surface)] px-2 py-1 text-[18px] font-extrabold leading-snug text-[var(--text-main)] outline-none disabled:opacity-60'
    : 'w-full rounded-xl border border-[var(--accent)] bg-[var(--surface)] px-3 py-2 text-[13px] leading-relaxed text-[var(--text-main)] outline-none disabled:opacity-60'

  return multiline ? (
    <textarea
      ref={inputRef as React.Ref<HTMLTextAreaElement>}
      {...shared}
      rows={5}
      className={`${editClass} resize-none`}
    />
  ) : (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      {...shared}
      className={editClass}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}
