import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import {
  reportsService,
  type MyTask,
  type MyTasksResponse,
  type TaskDeadlineViewBucket,
} from '../api/reportsService'
import { TaskDetailSheet } from './tasks/TaskDetailSheet'
import { KanbanBoard, type KanbanColumn } from './tasks/KanbanBoard'
import { takePendingTaskId } from '../telegram/startParam'

type ViewMode = 'status' | 'deadline'

const VIEW_TABS: Array<{ key: ViewMode; label: string; icon: string }> = [
  { key: 'status', label: 'Доска', icon: 'mdi:view-column-outline' },
  { key: 'deadline', label: 'По срокам', icon: 'mdi:calendar-clock-outline' },
]

const NO_STATUS_KEY = 'no-status'

/** Оформление групп «по срокам»: просрочка тревожная, сегодня — внимание,
 * остальное спокойное. */
const DEADLINE_GROUP_TONE: Record<
  TaskDeadlineViewBucket,
  { icon: string; accent: string }
> = {
  overdue: { icon: 'mdi:fire', accent: '#e11d48' },
  today: { icon: 'mdi:calendar-today', accent: '#d97706' },
  week: { icon: 'mdi:calendar-week', accent: '#3b82f6' },
  rest: { icon: 'mdi:calendar-blank-outline', accent: '#8896a8' },
}

/** Локальное применение переноса: карточка мгновенно оказывается в новой
 * колонке, не дожидаясь сервера (сервер потом подтверждает рефетчем). */
const applyLocalMove = (
  data: MyTasksResponse,
  taskId: string,
  statusId: string,
): MyTasksResponse => {
  const status = data.statuses.find((option) => option.id === statusId)
  if (!status) return data
  return {
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            statusId: status.id,
            statusTitle: status.title,
            statusColor: status.color,
            statusGroup: status.group,
          }
        : task,
    ),
    views: {
      ...data.views,
      by_status: data.views.by_status.map((column) => {
        const without = column.taskIds.filter((id) => id !== taskId)
        const ids = column.statusId === statusId ? [...without, taskId] : without
        return { ...column, taskIds: ids, count: ids.length }
      }),
    },
  }
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: number
  icon: string
  tone: 'neutral' | 'accent' | 'danger'
}) {
  // Подложка иконки — не готовый светлый пастель, а прозрачная подмешка самого
  // тона: так плитка остаётся читаемой и на белой карточке, и на тёмной.
  const palette = {
    neutral: { bg: 'var(--surface-sunken)', color: 'var(--text-secondary)' },
    accent: { bg: 'var(--accent-light)', color: 'var(--accent)' },
    danger: { bg: 'color-mix(in srgb, #f43f5e 18%, transparent)', color: '#f43f5e' },
  }[tone]

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-black/[0.04] bg-[var(--surface)] px-2.5 py-2.5 shadow-[0_1px_2px_rgba(12,26,46,0.05)]">
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: palette.bg, color: palette.color }}
      >
        <Icon icon={icon} width={15} />
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[16px] font-extrabold leading-tight text-[var(--text-main)]">
          {value}
        </p>
        <p className="m-0 text-[9.5px] font-semibold leading-tight text-[var(--text-muted)]">
          {label}
        </p>
      </div>
    </div>
  )
}

