import { useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useT, type TKey, formatDateLocal, formatDateTimeLocal } from '../../i18n'
import {
  reportsService,
  type MyTask,
  type TaskAttachmentInput,
  type TaskDirectories,
  type TaskPatch,
  type TaskStatusGroup,
  type TaskStatusOption,
  type TaskSubtask,
} from '../../api/reportsService'
import { uploadFile } from '../../api/dashboardService'
import {
  DateField,
  EditableText,
  FieldRow,
  MultiSelectField,
  SelectField,
} from './FieldPickers'

interface TaskDetailSheetProps {
  task: MyTask | null
  statuses: TaskStatusOption[]
  directories: TaskDirectories
  /** Задачи сотрудника — кандидаты в «родителя». */
  parentCandidates: MyTask[]
  employeeId: string
  open: boolean
  onClose: () => void
  /** Дёргается после успешной правки — список наверху перезапрашивает себя. */
  onChanged: () => void
}

const STATUS_GROUP_LABEL: Record<TaskStatusGroup, TKey> = {
  todo: 'tasks.statusTodo',
  in_progress: 'tasks.statusInProgress',
  completed: 'tasks.statusCompleted',
}
const STATUS_GROUP_ORDER: TaskStatusGroup[] = ['todo', 'in_progress', 'completed']

