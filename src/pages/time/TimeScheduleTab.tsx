import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth, getDisplayName, getInitials } from '../../context/AuthContext'
import { toIsoDate } from '../../api/attendanceService'
import { useT, tr, getLang, weekdayNames, formatDateLocal } from '../../i18n'
import { getAgendaHolidays } from '../../api/dashboardService'
import shiftsService, {
  SHIFT_KIND_META,
  formatShiftRange,
  normalizeShiftTime,
  shiftHoursPerDay,
  shiftKind,
  type ShiftRecord,
} from '../../api/shiftsService'



function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - day)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDayHeader(date: Date): string {
  return formatDateLocal(date, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()
}

function shiftHours(shift: ShiftRecord): number {
  const start = normalizeShiftTime(shift.start_time)
  const end = normalizeShiftTime(shift.end_time)
  if (!start || !end) return shiftHoursPerDay(shift) ?? 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let minutes = (eh * 60 + em) - (sh * 60 + sm)
  if (minutes <= 0) minutes += 24 * 60 // смена через полночь
  return minutes / 60
}

const isWeekend = (date: Date): boolean => date.getDay() === 0 || date.getDay() === 6

/**
 * «Моя неделя» — только текущая неделя, без пагинации: в примере её тоже нет,
 * а месячный обзор смен уже есть в «Табеле». Понадобится «вперёд/назад» —
 * добавить как в шапке «Табеля».
 */
export function TimeScheduleTab() {
  const t = useT()

  const { profile, session } = useAuth()
  const todayIso = toIsoDate(new Date())
  const weekStart = useMemo(() => startOfWeek(new Date()), [])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const [selectedIso, setSelectedIso] = useState(todayIso)

  const employeeGuid =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''

  const range = useMemo(
    () => ({ from: toIsoDate(weekDays[0]), to: toIsoDate(weekDays[6]) }),
    [weekDays],
  )

  const { data: shifts = [] } = useQuery({
    queryKey: ['my-shifts-schedule', employeeGuid, range.from, range.to],
    queryFn: () => shiftsService.getMine(employeeGuid, range),
    enabled: Boolean(employeeGuid),
    staleTime: 60_000,
  })

  const { data: holidays = [] } = useQuery({
    queryKey: ['my-schedule-holidays', employeeGuid, range.from, range.to],
    queryFn: () =>
      getAgendaHolidays({ userBaseId: employeeGuid, dateFrom: range.from, dateTo: range.to }),
    enabled: Boolean(employeeGuid),
    staleTime: 30 * 60 * 1000,
  })

  /**
   * Нерабочие дни недели и подпись к ним — то же правило, что в гриде
   * планировщика: выходные из календаря, поверх производственный календарь.
   * Перенос рабочего дня снимает выходной с субботы, праздник ставит его на
   * будний день.
   */
  const offDayByDate = useMemo(() => {
    const map = new Map<string, string>()
    for (const date of weekDays) {
      if (isWeekend(date)) map.set(toIsoDate(date), tr('events.weekend'))
    }
    for (const holiday of holidays) {
      if (holiday.isWorkdayTransfer) map.delete(holiday.date)
      else map.set(holiday.date, holiday.title)
    }
    return map
  }, [weekDays, holidays])

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftRecord[]>()
    for (const shift of shifts) {
      if (!shift.date) continue
      const bucket = map.get(shift.date) || []
      bucket.push(shift)
      map.set(shift.date, bucket)
    }
    return map
  }, [shifts])

  const totalHours = useMemo(() => shifts.reduce((sum, s) => sum + shiftHours(s), 0), [shifts])

  const displayName = getDisplayName(profile)
  const initials = getInitials(profile)
  const avatar =
    (typeof profile?.photo === 'string' && profile.photo.trim()) ||
    (typeof profile?.avatar === 'string' && profile.avatar.trim()) || ''

  return (
    <div className="animate-fade-in-up flex flex-col gap-4 pb-4">
      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((date, idx) => {
          const iso = toIsoDate(date)
          const isSelected = iso === selectedIso
          const dayShift = (shiftsByDate.get(iso) || [])[0]
          const dotMeta = SHIFT_KIND_META[dayShift ? shiftKind(dayShift) : 'off']
          const dayOff = offDayByDate.get(iso)
          return (
            <button
              key={iso}
              type="button"
              title={dayOff}
              onClick={() => setSelectedIso(iso)}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors ${
                isSelected
                  ? 'bg-[var(--accent)] text-white'
                  : dayOff
                    ? 'border border-rose-200 bg-rose-50/60 text-rose-500'
                    : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text-main)]'
              }`}
            >
              <span
                className={`text-[10px] font-bold ${
                  isSelected ? 'text-white/70' : dayOff ? 'text-rose-400' : 'text-[var(--text-muted)]'
                }`}
              >
                {weekdayNames(getLang())[idx].toUpperCase()}
              </span>
              <span className="text-[15px] font-extrabold">{date.getDate()}</span>
              {/* Точка — цвет вида смены, тот же, что в легенде планировщика. */}
              <span
                className="h-1 w-1 rounded-full"
                style={{ backgroundColor: isSelected ? '#fff' : dotMeta.color }}
              />
            </button>
          )
        })}
      </div>

      {/* Week list */}
      <div className="flex flex-col gap-2.5">
        {weekDays.map((date) => {
          const iso = toIsoDate(date)
          const dayShifts = shiftsByDate.get(iso) || []
          const isPast = iso < todayIso
          const dayOff = offDayByDate.get(iso)

          return (
            <div key={iso} className="flex flex-col gap-2">
              <div
                className={`flex items-center justify-between gap-2 rounded-xl px-3.5 py-2 ${
                  dayOff ? 'bg-rose-50' : 'bg-[var(--surface-muted)]'
                }`}
              >
                <span
                  className={`text-[11px] font-bold tracking-wide ${
                    dayOff ? 'text-rose-500' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {formatDayHeader(date)}
                </span>
                {/* Название праздника важнее слова «Выходной»: суббота и так
                    видна по дате, а 8 марта — нет. */}
                {dayOff && dayOff !== tr('events.weekend') && (
                  <span className="shrink-0 text-[11px] font-bold text-rose-500">{dayOff}</span>
                )}
              </div>

              {dayShifts.length === 0 ? (
                // Дня без смены не бывает: не работает — значит выходной.
                <div
                  className="rounded-2xl border border-l-4 px-4 py-3.5 text-center text-[13px] font-bold"
                  style={{
                    borderColor: SHIFT_KIND_META.off.color,
                    backgroundColor: SHIFT_KIND_META.off.soft,
                    color: SHIFT_KIND_META.off.color,
                  }}
                >
                  {SHIFT_KIND_META.off.label}
                </div>
              ) : (
                dayShifts.map((shift) => {
                  const place = shift.locations_id_data?.title || ''
                  const position = shift.positions_id_data?.title || ''
                  const meta = [
                    displayName,
                    place && t('schedule.at', { place }),
                    position && t('schedule.as', { position }),
                  ]
                    .filter(Boolean)
                    .join(' ')
                  const kindMeta = SHIFT_KIND_META[shiftKind(shift)]
                  return (
                    <div
                      key={shift.guid}
                      className={`flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] border-l-4 px-3.5 py-3 ${
                        isPast ? 'opacity-60' : ''
                      }`}
                      style={{ borderLeftColor: kindMeta.color }}
                    >
                      <div className="w-10 h-10 shrink-0 rounded-full overflow-hidden border border-[var(--line)] bg-[var(--surface-muted)] flex items-center justify-center text-[12px] font-extrabold text-[var(--text-main)]">
                        {avatar ? (
                          <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[14px] font-bold text-[var(--text-main)]">
                          {formatShiftRange(shift)}
                        </p>
                        <p className="m-0 mt-0.5 text-[12px] text-[var(--text-secondary)] truncate">
                          {meta}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold"
                        style={{ backgroundColor: kindMeta.soft, color: kindMeta.color }}
                      >
                        {t(kindMeta.label)}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between rounded-2xl bg-[var(--surface-muted)] px-4 py-3.5">
        <span className="text-[14px] font-bold text-[var(--text-main)]">{t('schedule.totalHours')}</span>
        <span className="text-[16px] font-extrabold text-[var(--text-main)]">{totalHours.toFixed(2)}</span>
      </div>
    </div>
  )
}
