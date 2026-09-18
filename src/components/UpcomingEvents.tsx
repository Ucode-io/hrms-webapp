import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Preloader } from 'konsta/react'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { CalendarOffIcon } from './Icons'
import { useUpcomingEventsQuery, type UpcomingEventItem } from '../api/dashboardService'
import shiftsService, { formatShiftRange, type ShiftRecord } from '../api/shiftsService'

type DayChip = {
  dateKey: string
  dayLabel: string
  dateLabel: string
  isWeekend: boolean
}

type DayChipStatus = 'holiday' | 'weekend' | 'working_holiday' | null

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
    const dayOfWeek = day.getDay()
    return {
      dateKey: toIsoDate(day),
      dayLabel: day.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', ''),
      dateLabel: day.toLocaleDateString('ru-RU', { day: '2-digit' }),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    }
  })

const formatHumanDate = (iso: string): string => {
  if (!iso) return 'Дата не выбрана'
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return 'Дата не выбрана'
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

const getTypeBadge = (type: UpcomingEventItem['type']): { label: string; className: string } => {
  if (type === 'weekend') {
    return {
      label: 'Выходной',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    }
  }

  if (type === 'working_holiday') {
    return {
      label: 'Рабочий праздник',
      className: 'bg-violet-50 text-violet-700 border border-violet-200',
    }
  }

  return {
    label: 'Праздник',
    className: 'bg-rose-50 text-rose-700 border border-rose-200',
  }
}

const getDayChipStatus = (items: UpcomingEventItem[] | undefined, isWeekend: boolean): DayChipStatus => {
  if (items?.some((item) => item.type === 'holiday')) return 'holiday'
  if (isWeekend || items?.some((item) => item.type === 'weekend')) return 'weekend'
  if (items?.some((item) => item.type === 'working_holiday')) return 'working_holiday'
  return null
}

const getDayChipStatusMeta = (
  status: DayChipStatus,
  shift: ShiftRecord | undefined,
): { label: string; colorClass: string } => {
  if (status === 'holiday') return { label: 'Праздник', colorClass: 'text-rose-500' }
  if (status === 'weekend') return { label: 'Выходной', colorClass: 'text-amber-500' }
  if (status === 'working_holiday') return { label: 'Рабочий', colorClass: 'text-violet-500' }
  const range = shift ? formatShiftRange(shift) : ''
  return {
    label: range && range !== '—' ? range : 'Р/д',
    colorClass: 'text-emerald-500',
  }
}

export function UpcomingEvents() {
  const { profile, session } = useAuth()
  const today = useMemo(() => new Date(), [])
  const dayChips = useMemo(() => buildDayChips(today, DAY_CHIPS_COUNT), [today])

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
    isFetching,
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

  const { data: shifts = [] } = useQuery({
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
    <section className="animate-fade-in-up animate-delay-2 rounded-[22px] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[17px] font-extrabold text-[var(--text-main)] tracking-tight">
            Предстоящие события
          </p>
          <p className="m-0 mt-1 text-xs font-medium text-[var(--text-muted)]">
            Праздники и выходные на ближайшие дни
          </p>
        </div>
        <div className="h-10 w-10 shrink-0 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center">
          <CalendarOffIcon size={20} />
        </div>
      </div>

      <div className="mt-3.5 flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
        {dayChips.map((day) => {
          const isSelected = selectedDate === day.dateKey
          const dayEvents = eventsByDate.get(day.dateKey) || []
          const dayStatus = getDayChipStatus(dayEvents, day.isWeekend)
          const statusMeta = getDayChipStatusMeta(dayStatus, shiftByDate.get(day.dateKey))

          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => setSelectedDate(day.dateKey)}
              className={`w-[92px] shrink-0 rounded-2xl px-2 py-3 text-center transition-all duration-150 ${
                isSelected
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text-main)] active:scale-[0.98]'
              }`}
            >
              <p className={`m-0 text-[10px] font-bold uppercase tracking-[0.08em] ${isSelected ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                {day.dayLabel}
              </p>
              <p className="m-0 mt-1 text-xl font-black leading-none">{day.dateLabel}</p>
              <div className={`mt-2 border-t border-dashed pt-2 ${isSelected ? 'border-white/30' : 'border-[var(--line)]'}`}>
                <p className={`m-0 flex items-center justify-center gap-1 whitespace-nowrap text-[10px] font-bold ${isSelected ? 'text-white/90' : statusMeta.colorClass}`}>
                  <Icon icon="mdi:clock-outline" width={11} className="shrink-0" />
                  {statusMeta.label}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[13px] font-bold text-[var(--text-main)] capitalize">
            {formatHumanDate(selectedDate)}
          </p>
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">
            {selectedEvents.length > 0 ? `${selectedEvents.length} событий` : 'Без событий'}
          </span>
        </div>

        {isLoading ? (
          <div className="py-7 flex justify-center">
            <Preloader />
          </div>
        ) : isError ? (
          <div className="mt-2 rounded-xl border border-[var(--error-line)] bg-[var(--error-bg)] px-3 py-2.5">
            <p className="m-0 text-xs font-semibold text-[var(--error-text)]">
              Не удалось загрузить календарь событий
            </p>
            <button
              type="button"
              onClick={() => {
                void refetch()
              }}
              className="mt-2 rounded-lg bg-[var(--error-text)] text-white text-xs font-bold px-2.5 py-1.5"
            >
              Повторить
            </button>
          </div>
        ) : selectedEvents.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-[var(--text-muted)]">
            На выбранный день нет праздников и выходных.
          </p>
        ) : (
          <div className="mt-2.5 flex flex-col gap-2">
            {selectedEvents.map((item) => {
              const badge = getTypeBadge(item.type)
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <p className="m-0 text-[13px] font-semibold text-[var(--text-main)] leading-snug">
                    {item.title}
                  </p>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {isFetching && !isLoading ? (
          <p className="m-0 mt-2 text-[11px] font-medium text-[var(--text-muted)]">Обновление...</p>
        ) : null}
      </div>
    </section>
  )
}