const formatDate = (iso: string | null): string => {
  if (!iso) return '—'
  const parsed = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return '—'
  return formatDateLocal(parsed, { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return '—'
  return formatDateTimeLocal(parsed, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  // ponytail: KB/MB латиницей — единицы не переводим, так короче и понятно
  // на всех трёх языках.
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '—'

/**
 * Иконка и тон файла по типу — вложения перестают быть безликим списком.
 * Подложка не задаётся отдельной светлой константой, а подмешивается из самого
 * тона: иначе в тёмной теме плитки оставались пастельно-белыми. Заодно пара
 * «фон + цвет» больше не может разъехаться — фон выводится из цвета.
 */
const fileTone = (mime: string, name: string): { icon: string; color: string } => {
  const lower = (mime || '').toLowerCase()
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (lower.startsWith('image/')) return { icon: 'mdi:image-outline', color: '#0ea5e9' }
  if (lower.includes('pdf') || ext === 'pdf')
    return { icon: 'mdi:file-pdf-box', color: '#f43f5e' }
  if (lower.includes('zip') || ['zip', 'rar', '7z'].includes(ext))
    return { icon: 'mdi:folder-zip-outline', color: '#f59e0b' }
  if (['doc', 'docx'].includes(ext))
    return { icon: 'mdi:file-word-outline', color: '#3b82f6' }
  if (['xls', 'xlsx', 'csv'].includes(ext))
    return { icon: 'mdi:file-excel-outline', color: '#22c55e' }
  return { icon: 'mdi:file-outline', color: 'var(--text-secondary)' }
}

const fileVisual = (mime: string, name: string): { icon: string; bg: string; color: string } => {
  const tone = fileTone(mime, name)
  return {
    ...tone,
    bg:
      tone.color.startsWith('var(')
        ? 'var(--surface-sunken)'
        : `color-mix(in srgb, ${tone.color} 18%, transparent)`,
  }
}

/**
 * Описание приходит HTML'ом (в hrms-front его пишут в rich-text редакторе и там
 * же санитайзят). Санитайзера на мобилке нет, поэтому показываем текстом:
 * вставлять чужой HTML через dangerouslySetInnerHTML ради форматирования не
 * стоит риска XSS.
 */
const htmlToText = (html: string): string => {
  if (!html) return ''
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li\s*[^>]*>/gi, '• ')
  const el = document.createElement('div')
  el.innerHTML = withBreaks
  return (el.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {title}
        </p>
        {meta}
      </div>
      {children}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <span className="shrink-0 pt-0.5 text-[12.5px] font-medium text-[var(--text-muted)]">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-right">{children}</div>
    </div>
  )
}

const plain = (value: string) => (
  <span className="text-[12.5px] font-bold text-[var(--text-main)]">{value}</span>
)

function SubtaskRow({ subtask }: { subtask: TaskSubtask }) {
  const done = subtask.statusGroup === 'completed'
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5">
      <Icon
        icon={done ? 'mdi:check-circle' : 'mdi:circle-outline'}
        width={16}
        className="mt-0.5 shrink-0"
        style={{ color: done ? '#10b981' : subtask.statusColor || 'var(--text-muted)' }}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`m-0 text-[13px] font-semibold leading-snug ${
            done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-main)]'
          }`}
        >
          {subtask.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {subtask.code ? (
            <span className="text-[10.5px] font-bold text-[var(--text-muted)]">{subtask.code}</span>
          ) : null}
          <span className="text-[10.5px] font-semibold" style={{ color: subtask.statusColor || undefined }}>
            {subtask.statusTitle}
          </span>
          {subtask.deadline ? (
            <span className="text-[10.5px] text-[var(--text-muted)]">
              {formatDate(subtask.deadline)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function TaskDetailSheet({
  task,
  statuses,
  directories,
  parentCandidates,
  employeeId,
  open,
  onClose,
  onChanged,
}: TaskDetailSheetProps) {
  const t = useT()

  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [actionError, setActionError] = useState('')
  const [uploading, setUploading] = useState(false)

  const taskId = task?.id || ''

  const activityQuery = useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: () => reportsService.getTaskActivity(taskId),
    // Комментарии и история грузятся только когда карточка открыта: в списке
    // из них нужен лишь счётчик, он уже приходит с задачей.
    enabled: open && Boolean(taskId),
  })

  const afterChange = () => {
    setActionError('')
    onChanged()
    void queryClient.invalidateQueries({ queryKey: ['task-activity', taskId] })
  }

  const fail = (error: unknown) => {
    setActionError(error instanceof Error ? error.message : t('tasks.saveFailed'))
  }

  const statusMutation = useMutation({
    mutationFn: (statusId: string) => reportsService.moveTask(taskId, statusId, employeeId),
    onSuccess: () => {
      setStatusPickerOpen(false)
      afterChange()
    },
    onError: fail,
  })

  const checklistMutation = useMutation({
    mutationFn: (checklist: MyTask['checklist']) =>
      reportsService.patchTaskContent(taskId, { checklist }, employeeId),
    onSuccess: afterChange,
    onError: fail,
  })

  const attachmentsMutation = useMutation({
    mutationFn: (attachments: TaskAttachmentInput[]) =>
      reportsService.patchTaskContent(taskId, { attachments }, employeeId),
    onSuccess: afterChange,
    onError: fail,
  })

  const fieldMutation = useMutation({
    mutationFn: (patchBody: TaskPatch) =>
      reportsService.patchTaskContent(taskId, patchBody, employeeId),
    onSuccess: afterChange,
    onError: fail,
  })

  const commentMutation = useMutation({
    mutationFn: (text: string) => reportsService.addTaskComment(taskId, text, employeeId),
    onSuccess: () => {
      setCommentDraft('')
      afterChange()
    },
    onError: fail,
  })

  if (!task) return null

  const description = htmlToText(task.description)
  const doneCount = task.checklist.filter((item) => item.done).length
  const checklistPercent =
    task.checklist.length > 0 ? Math.round((doneCount / task.checklist.length) * 100) : 0
  const isCompleted = task.statusGroup === 'completed'
  const isOverdue = task.deadlineBucket === 'overdue'

  const toggleChecklistItem = (itemId: string) => {
    checklistMutation.mutate(
      task.checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
    )
  }

  const handleFilePicked = async (file: File | undefined) => {
    if (!file) return
    setActionError('')
    setUploading(true)
    try {
      const url = await uploadFile(file)
      // Патч — это замена набора целиком, поэтому новое вложение добавляем к
      // уже существующим, а не отправляем в одиночку.
      attachmentsMutation.mutate([
        ...task.attachments,
        {
          id: `att_${Date.now()}`,
          name: file.name,
          size: file.size,
          mime: file.type,
          url,
          uploadedById: employeeId || null,
          uploadedAt: new Date().toISOString(),
        },
      ])
    } catch (error) {
      fail(error)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (attachmentId: string) => {
    attachmentsMutation.mutate(task.attachments.filter((file) => file.id !== attachmentId))
  }

  const busy =
    statusMutation.isPending ||
    checklistMutation.isPending ||
    attachmentsMutation.isPending ||
    fieldMutation.isPending ||
    uploading

  /** Патчим ровно одно поле — сервер остальные не трогает. */
  const patch = (body: TaskPatch) => fieldMutation.mutate(body)

  const employeeOptions = directories.employees.map((person) => ({
    id: person.id,
    title: person.name,
  }))

  // Родителем может быть любая задача, кроме самой себя и собственных
  // подзадач — иначе получилось бы кольцо (сервер это тоже проверяет).
  const subtaskIds = new Set(task.subtasks.map((sub) => sub.id))
  const parentOptions = parentCandidates
    .filter((candidate) => candidate.id !== task.id && !subtaskIds.has(candidate.id))
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.code ? `${candidate.code} · ${candidate.title}` : candidate.title,
    }))

  // Статусы в пикере группируем по стадиям — видно, куда движется задача.
  const statusGroups = STATUS_GROUP_ORDER.map((group) => ({
    group,
    label: t(STATUS_GROUP_LABEL[group]),
    options: statuses.filter((status) => status.group === group),
  })).filter((entry) => entry.options.length > 0)

  return (
    <Drawer.Root open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[92vh] flex-col rounded-t-[28px] bg-[var(--app-bg)] outline-none">
          <Drawer.Title className="sr-only">{t('tasks.detailsSr')}</Drawer.Title>
          <Drawer.Description className="sr-only">{t('tasks.detailsSrDesc')}</Drawer.Description>

          {/* Фикс-шапка: грабер, код и «Закрыть» доступны при любом скролле. */}
          <div className="shrink-0 rounded-t-[28px] bg-[var(--app-bg)]">
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-[4px] w-10 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-center justify-between gap-2 px-5 pb-1.5">
              {task.code ? (
                <span className="inline-flex rounded-lg bg-[var(--accent-light)] px-2 py-1 text-[11px] font-bold tracking-wide text-[var(--accent)]">
                  {task.code}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--surface)] text-[var(--text-secondary)] shadow-[0_1px_3px_rgba(12,26,46,0.10)] active:bg-gray-100"
                aria-label={t('common.close')}
              >
                <Icon icon="mdi:close" width={17} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-1">
            {/* Заголовок */}
            <EditableText
              value={task.title}
              placeholder={t('tasks.titlePlaceholder')}
              appearance="title"
              disabled={busy}
              onCommit={(next) => patch({ title: next })}
            />

            {/* Статус — кликабельный: смена через task_move */}
            <div className="mt-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusPickerOpen((prev) => !prev)}
                  disabled={busy || statuses.length === 0}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 py-1.5 text-[12.5px] font-bold active:scale-95 disabled:opacity-60"
                  style={{
                    background: task.statusColor ? `${task.statusColor}1A` : 'var(--surface-sunken)',
                    color: task.statusColor || 'var(--text-secondary)',
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: task.statusColor || 'var(--text-muted)' }}
                  />
                  {task.statusTitle || t('tasks.noStatus')}
                  {statusMutation.isPending ? (
                    <span className="ml-0.5 h-3 w-3 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                  ) : (
                    <Icon
                      icon="mdi:chevron-down"
                      width={14}
                      className={`transition-transform ${statusPickerOpen ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {isOverdue && task.daysLeft != null ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1.5 text-[11.5px] font-bold text-rose-600">
                    <Icon icon="mdi:fire" width={13} />
                    {t('tasks.overdueBy', { days: Math.abs(task.daysLeft) })}
                  </span>
                ) : null}
              </div>

              {statusPickerOpen ? (
                <div className="mt-2 flex flex-col gap-0.5 rounded-2xl border border-black/[0.05] bg-[var(--surface)] p-1.5 shadow-[0_8px_24px_rgba(12,26,46,0.10)]">
                  {statusGroups.map((entry) => (
                    <div key={entry.group}>
                      <p className="m-0 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        {entry.label}
                      </p>
                      {entry.options.map((status) => {
                        const isCurrent = status.id === task.statusId
                        return (
                          <button
                            key={status.id}
                            type="button"
                            onClick={() =>
                              isCurrent ? setStatusPickerOpen(false) : statusMutation.mutate(status.id)
                            }
                            disabled={busy}
                            className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border-0 px-2.5 py-2 text-left text-[13px] font-semibold active:bg-gray-100 disabled:opacity-60 ${
                              isCurrent ? 'bg-[var(--accent-soft)]' : 'bg-transparent'
                            }`}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: status.color || 'var(--text-muted)' }}
                            />
                            <span className="flex-1 text-[var(--text-main)]">{status.title}</span>
                            {isCurrent ? (
                              <Icon icon="mdi:check" width={15} className="text-[var(--accent)]" />
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {actionError ? (
              <p className="m-0 mt-2 flex items-center gap-1.5 rounded-xl bg-[var(--error-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--error-text)]">
                <Icon icon="mdi:alert-circle-outline" width={14} className="shrink-0" />
                {actionError}
              </p>
            ) : null}

            {/* Описание. Правим plain-text: во фронте это rich-text, но
                санитайзера на мобилке нет, а слать сюда HTML руками незачем. */}
            <Section title={t('tasks.description')}>
              <EditableText
                value={description}
                placeholder={t('tasks.descriptionPlaceholder')}
                multiline
                disabled={busy}
                onCommit={(next) => patch({ description: next })}
              />
            </Section>

            {/* Детали — состав и порядок повторяют панель «Детали» в hrms-front.
                Каждое поле редактируется на месте и сохраняется сразу: «Готово»
                на мобилке лишний шаг, а частичный патч это позволяет. */}
            <Section title={t('tasks.details')}>
              <div className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-2xl border border-black/[0.05] bg-[var(--surface)] shadow-[0_1px_2px_rgba(12,26,46,0.04)]">
                <FieldRow icon="mdi:shape-outline" label={t('tasks.type')}>
                  <SelectField
                    value={task.typeId}
                    options={directories.types}
                    placeholder={t('tasks.notSet')}
                    label={t('tasks.typeOfTask')}
                    disabled={busy}
                    onChange={(id) => patch({ type_id: id })}
                  />
                </FieldRow>

                <FieldRow icon="mdi:account-multiple-outline" label={t('tasks.assignees')}>
                  <MultiSelectField
                    values={task.assigneeIds}
                    options={employeeOptions}
                    placeholder={t('tasks.notAssigned')}
                    label={t('tasks.assignees')}
                    searchPlaceholder={t('tasks.searchEmployee')}
                    disabled={busy}
                    onChange={(ids) => patch({ assignee_ids: ids })}
                    renderChip={(option) => {
                      const person = directories.employees.find((e) => e.id === option.id)
                      return (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-0.5 pl-0.5 pr-2">
                          {person?.photo ? (
                            <img
                              src={person.photo}
                              alt=""
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
                              {initials(option.title)}
                            </span>
                          )}
                          <span className="text-[11.5px] font-semibold text-[var(--text-main)]">
                            {option.title}
                          </span>
                        </span>
                      )
                    }}
                    renderOption={(option) => {
                      const person = directories.employees.find((e) => e.id === option.id)
                      return (
                        <>
                          {person?.photo ? (
                            <img
                              src={person.photo}
                              alt=""
                              className="h-7 w-7 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                              {initials(option.title)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[var(--text-main)]">
                            {option.title}
                          </span>
                        </>
                      )
                    }}
                  />
                </FieldRow>

                <FieldRow icon="mdi:flag-variant-outline" label={t('tasks.priority')}>
                  <SelectField
                    value={task.priorityId}
                    options={directories.priorities}
                    placeholder={t('tasks.notSetM')}
                    label={t('tasks.priority')}
                    disabled={busy}
                    onChange={(id) => patch({ priority_id: id })}
                    renderValue={(option) => (
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-bold"
                        style={{
                          background: option.color ? `${option.color}1A` : 'var(--surface-sunken)',
                          color: option.color || 'var(--text-secondary)',
                        }}
                      >
                        <Icon icon="mdi:flag-variant" width={11} />
                        {option.title}
                      </span>
                    )}
                  />
                </FieldRow>

                <FieldRow icon="mdi:map-marker-outline" label={t('tasks.location')}>
                  <SelectField
                    value={task.locationId}
                    options={directories.locations.map((l) => ({ id: l.id, title: l.title }))}
                    placeholder={t('tasks.notSetF')}
                    label={t('tasks.location')}
                    disabled={busy}
                    onChange={(id) => patch({ location_id: id })}
                  />
                </FieldRow>

                <FieldRow icon="mdi:ray-start-arrow" label={t('tasks.start')}>
                  <DateField
                    value={task.startDate}
                    label={t('tasks.startDate')}
                    placeholder={t('tasks.notSet')}
                    disabled={busy}
                    onChange={(iso) => patch({ start_date: iso })}
                  />
                </FieldRow>

                <FieldRow icon="mdi:flag-checkered" label={t('tasks.deadline')}>
                  <DateField
                    value={task.deadline}
                    label={t('tasks.deadline')}
                    placeholder={t('tasks.notSetM')}
                    disabled={busy}
                    tone={isOverdue ? 'text-rose-600' : undefined}
                    onChange={(iso) => patch({ deadline: iso })}
                  />
                </FieldRow>

                <FieldRow icon="mdi:file-tree-outline" label={t('tasks.parent')}>
                  <SelectField
                    value={task.parentId}
                    options={parentOptions}
                    placeholder={t('tasks.notSetM')}
                    label={t('tasks.parentTask')}
                    disabled={busy}
                    onChange={(id) => patch({ parent_id: id })}
                  />
                </FieldRow>

                <FieldRow icon="mdi:view-list-outline" label={t('tasks.list')}>
                  <SelectField
                    value={task.sheetId}
                    options={directories.sheets}
                    placeholder={t('tasks.notSetM')}
                    label={t('tasks.list')}
                    disabled={busy}
                    onChange={(id) => patch({ sheet_id: id })}
                  />
                </FieldRow>

                <FieldRow icon="mdi:tag-multiple-outline" label={t('tasks.tags')}>
                  <MultiSelectField
                    values={task.tags.map((tag) => tag.id)}
                    options={directories.tags}
                    placeholder={t('tasks.notSetPl')}
                    label={t('tasks.tags')}
                    searchPlaceholder={t('tasks.searchTag')}
                    disabled={busy}
                    onChange={(ids) => patch({ tag_ids: ids })}
                    renderChip={(option) => (
                      <span
                        className="inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: option.color ? `${option.color}1A` : 'var(--surface-sunken)',
                          color: option.color || 'var(--text-secondary)',
                        }}
                      >
                        {option.title}
                      </span>
                    )}
                  />
                </FieldRow>
              </div>
            </Section>

            {/* Чек-лист */}
            {task.checklist.length > 0 ? (
              <Section
                title={t('tasks.checklist')}
                meta={
                  <span
                    className={`text-[11.5px] font-bold ${
                      checklistPercent === 100 ? 'text-emerald-600' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {doneCount}/{task.checklist.length}
                  </span>
                }
              >
                {/* Полоса прогресса: сколько чек-листа уже закрыто. */}
                <div className="mb-2 h-[5px] overflow-hidden rounded-full bg-gray-200/80">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${checklistPercent}%` }}
                  />
                </div>
                <div className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-2xl border border-black/[0.05] bg-[var(--surface)] shadow-[0_1px_2px_rgba(12,26,46,0.04)]">
                  {task.checklist.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleChecklistItem(item.id)}
                      disabled={busy}
                      className="flex w-full cursor-pointer items-start gap-2.5 border-0 bg-transparent px-3.5 py-2.5 text-left active:bg-gray-50 disabled:opacity-60"
                    >
                      <Icon
                        icon={item.done ? 'mdi:checkbox-marked' : 'mdi:checkbox-blank-outline'}
                        width={17}
                        className={`mt-0.5 shrink-0 ${item.done ? 'text-emerald-500' : 'text-gray-300'}`}
                      />
                      <p
                        className={`m-0 text-[13px] leading-snug ${
                          item.done
                            ? 'text-[var(--text-muted)] line-through'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {item.text}
                      </p>
                    </button>
                  ))}
                </div>
              </Section>
            ) : null}

            {/* Подзадачи */}
            {task.subtasks.length > 0 ? (
              <Section
                title={t('tasks.subtasks')}
                meta={
                  <span className="text-[11.5px] font-bold text-[var(--text-muted)]">
                    {task.subtasks.filter((sub) => sub.statusGroup === 'completed').length}/
                    {task.subtasks.length}
                  </span>
                }
              >
                <div className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-2xl border border-black/[0.05] bg-[var(--surface)] shadow-[0_1px_2px_rgba(12,26,46,0.04)]">
                  {task.subtasks.map((subtask) => (
                    <SubtaskRow key={subtask.id} subtask={subtask} />
                  ))}
                </div>
              </Section>
            ) : null}

            {/* Вложения */}
            <Section
              title={t('tasks.attachments')}
              meta={
                task.attachments.length > 0 ? (
                  <span className="text-[11.5px] font-bold text-[var(--text-muted)]">
                    {task.attachments.length}
                  </span>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-1.5">
                {task.attachments.length > 0 ? (
                  <div className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-2xl border border-black/[0.05] bg-[var(--surface)] shadow-[0_1px_2px_rgba(12,26,46,0.04)]">
                    {task.attachments.map((file) => {
                      const visual = fileVisual(file.mime, file.name)
                      return (
                        <div key={file.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                          <span
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: visual.bg, color: visual.color }}
                          >
                            <Icon icon={visual.icon} width={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="block truncate text-[12.5px] font-semibold text-[var(--text-main)] no-underline"
                            >
                              {file.name}
                            </a>
                            {formatSize(file.size) ? (
                              <p className="m-0 text-[10.5px] text-[var(--text-muted)]">
                                {formatSize(file.size)}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(file.id)}
                            disabled={busy}
                            className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-1.5 text-[var(--text-muted)] active:bg-gray-100 disabled:opacity-60"
                            aria-label={t('tasks.deleteFile', { name: file.name })}
                          >
                            <Icon icon="mdi:trash-can-outline" width={15} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => void handleFilePicked(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)]/60 px-3 py-3 text-[12.5px] font-bold text-[var(--accent)] active:bg-[var(--accent-soft)] disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
                      {t('tasks.uploading')}
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:tray-arrow-up" width={14} />
                      {t('tasks.addAttachment')}
                    </>
                  )}
                </button>
              </div>
            </Section>

            {/* Служебные даты — как нижний блок панели «Детали» во front'е */}
            <Section title={t('tasks.dates')}>
              <div className="divide-y divide-[var(--line)]/70 overflow-hidden rounded-2xl border border-black/[0.05] bg-[var(--surface)] shadow-[0_1px_2px_rgba(12,26,46,0.04)]">
                <DetailRow label={t('tasks.createdAt')}>{plain(formatDateTime(task.createdAt))}</DetailRow>
                <DetailRow label={t('tasks.updatedAt')}>{plain(formatDateTime(task.updatedAt))}</DetailRow>
                {task.beginAt ? (
                  <DetailRow label={t('tasks.startedAt')}>{plain(formatDateTime(task.beginAt))}</DetailRow>
                ) : null}
                {isCompleted ? (
                  <DetailRow label={t('tasks.finishedAt')}>
                    <span className="text-[12.5px] font-bold text-emerald-600">
                      {formatDateTime(task.completedAt) !== '—'
                        ? formatDateTime(task.completedAt)
                        : formatDate(task.endDate)}
                    </span>
                  </DetailRow>
                ) : null}
              </div>
            </Section>

            {/* Комментарии */}
            <Section
              title={t('tasks.comments')}
              meta={
                activityQuery.data && activityQuery.data.comments.length > 0 ? (
                  <span className="text-[11.5px] font-bold text-[var(--text-muted)]">
                    {activityQuery.data.comments.length}
                  </span>
                ) : undefined
              }
            >
              <div className="flex flex-col gap-2.5">
                {activityQuery.isPending ? (
                  <div className="h-14 animate-pulse rounded-2xl bg-gray-200/60" />
                ) : activityQuery.isError ? (
                  <p className="m-0 text-[12px] text-[var(--text-muted)]">
                    {t('tasks.commentsFailed')}
                  </p>
                ) : activityQuery.data && activityQuery.data.comments.length > 0 ? (
                  activityQuery.data.comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2">
                      {comment.authorPhoto ? (
                        <img
                          src={comment.authorPhoto}
                          alt=""
                          className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                          {initials(comment.authorName)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-black/[0.05] bg-[var(--surface)] px-3 py-2 shadow-[0_1px_2px_rgba(12,26,46,0.04)]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[11.5px] font-bold text-[var(--text-main)]">
                            {comment.authorName}
                          </span>
                          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                            {formatDateTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="m-0 mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                          {comment.text}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="m-0 text-[12px] text-[var(--text-muted)]">
                    {t('tasks.commentsEmpty')}
                  </p>
                )}

                <div className="flex items-end gap-1.5">
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    rows={2}
                    placeholder={t('tasks.commentPlaceholder')}
                    className="min-h-[44px] flex-1 resize-none rounded-2xl border border-black/[0.05] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] text-[var(--text-main)] shadow-[0_1px_2px_rgba(12,26,46,0.04)] outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => commentMutation.mutate(commentDraft.trim())}
                    disabled={commentMutation.isPending || commentDraft.trim().length === 0}
                    className="inline-flex h-[44px] w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--accent)] text-white shadow-[0_4px_12px_rgba(12,26,46,0.18)] active:scale-95 disabled:opacity-40 disabled:shadow-none"
                    aria-label={t('tasks.sendComment')}
                  >
                    {commentMutation.isPending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <Icon icon="mdi:send" width={17} />
                    )}
                  </button>
                </div>
              </div>
            </Section>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