export function TasksPage() {
  const { session, profile } = useAuth()
  const queryClient = useQueryClient()
  const [view, setView] = useState<ViewMode>('status')
  // Задача из Telegram-уведомления. Забираем на первом рендере, а не в
  // эффекте: эффект дал бы лишний цикл рендера, а шторка и так показывает
  // пустоту, пока список задач не приехал (`if (!task) return null`).
  // Ссылка одноразовая — иначе шторка открывалась бы при каждом возврате.
  const [pendingTaskId] = useState(takePendingTaskId)
  // Храним id, а не сам объект: после правки список перезапрашивается, и
  // карточка должна показать свежую задачу, а не снимок на момент открытия.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(pendingTaskId)
  const [sheetOpen, setSheetOpen] = useState(pendingTaskId !== null)
  const [toast, setToast] = useState('')
  const toastTimerRef = useRef<number | null>(null)

  const showToast = (message: string) => {
    setToast(message)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3000)
  }

  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    },
    [],
  )

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

  const queryKey = useMemo(() => ['my-tasks', employeeGuid] as const, [employeeGuid])

  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => reportsService.getMyTasks(employeeGuid),
    enabled: Boolean(employeeGuid),
  })

  const moveMutation = useMutation({
    mutationFn: ({ taskId, statusId }: { taskId: string; statusId: string }) =>
      reportsService.moveTask(taskId, statusId, employeeGuid),
    onMutate: async ({ taskId, statusId }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<MyTasksResponse>(queryKey)
      if (previous) {
        queryClient.setQueryData(queryKey, applyLocalMove(previous, taskId, statusId))
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      showToast('Не удалось переместить задачу')
    },
    // Рефетч в любом случае: сервер при смене статуса двигает ещё и даты
    // (begin_at/completed_at), их локально не предскажешь.
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
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
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center">
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
      <div className="flex min-h-0 flex-1 flex-col gap-3.5">
        <div className="h-[42px] animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-[58px] animate-pulse rounded-2xl bg-gray-200/70" />
          ))}
        </div>
        {/* Скелет повторяет форму доски — экран не «перепрыгивает» при загрузке. */}
        <div className="flex min-h-0 flex-1 gap-2.5">
          <div className="flex h-full w-[84%] shrink-0 flex-col gap-2 rounded-2xl bg-gray-200/50 p-2 pt-12">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-[104px] animate-pulse rounded-2xl bg-[var(--surface)]/80" />
            ))}
          </div>
          <div className="h-full flex-1 rounded-l-2xl bg-gray-200/50" />
        </div>
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
              className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--error-line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-bold text-[var(--error-text)] active:scale-95"
            >
              <Icon icon="mdi:refresh" width={13} />
              Повторить
            </button>
          </div>
        </div>
      </div>
    )
  }

  const boardColumns: KanbanColumn[] = (data?.views?.by_status ?? []).map((column) => ({
    key: column.statusId || NO_STATUS_KEY,
    title: column.title || 'Без статуса',
    accent: column.color || undefined,
    tasks: pickTasks(column.taskIds),
    droppable: Boolean(column.statusId),
  }))

  // «По срокам» — та же доска, только колонка = срок и переносить нельзя:
  // задача меняет срок через дедлайн в карточке, а не перетаскиванием.
  const deadlineColumns: KanbanColumn[] = (data?.views?.by_deadline ?? [])
    .map((group) => {
      const tone = DEADLINE_GROUP_TONE[group.key] || DEADLINE_GROUP_TONE.rest
      return {
        key: group.key,
        title: group.label,
        icon: tone.icon,
        accent: tone.accent,
        tasks: pickTasks(group.taskIds),
        droppable: false,
      }
    })
    // Пустую «Просрочено» скрываем: тревожная колонка, пустующая каждый день,
    // обесценивает сама себя. Остальные сроки — часть картины, пусть будут.
    .filter((column) => column.key !== 'overdue' || column.tasks.length > 0)

  const handleMove = (task: MyTask, columnKey: string) => {
    if (columnKey === NO_STATUS_KEY) return
    moveMutation.mutate({ taskId: task.id, statusId: columnKey })
  }

  return (
    // min-h-0 + flex-1: доска забирает остаток высоты экрана, иначе колонки
    // растянули бы страницу и скроллилась бы она целиком, а не колонка.
    <div className="animate-fade-in-up flex min-h-0 flex-1 flex-col gap-3">
      {/* Сегмент-контрол вида */}
      <div className="flex shrink-0 rounded-2xl bg-[var(--surface-sunken)] p-1">
        {VIEW_TABS.map((tab) => {
          const isActive = tab.key === view
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={`flex-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-0 px-3 py-2 text-[12.5px] font-bold transition-all ${
                isActive
                  ? 'bg-[var(--surface)] text-[var(--text-main)] shadow-[0_1px_4px_rgba(12,26,46,0.10)]'
                  : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              <Icon
                icon={tab.icon}
                width={15}
                className={isActive ? 'text-[var(--accent)]' : undefined}
              />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Сводка */}
      <section className="grid shrink-0 grid-cols-3 gap-2">
        <StatTile label="Всего" value={total} icon="mdi:format-list-checks" tone="neutral" />
        {/* Незавершённые целиком, а не только группа «В работе» — иначе
            подпись расходилась бы с числом. */}
        <StatTile label="Активные" value={openCount} icon="mdi:progress-clock" tone="accent" />
        <StatTile
          label="Просрочено"
          value={overdueCount}
          icon="mdi:fire"
          tone={overdueCount > 0 ? 'danger' : 'neutral'}
        />
      </section>

      {total === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-10 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
            <Icon
              icon="mdi:checkbox-marked-circle-outline"
              width={26}
              className="text-[var(--accent)]"
            />
          </div>
          <p className="m-0 text-[14.5px] font-bold text-[var(--text-main)]">Задач нет</p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">
            На вас пока не назначено ни одной задачи.
          </p>
        </div>
      ) : view === 'status' ? (
        <KanbanBoard
          columns={boardColumns}
          onOpenTask={openTask}
          onMoveTask={handleMove}
          moveDisabled={moveMutation.isPending}
        />
      ) : (
        <KanbanBoard
          key="deadline"
          columns={deadlineColumns}
          onOpenTask={openTask}
          draggable={false}
          showCardStatus
        />
      )}

      {isFetching && !moveMutation.isPending ? (
        <p className="m-0 shrink-0 text-center text-[11px] text-[var(--text-muted)]">Обновляем…</p>
      ) : null}

      {/* Тост об ошибке переноса — поверх таббара, в границах мобильной колонки. */}
      {toast ? (
        <div className="pointer-events-none fixed bottom-[96px] left-1/2 z-50 -translate-x-1/2">
          <p className="m-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#1c2434] px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-lg">
            <Icon icon="mdi:alert-circle-outline" width={15} className="text-rose-400" />
            {toast}
          </p>
        </div>
      ) : null}

      <TaskDetailSheet
        task={selectedTaskId ? (tasksById.get(selectedTaskId) ?? null) : null}
        statuses={data?.statuses ?? []}
        directories={
          data?.directories ?? {
            types: [],
            priorities: [],
            tags: [],
            sheets: [],
            locations: [],
            employees: [],
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
