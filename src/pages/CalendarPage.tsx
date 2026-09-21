import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useT, type TKey, formatDateLocal } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { getUpcomingEvents } from '../api/dashboardService'
import { reportsService } from '../api/reportsService'
import { trainingsService } from '../api/trainingsService'
import {
  PeriodCalendar,
  getViewRange,
  toIsoDate,
  type CalendarView,
} from '../components/PeriodCalendar'

/** Свой тип вместо «события дашборда»: сюда сходятся три разных источника. */
interface CalendarEntry {
  id: string
  /** Дата начала (ISO). По ней событие попадает в период и в маркеры сетки. */
  date: string
  /** Последний день — у отпусков и тренингов событие длится несколько суток. */
  endDate: string
  title: string
  subtitle: string
  icon: string
  color: string
}

const ABSENCE_STATUS_LABEL: Record<string, TKey> = {
  pending: 'cal.pending',
  approved: 'cal.approved',
  rejected: 'status.rejected',
}

const toIso = (value: string | null | undefined): string | null => {
  if (!value) return null
  const parsed = new Date(value.length > 10 ? value : `${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  return toIsoDate(parsed)
}

const formatShortDate = (iso: string): string => {
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDateLocal(parsed, { day: 'numeric', month: 'short' }).replace('.', '')
}

const formatSpan = (from: string, to: string): string =>
  from === to ? formatShortDate(from) : `${formatShortDate(from)} — ${formatShortDate(to)}`

const SECTION_TITLE: Record<CalendarView, TKey> = {
  month: 'cal.monthEvents',
  week: 'cal.weekEvents',
  day: 'cal.dayEvents',
}

/** Все дни, которые событие занимает — нужны и маркерам сетки, и фильтру периода. */
const spanDates = (entry: CalendarEntry): string[] => {
  const dates: string[] = []
  const cursor = new Date(`${entry.date}T00:00:00`)
  const last = new Date(`${entry.endDate}T00:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [entry.date]
  // Потолок в год: многолетний интервал в данных — это ошибка ввода, а не
  // причина вешать вкладку на миллионе итераций.
  for (let guard = 0; cursor <= last && guard < 366; guard += 1) {
    dates.push(toIsoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function CalendarPage() {
  const t = useT()

  const { session, profile } = useAuth()
  const { company } = useCompany()
  const accentColor = company.mainColor || '#3b6cf5'

  const [view, setView] = useState<CalendarView>('month')
  const [cursor, setCursor] = useState(() => new Date())

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session],
  )

  const range = useMemo(() => getViewRange(cursor, view), [cursor, view])

  // Праздники тянем на весь год вокруг курсора, а не на видимый период: иначе
  // каждый шаг стрелкой — новый запрос, а данных там на пару десятков строк.
  const holidaysRange = useMemo(() => {
    const year = cursor.getFullYear()
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }, [cursor])

  const { data: holidays = [], isPending: holidaysPending } = useQuery({
    queryKey: ['calendar-holidays', employeeGuid, holidaysRange.from] as const,
    queryFn: () =>
      getUpcomingEvents({
        userBaseId: employeeGuid,
        dateFrom: holidaysRange.from,
        dateTo: holidaysRange.to,
      }),
    enabled: Boolean(employeeGuid),
    staleTime: 30 * 60 * 1000,
  })

  const { data: absenceSummary } = useQuery({
    queryKey: ['calendar-absences', employeeGuid, cursor.getFullYear()] as const,
    queryFn: () =>
      reportsService.getEmployeeAbsenceSummary({
        user_base_id: employeeGuid,
        history_year: cursor.getFullYear(),
      }),
    enabled: Boolean(employeeGuid),
    staleTime: 5 * 60 * 1000,
  })

  const { data: trainings = [] } = useQuery({
    queryKey: ['my-trainings', employeeGuid] as const,
    queryFn: () => trainingsService.getMyTrainings(employeeGuid),
    enabled: Boolean(employeeGuid),
    staleTime: 5 * 60 * 1000,
  })

  const entries = useMemo<CalendarEntry[]>(() => {
    const list: CalendarEntry[] = []

    for (const event of holidays) {
      // Выходные по субботам-воскресеньям — это календарная механика, а не
      // событие: маркерами под каждым уикендом сетка превращается в кашу.
      if (event.type === 'weekend') continue
      const iso = toIso(event.date)
      if (!iso) continue
      list.push({
        id: event.id,
        date: iso,
        endDate: iso,
        title: event.title,
        subtitle: event.type === 'working_holiday' ? t('events.workingHoliday') : t('events.holiday'),
        icon: 'mdi:party-popper',
        color: '#f43f5e',
      })
    }

    for (const request of absenceSummary?.requests ?? []) {
      const from = toIso(request.date_from)
      const to = toIso(request.date_to) || from
      if (!from || !to) continue
      list.push({
        id: `absence-${request.guid}`,
        date: from,
        endDate: to,
        title: request.policy?.title || t('absence.defaultTitle'),
        subtitle: t('cal.absenceSubtitle', {
          status: ABSENCE_STATUS_LABEL[request.status] ? t(ABSENCE_STATUS_LABEL[request.status]) : request.status,
          days: request.requested_days,
        }),
        icon: 'mdi:beach',
        color: '#f59e0b',
      })
    }

    for (const training of trainings) {
      const from = toIso(training.starts_at)
      const to = toIso(training.ends_at) || from
      if (!from || !to) continue
      list.push({
        id: `training-${training.guid}`,
        date: from,
        endDate: to,
        title: training.title || t('page.trainingDetail'),
        subtitle: [training.location, training.trainer_name].filter(Boolean).join(' · ') || t('page.trainingDetail'),
        icon: 'mdi:school-outline',
        color: '#8b5cf6',
      })
    }

    return list.sort((a, b) => a.date.localeCompare(b.date))
  }, [holidays, absenceSummary, trainings])

  const markedDates = useMemo(() => {
    const dates = new Set<string>()
    for (const entry of entries) {
      for (const iso of spanDates(entry)) dates.add(iso)
    }
    return dates
  }, [entries])

  const visibleEntries = useMemo(
    // Пересечение интервалов, а не «начало внутри периода»: отпуск с прошлого
    // месяца в этом всё ещё идёт и должен быть виден.
    () => entries.filter((entry) => entry.date <= range.to && entry.endDate >= range.from),
    [entries, range],
  )

  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5">
      <PeriodCalendar
        cursor={cursor}
        view={view}
        markedDates={markedDates}
        onCursorChange={setCursor}
        onViewChange={setView}
        accentColor={accentColor}
      />

      <p className="m-0 px-1 text-[13px] font-semibold text-[var(--text-muted)]">
        {t(SECTION_TITLE[view])}
      </p>

      {holidaysPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[68px] animate-pulse rounded-2xl bg-[var(--surface)]" />
          ))}
        </div>
      ) : visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center">
          <Icon icon="mdi:calendar-blank-outline" width={36} className="text-[var(--text-muted)] opacity-40" />
          <p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">
            {t('cal.empty')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3"
            >
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  background: `color-mix(in srgb, ${entry.color} 18%, transparent)`,
                  color: entry.color,
                }}
              >
                <Icon icon={entry.icon} width={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[14px] font-bold text-[var(--text-main)]">
                  {entry.title}
                </p>
                <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                  {formatSpan(entry.date, entry.endDate)} · {entry.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
