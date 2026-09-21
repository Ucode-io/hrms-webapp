import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useT, type TKey, formatDateLocal } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { reportsService, type MyTask } from '../api/reportsService'
import {
  PeriodCalendar,
  getViewRange,
  toIsoDate,
  type CalendarView,
} from '../components/PeriodCalendar'
import { TaskDetailSheet } from './tasks/TaskDetailSheet'

/** Дедлайн приходит датой или датой-временем — для календаря нужен только день. */
const deadlineIso = (task: MyTask): string | null => {
  if (!task.deadline) return null
  const parsed = new Date(task.deadline)
  if (Number.isNaN(parsed.getTime())) return null
  return toIsoDate(parsed)
}

const formatShortDate = (iso: string): string => {
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDateLocal(parsed, { day: 'numeric', month: 'short' }).replace('.', '')
}

const SECTION_TITLE: Record<CalendarView, TKey> = {
  month: 'cal.monthDeadlines',
  week: 'cal.weekTasks',
  day: 'cal.dayTasks',
}

export function TasksCalendarPage() {
  const t = useT()

  const { session, profile } = useAuth()
  const { company } = useCompany()
  const accentColor = company.mainColor || '#3b6cf5'

  const [view, setView] = useState<CalendarView>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session],
  )

  // Тот же ключ, что и на доске задач: календарь — второй разрез одних и тех
  // же данных, отдельный запрос ему не нужен.
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['my-tasks', employeeGuid] as const,
    queryFn: () => reportsService.getMyTasks(employeeGuid),
    enabled: Boolean(employeeGuid),
  })

  const tasks = useMemo(() => data?.tasks ?? [], [data])

  const markedDates = useMemo(() => {
    const dates = new Set<string>()
    for (const task of tasks) {
      const iso = deadlineIso(task)
      if (iso) dates.add(iso)
    }
    return dates
  }, [tasks])

  const range = useMemo(() => getViewRange(cursor, view), [cursor, view])

  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        const iso = deadlineIso(task)
        return Boolean(iso && iso >= range.from && iso <= range.to)
      })
      .sort((a, b) => (deadlineIso(a) || '').localeCompare(deadlineIso(b) || ''))
  }, [tasks, range])

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) || null,
    [tasks, selectedTaskId],
  )

  const closeTask = () => {
    setSheetOpen(false)
    // Данные держим до конца анимации закрытия, иначе шторка «схлопывается» пустой.
    window.setTimeout(() => setSelectedTaskId(null), 250)
  }

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

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[68px] animate-pulse rounded-2xl bg-[var(--surface)]" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-4 text-center">
          <p className="m-0 text-[13.5px] font-bold text-[var(--error-text)]">
            {t('tasks.loadFailed')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--error-line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-bold text-[var(--error-text)] active:scale-95"
          >
            <Icon icon="mdi:refresh" width={13} />
            {t('events.repeat')}
          </button>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center">
          <Icon icon="mdi:calendar-check-outline" width={36} className="text-[var(--text-muted)] opacity-40" />
          <p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">
            {t('cal.noDeadlines')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visibleTasks.map((task) => {
            const iso = deadlineIso(task)
            const isOverdue = task.deadlineBucket === 'overdue'
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => {
                  setSelectedTaskId(task.id)
                  setSheetOpen(true)
                }}
                className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-left transition-transform active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[14px] font-bold text-[var(--text-main)]">
                    {task.title || t('tasks.noName')}
                  </p>
                  <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                    {[iso ? formatShortDate(iso) : null, task.sheet?.title || task.code]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {/* Просрочка важнее статуса: её и показываем, иначе — статус задачи. */}
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={
                    isOverdue
                      ? { background: 'color-mix(in srgb, #f43f5e 18%, transparent)', color: '#fb7185' }
                      : {
                          background: `color-mix(in srgb, ${task.statusColor || accentColor} 18%, transparent)`,
                          color: task.statusColor || accentColor,
                        }
                  }
                >
                  {isOverdue ? t('tasks.overdue') : task.statusTitle || t('tasks.noStatus')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <TaskDetailSheet
        task={selectedTask}
        statuses={data?.statuses ?? []}
        directories={
          data?.directories ?? {
            types: [], priorities: [], tags: [], sheets: [], locations: [], employees: [],
          }
        }
        parentCandidates={tasks}
        employeeId={employeeGuid}
        open={sheetOpen}
        onClose={closeTask}
        onChanged={() => void refetch()}
      />
    </div>
  )
}
