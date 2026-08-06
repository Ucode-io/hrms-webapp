import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import {
  reportsService,
  type MyTask,
  type MyTaskDeadlineGroup,
  type MyTaskStatusColumn,
  type TaskDeadlineViewBucket,
  type TaskStatusGroup,
} from '../api/reportsService'
import { TaskDetailSheet } from './tasks/TaskDetailSheet'

type ViewMode = 'status' | 'deadline'

const VIEW_TABS: Array<{ key: ViewMode; label: string; icon: string }> = [
  { key: 'status', label: 'По статусам', icon: 'mdi:view-column-outline' },
  { key: 'deadline', label: 'По срокам', icon: 'mdi:calendar-clock-outline' },
]

const STATUS_GROUP_TONE: Record<TaskStatusGroup, { chip: string; dot: string }> = {
  todo: { chip: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  in_progress: { chip: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  completed: { chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
}

const DEADLINE_GROUP_ICON: Record<string, string> = {
  overdue: 'mdi:alert-circle-outline',
  today: 'mdi:calendar-today',
  week: 'mdi:calendar-week',
  rest: 'mdi:calendar-blank-outline',
}

/** Просрочка — единственная группа с цветовым акцентом: на неё и надо смотреть. */
const DEADLINE_GROUP_ACCENT: Partial<Record<TaskDeadlineViewBucket, string>> = {
  overdue: '#f43f5e',
}

const formatDeadline = (iso: string | null): string => {
  if (!iso) return 'Без срока'
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return 'Без срока'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

/** Подпись про срок. Для завершённых дедлайн уже не наступает — не пугаем
 * пользователя красной «просрочкой» на закрытой задаче. */
const describeDeadline = (task: MyTask): { text: string; tone: string } => {
  if (task.statusGroup === 'completed') {
    return { text: 'Завершена', tone: 'text-emerald-600' }
  }
  if (!task.deadline) return { text: 'Без срока', tone: 'text-[var(--text-muted)]' }

  const days = task.daysLeft
  if (days == null) return { text: formatDeadline(task.deadline), tone: 'text-[var(--text-muted)]' }
  if (days < 0) {
    const overdue = Math.abs(days)
    return { text: `Просрочено на ${overdue} дн.`, tone: 'text-rose-600' }
  }
  if (days === 0) return { text: 'Сегодня', tone: 'text-amber-600' }
  if (days === 1) return { text: 'Завтра', tone: 'text-amber-600' }
  return { text: formatDeadline(task.deadline), tone: 'text-[var(--text-muted)]' }
}

interface TaskCardProps {
  task: MyTask
  onOpen: (task: MyTask) => void
}

function TaskCard({ task, onOpen }: TaskCardProps) {
  const tone = STATUS_GROUP_TONE[task.statusGroup] || STATUS_GROUP_TONE.todo
  const deadline = describeDeadline(task)
  const doneCount = task.checklist.filter((item) => item.done).length

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="w-full cursor-pointer rounded-2xl border border-[var(--line)] bg-white px-3.5 py-3 text-left transition-transform active:scale-[0.99] active:bg-gray-50"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
          style={task.statusColor ? { background: task.statusColor } : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-[14px] font-bold leading-snug text-[var(--text-main)] break-words">
              {task.title || 'Без названия'}
            </p>
            {task.code ? (
              <span className="shrink-0 text-[10.5px] font-bold text-[var(--text-muted)]">
                {task.code}
              </span>
            ) : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${tone.chip}`}
            >
              {task.statusTitle}
            </span>
            {task.priorityTitle ? (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
                style={{
                  background: task.priorityColor ? `${task.priorityColor}1A` : '#f3f4f6',
                  color: task.priorityColor || '#4b5563',
                }}
              >
                <Icon icon="mdi:flag-outline" width={10} />
                {task.priorityTitle}
              </span>
            ) : null}
            {task.typeTitle ? (
              <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-600">
                {task.typeTitle}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${deadline.tone}`}>
              <Icon icon="mdi:clock-outline" width={12} />
              {deadline.text}
            </span>
            {task.checklist.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
                <Icon icon="mdi:checkbox-marked-outline" width={12} />
                {doneCount}/{task.checklist.length}
              </span>
            ) : null}
            {task.commentCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-muted)]">
                <Icon icon="mdi:comment-outline" width={12} />
                {task.commentCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}

interface TaskGroupProps {
  title: string
  count: number
  icon: string
  accent?: string
  tasks: MyTask[]
  defaultOpen: boolean
  onOpenTask: (task: MyTask) => void
}

function TaskGroup({
  title,
  count,
  icon,
  accent,
  tasks,
  defaultOpen,
  onOpenTask,
}: TaskGroupProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-xl border-0 bg-transparent px-1 py-0.5 text-left cursor-pointer"
      >
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]"
          style={accent ? { background: `${accent}1A`, color: accent } : undefined}
        >
          <Icon icon={icon} width={13} />
        </span>
        <p className="m-0 truncate text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--text-main)]">
          {title}
        </p>
        <span className="ml-auto shrink-0 text-[11px] font-bold text-[var(--text-muted)]">
          {count}
        </span>
        <Icon
          icon="mdi:chevron-down"
          width={16}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open ? (
        tasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-2xl border border-dashed border-[var(--line)] bg-white px-3 py-4 text-center text-[12px] text-[var(--text-muted)]">
            Задач нет
          </p>
        )
      ) : null}
    </section>
  )
}

