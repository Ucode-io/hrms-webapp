import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Preloader } from 'konsta/react'
import { useAuth } from '../context/AuthContext'
import { useI18n, type TKey, formatDateLocal } from '../i18n'
import { CalendarOffIcon } from './Icons'
import { useUpcomingEventsQuery, type UpcomingEventItem } from '../api/dashboardService'
import shiftsService, { formatShiftRange, type ShiftRecord } from '../api/shiftsService'

type DayChip = {
  dateKey: string
  dayLabel: string
  dateLabel: string
}

const DAY_CHIPS_COUNT = 30

const toIsoDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const addDays = (value: Date, days: number): Date => {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  date.setDate(date.getDate() + days)
  return date
}

const buildDayChips = (base: Date, count: number): DayChip[] =>
  Array.from({ length: count }, (_, idx) => {
    const day = addDays(base, idx)
    return {
      dateKey: toIsoDate(day),
      dayLabel: formatDateLocal(day, { weekday: 'short' }).replace('.', ''),
      dateLabel: formatDateLocal(day, { day: '2-digit' }),
    }
  })

const formatHumanDate = (iso: string, fallback: string): string => {
  if (!iso) return fallback
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return fallback
  return formatDateLocal(date, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

const getTypeBadge = (type: UpcomingEventItem['type']): { label: TKey; className: string } => {
  if (type === 'weekend') {
    return {
      label: 'events.weekend',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    }
  }

  if (type === 'working_holiday') {
    return {
      label: 'events.workingHoliday',
      className: 'bg-violet-50 text-violet-700 border border-violet-200',
    }
  }

  return {
    label: 'events.holiday',
    className: 'bg-rose-50 text-rose-700 border border-rose-200',
  }
}

/**
 * Подпись дня в ленте — её решает смена, а не день недели.
 *
 * День без смены — выходной, даже будний: «не работает» в схеме выражается
 * именно отсутствием строки (docs/shift-table.md). Обратное тоже верно —
 * смена в субботу заведена осознанно, и календарь её не отменяет. Та же
 * развязка уже стоит в «Табеле» → «Мой график».
 *
 * Праздник перебивает слово «Выходной» только у нерабочего дня: суббота и так
 * видна по дате, а 8 марта — нет.
 */
const getDayChipStatusMeta = (
  items: UpcomingEventItem[] | undefined,
  shift: ShiftRecord | undefined,
  t: (key: TKey) => string,
): { label: string; colorClass: string } => {
  if (shift) {
    const range = formatShiftRange(shift)
    return {
      label: range !== '—' ? range : t('events.workday'),
      colorClass: 'text-emerald-500',
    }
  }
  const holiday = items?.find((item) => item.type === 'holiday' || item.type === 'working_holiday')
  if (holiday) return { label: t('events.holiday'), colorClass: 'text-rose-500' }
  return { label: t('events.weekend'), colorClass: 'text-amber-500' }
}

export function UpcomingEvents() {
  const { profile, session } = useAuth()
  const { lang, t } = useI18n()
  const today = useMemo(() => new Date(), [])
  const dayChips = useMemo(
    () => buildDayChips(today, DAY_CHIPS_COUNT),
    [today, lang],
  )

  const dateFrom = dayChips[0]?.dateKey || toIsoDate(today)
  const dateTo = dayChips[dayChips.length - 1]?.dateKey || toIsoDate(today)
  const userBaseId =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) ||
    ''

  const [selectedDate, setSelectedDate] = useState(dateFrom)

  const {
    data: events = [],
    isLoading,
    isError,
    refetch,
  } = useUpcomingEventsQuery({
    params: {
      userBaseId,
      dateFrom,
      dateTo,
    },
    querySettings: {
      keepPreviousData: true,
    },
  })

  const eventsByDate = useMemo(() => {
    const map = new Map<string, UpcomingEventItem[]>()
    for (const item of events) {
      const bucket = map.get(item.date) || []
      bucket.push(item)
      map.set(item.date, bucket)
    }
    return map
  }, [events])

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['my-shifts-week', userBaseId, dateFrom, dateTo],
    queryFn: () => shiftsService.getMine(userBaseId, { from: dateFrom, to: dateTo }),
    enabled: Boolean(userBaseId),
    staleTime: 60_000,
  })

  // Несколько смен на дату в схеме не запрещены — как и в админке, берём
  // последнюю найденную, а не падаем на неоднозначности.
  const shiftByDate = useMemo(() => {
    const map = new Map<string, ShiftRecord>()
    for (const shift of shifts) {
      if (shift.date) map.set(shift.date, shift)
    }
    return map
  }, [shifts])

  const selectedEvents = eventsByDate.get(selectedDate) || []

  return (
    <section className="animate-fade-in-up animate-delay-2 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 shadow-sm">
      {/* Подзаголовка нет намеренно: строка «праздники и выходные на ближайшие
          дни» пересказывала ленту, которая и так под ней. */}
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-[14px] font-extrabold text-[var(--text-main)] tracking-tight">
          {t('events.title')}
        </p>
        <span className="shrink-0 text-[var(--accent)]">
          <CalendarOffIcon size={16} />
        </span>
      </div>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {dayChips.map((day) => {
          const isSelected = selectedDate === day.dateKey
          const dayEvents = eventsByDate.get(day.dateKey) || []
          // Пока смены не приехали, «Выходной» был бы враньём на полсекунды.
          const statusMeta = shiftsLoading
            ? { label: '—', colorClass: 'text-[var(--text-muted)]' }
            : getDayChipStatusMeta(dayEvents, shiftByDate.get(day.dateKey), t)

          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => setSelectedDate(day.dateKey)}
              className={`w-[68px] shrink-0 rounded-xl px-1 py-1.5 text-center transition-all duration-150 ${
                isSelected
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text-main)] active:scale-[0.98]'
              }`}
            >
              <p className={`m-0 text-[9px] font-bold uppercase tracking-[0.06em] ${isSelected ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                {day.dayLabel}
              </p>
              <p className="m-0 text-[16px] font-black leading-tight">{day.dateLabel}</p>
              <p className={`m-0 whitespace-nowrap text-[9px] font-bold leading-tight ${isSelected ? 'text-white/90' : statusMeta.colorClass}`}>
                {statusMeta.label}
              </p>
            </button>
          )
        })}
      </div>

      {/* Панель дня видна всегда — она и есть ответ на тап по чипу. В пустой
          день от неё остаётся одна строка: дата и «Без событий». Счётчика
          рядом со списком нет намеренно — события под ним и так пересчитаны
          глазом, а «1 событий» пришлось бы склонять. */}
      <div className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--app-bg)] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[11px] font-bold capitalize text-[var(--text-main)]">
            {formatHumanDate(selectedDate, t('events.noDate'))}
          </p>
          {!isLoading && !isError && selectedEvents.length === 0 && (
            <span className="shrink-0 text-[10px] font-semibold text-[var(--text-muted)]">
              {t('events.none')}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-2">
            <Preloader />
          </div>
        ) : isError ? (
          <div className="mt-1.5 rounded-lg border border-[var(--error-line)] bg-[var(--error-bg)] px-2.5 py-1.5">
            <p className="m-0 text-[11px] font-semibold text-[var(--error-text)]">
              {t('events.loadFailed')}
            </p>
            <button
              type="button"
              onClick={() => {
                void refetch()
              }}
              className="mt-1.5 rounded-lg bg-[var(--error-text)] px-2.5 py-1 text-[11px] font-bold text-white"
            >
              {t('events.repeat')}
            </button>
          </div>
        ) : selectedEvents.length > 0 ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {selectedEvents.map((item) => {
              const badge = getTypeBadge(item.type)
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5"
                >
                  <p className="m-0 text-[12px] font-semibold leading-snug text-[var(--text-main)]">
                    {item.title}
                  </p>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                    {t(badge.label)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </section>
  )
}
