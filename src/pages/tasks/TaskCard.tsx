import { Icon } from '@iconify/react'
import type { MyTask } from '../../api/reportsService'

/**
 * Карточка задачи — общая для канбана и списка «по срокам».
 *
 * В канбане статус-чип не показываем: колонка и есть статус, чип лишь дублировал
 * бы заголовок колонки на каждой карточке. В списке по срокам статус наоборот
 * важен — там его включает `showStatus`.
 */

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '—'

const formatDeadline = (iso: string): string => {
  const parsed = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

/** Пилюля срока: цвет = срочность. Для завершённых срок уже не тревога. */
const deadlinePill = (
  task: MyTask,
): { text: string; className: string; icon: string } | null => {
  if (task.statusGroup === 'completed') {
    return {
      text: 'Завершена',
      icon: 'mdi:check-circle-outline',
      className: 'bg-emerald-50 text-emerald-600',
    }
  }
  if (!task.deadline) return null
  const days = task.daysLeft
  if (days != null && days < 0) {
    return {
      text: `${Math.abs(days)} дн. просрочки`,
      icon: 'mdi:fire',
      className: 'bg-rose-50 text-rose-600',
    }
  }
  if (days === 0) {
    return { text: 'Сегодня', icon: 'mdi:clock-alert-outline', className: 'bg-amber-50 text-amber-600' }
  }
  if (days === 1) {
    return { text: 'Завтра', icon: 'mdi:clock-outline', className: 'bg-amber-50 text-amber-600' }
  }
  return {
    text: formatDeadline(task.deadline),
    icon: 'mdi:calendar-blank-outline',
    className: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
  }
}

function AvatarStack({ task }: { task: MyTask }) {
  const people = task.assignees.slice(0, 3)
  const rest = task.assignees.length - people.length
  if (people.length === 0) return null
  return (
    <span className="flex shrink-0 items-center -space-x-1.5">
      {people.map((person) =>
        person.photo ? (
          <img
            key={person.id}
            src={person.photo}
            alt={person.name}
            className="h-[22px] w-[22px] rounded-full border-2 border-white object-cover"
          />
        ) : (
          <span
            key={person.id}
            className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-[var(--accent)] text-[8px] font-bold text-white"
          >
            {initials(person.name)}
          </span>
        ),
      )}
      {rest > 0 ? (
        <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[9px] font-bold text-gray-600">
          +{rest}
        </span>
      ) : null}
    </span>
  )
}

export interface TaskCardProps {
  task: MyTask
  onOpen?: (task: MyTask) => void
  showStatus?: boolean
  /** true для карточки в DragOverlay — она не интерактивна. */
  overlay?: boolean
  /** Роль кнопки берёт на себя обёртка (draggable в канбане) — не дублируем. */
  plain?: boolean
}

export function TaskCard({ task, onOpen, showStatus, overlay, plain }: TaskCardProps) {
  const pill = deadlinePill(task)
  const doneCount = task.checklist.filter((item) => item.done).length
  const checklistDone = task.checklist.length > 0 && doneCount === task.checklist.length
  const shownTags = task.tags.slice(0, 2)

  const interactive = !overlay && !plain

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={overlay ? undefined : () => onOpen?.(task)}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen?.(task)
              }
            }
          : undefined
      }
      className={`kanban-card w-full cursor-pointer rounded-2xl border border-black/[0.04] bg-[var(--surface)] p-3 text-left shadow-[0_1px_2px_rgba(12,26,46,0.06)] ${
        overlay ? '' : 'transition-transform active:scale-[0.985]'
      }`}
    >
      {/* Код + приоритет: служебная строка над названием, как в трекерах. */}
      {(task.code || task.priorityTitle) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-bold tracking-wide text-[var(--text-muted)]">
            {task.code}
          </span>
          {task.priorityTitle ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-bold"
              style={{ color: task.priorityColor || 'var(--text-muted)' }}
            >
              <Icon icon="mdi:flag-variant" width={11} />
              {task.priorityTitle}
            </span>
          ) : null}
        </div>
      )}

      <p className="m-0 line-clamp-2 text-[13.5px] font-bold leading-snug text-[var(--text-main)]">
        {task.title || 'Без названия'}
      </p>

      {(showStatus || task.typeTitle || shownTags.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {showStatus ? (
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold"
              style={{
                background: task.statusColor ? `${task.statusColor}1A` : 'var(--surface-sunken)',
                color: task.statusColor || 'var(--text-secondary)',
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: task.statusColor || 'var(--text-muted)' }}
              />
              {task.statusTitle}
            </span>
          ) : null}
          {task.typeTitle ? (
            <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-500">
              {task.typeTitle}
            </span>
          ) : null}
          {shownTags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{
                background: tag.color ? `${tag.color}1A` : 'var(--surface-sunken)',
                color: tag.color || 'var(--text-secondary)',
              }}
            >
              {tag.title}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {pill ? (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${pill.className}`}
            >
              <Icon icon={pill.icon} width={11} />
              {pill.text}
            </span>
          ) : null}
          {task.checklist.length > 0 ? (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                checklistDone ? 'text-emerald-600' : 'text-[var(--text-muted)]'
              }`}
            >
              <Icon icon="mdi:checkbox-marked-outline" width={12} />
              {doneCount}/{task.checklist.length}
            </span>
          ) : null}
          {task.commentCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
              <Icon icon="mdi:comment-outline" width={12} />
              {task.commentCount}
            </span>
          ) : null}
          {task.attachments.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
              <Icon icon="mdi:paperclip" width={12} />
              {task.attachments.length}
            </span>
          ) : null}
        </div>
        <AvatarStack task={task} />
      </div>
    </div>
  )
}