export function TasksPage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()
  const [view, setView] = useState<ViewMode>('status')
  // Храним id, а не сам объект: после правки список перезапрашивается, и
  // карточка должна показать свежую задачу, а не снимок на момент открытия.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const openTask = (task: MyTask) => {
    setSelectedTaskId(task.id)
    setSheetOpen(true)
  }

  const closeTask = () => {
    setSheetOpen(false)
    // Данные держим до конца анимации закрытия, иначе шторка «схлопывается» пустой.
    window.setTimeout(() => setSelectedTaskId(null), 250)
  }

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session],
  )

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['my-tasks', employeeGuid],
    queryFn: () => reportsService.getMyTasks(employeeGuid),
    enabled: Boolean(employeeGuid),
  })

  const tasks = useMemo(() => data?.tasks ?? [], [data])

  const tasksById = useMemo(() => {
    const map = new Map<string, MyTask>()
    for (const task of tasks) map.set(task.id, task)
    return map
  }, [tasks])

  const pickTasks = (ids: string[]): MyTask[] =>
    (ids || []).map((id) => tasksById.get(id)).filter((task): task is MyTask => Boolean(task))

  const total = tasks.length
  const openCount = useMemo(
    () => tasks.filter((task) => task.statusGroup !== 'completed').length,
    [tasks],
  )
  const overdueCount = useMemo(
    () => tasks.filter((task) => task.deadlineBucket === 'overdue').length,
    [tasks],
  )

  if (!employeeGuid) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-10 text-center">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
          <Icon icon="mdi:account-question-outline" width={26} className="text-[var(--accent)]" />
        </div>
        <p className="m-0 text-[15px] font-bold text-[var(--text-main)]">Сотрудник не определён</p>
        <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">
          Не удалось определить ваш профиль для загрузки задач.
        </p>
      </div>
    )
  }

  // Именно `isPending`, а не `isLoading`: между попытками ретрая `isLoading`
  // уже false, а данных ещё нет — на `isLoading` экран проваливался бы вниз и
  // показывал «Задач нет», хотя запрос ещё выполняется.
  if (isPending) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-[96px] animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-4">
        <div className="flex items-start gap-2.5">
          <Icon
            icon="mdi:alert-circle-outline"
            width={20}
            className="mt-0.5 shrink-0 text-[var(--error-text)]"
          />
          <div className="flex-1">
            <p className="m-0 text-[13.5px] font-bold text-[var(--error-text)]">
              Не удалось загрузить задачи
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--error-line)] bg-white px-3 py-1.5 text-[12px] font-bold text-[var(--error-text)] active:scale-95"
            >
              <Icon icon="mdi:refresh" width={13} />
              Повторить
            </button>
          </div>
        </div>
      </div>
    )
  }

  const statusColumns: MyTaskStatusColumn[] = data?.views?.by_status ?? []
  const deadlineGroups: MyTaskDeadlineGroup[] = data?.views?.by_deadline ?? []

  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5">
      {/* View switcher */}
      <div className="flex gap-1.5">
        {VIEW_TABS.map((tab) => {
          const isActive = tab.key === view
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-bold transition-all active:scale-95 ${
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-[var(--line)] bg-white text-[var(--text-secondary)]'
              }`}
              style={isActive ? { background: company.mainColor } : undefined}
            >
              <Icon icon={tab.icon} width={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
          <p className="m-0 text-[10.5px] font-semibold text-[var(--text-muted)]">Всего</p>
          <p className="m-0 mt-1 text-[18px] font-extrabold text-[var(--text-main)]">{total}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
          {/* Незавершённые целиком, а не только группа «В работе» — иначе
              подпись расходилась бы с числом. */}
          <p className="m-0 text-[10.5px] font-semibold text-[var(--text-muted)]">Активные</p>
          <p className="m-0 mt-1 text-[18px] font-extrabold text-[var(--text-main)]">{openCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
          <p className="m-0 text-[10.5px] font-semibold text-[var(--text-muted)]">Просрочено</p>
          <p
            className={`m-0 mt-1 text-[18px] font-extrabold ${
              overdueCount > 0 ? 'text-rose-600' : 'text-[var(--text-main)]'
            }`}
          >
            {overdueCount}
          </p>
        </div>
      </section>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-10 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
            <Icon icon="mdi:checkbox-marked-circle-outline" width={26} className="text-[var(--accent)]" />
          </div>
          <p className="m-0 text-[14.5px] font-bold text-[var(--text-main)]">Задач нет</p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">
            На вас пока не назначено ни одной задачи.
          </p>
        </div>
      ) : view === 'status' ? (
        <div className="flex flex-col gap-3.5">
          {statusColumns
            .map((column) => ({ column, items: pickTasks(column.taskIds) }))
            // Пустые статусы прячем: справочник компании может быть длинным,
            // а сотруднику важны только те колонки, где реально есть его
            // задачи. Считаем по разрешённым задачам, а не по `count` из
            // ответа — так строка не появится пустой, если счётчик разойдётся.
            .filter(({ items }) => items.length > 0)
            .map(({ column, items }) => (
              <TaskGroup
                key={column.statusId || 'no-status'}
                title={column.title || 'Без статуса'}
                count={items.length}
                icon="mdi:circle-medium"
                accent={column.color || undefined}
                tasks={items}
                defaultOpen={column.group !== 'completed'}
                onOpenTask={openTask}
              />
            ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {deadlineGroups.map((group) => {
            const items = pickTasks(group.taskIds)
            // «Просрочено» без просрочек не показываем — пустая тревожная
            // строка каждый день обесценивает саму группу. Остальные группы
            // видны всегда: «Сегодня: 0» — это полезный ответ.
            if (group.key === 'overdue' && items.length === 0) return null
            return (
              <TaskGroup
                key={group.key}
                title={group.label}
                count={items.length}
                icon={DEADLINE_GROUP_ICON[group.key] || 'mdi:calendar-blank-outline'}
                accent={DEADLINE_GROUP_ACCENT[group.key]}
                tasks={items}
                defaultOpen={group.key !== 'rest'}
                onOpenTask={openTask}
              />
            )
          })}
        </div>
      )}

      {isFetching ? (
        <p className="m-0 text-center text-[11.5px] text-[var(--text-muted)]">Обновляем…</p>
      ) : null}

      <TaskDetailSheet
        task={selectedTaskId ? tasksById.get(selectedTaskId) ?? null : null}
        statuses={data?.statuses ?? []}
        employeeId={employeeGuid}
        open={sheetOpen}
        onClose={closeTask}
        onChanged={() => void refetch()}
      />
    </div>
  )
}
