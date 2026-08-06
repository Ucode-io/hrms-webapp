import { useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import {
  reportsService,
  type MyTask,
  type TaskAttachmentInput,
  type TaskStatusOption,
  type TaskSubtask,
} from '../../api/reportsService'
import { uploadFile } from '../../api/dashboardService'

interface TaskDetailSheetProps {
  task: MyTask | null
  statuses: TaskStatusOption[]
  employeeId: string
  open: boolean
  onClose: () => void
  /** Дёргается после успешной правки — список наверху перезапрашивает себя. */
  onChanged: () => void
}

const formatDate = (iso: string | null): string => {
  if (!iso) return '—'
  const parsed = new Date(iso.length > 10 ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—'
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '—'

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {title}
      </p>
      {children}
    </div>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <span className="shrink-0 pt-0.5 text-[12.5px] text-[var(--text-muted)]">{label}</span>
      <div className="min-w-0 flex-1 text-right">{children}</div>
    </div>
  )
}

const plain = (value: string) => (
  <span className="text-[12.5px] font-bold text-[var(--text-main)]">{value}</span>
)

const muted = <span className="text-[12.5px] text-[var(--text-muted)]">Не указано</span>

function SubtaskRow({ subtask }: { subtask: TaskSubtask }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2">
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300"
        style={subtask.statusColor ? { background: subtask.statusColor } : undefined}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`m-0 text-[12.5px] font-semibold leading-snug ${
            subtask.statusGroup === 'completed'
              ? 'text-[var(--text-muted)] line-through'
              : 'text-[var(--text-main)]'
          }`}
        >
          {subtask.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {subtask.code ? (
            <span className="text-[10.5px] font-bold text-[var(--text-muted)]">{subtask.code}</span>
          ) : null}
          <span className="text-[10.5px] text-[var(--text-muted)]">{subtask.statusTitle}</span>
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
  employeeId,
  open,
  onClose,
  onChanged,
}: TaskDetailSheetProps) {
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
    setActionError(error instanceof Error ? error.message : 'Не удалось сохранить изменение')
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
  const isCompleted = task.statusGroup === 'completed'
  const isOverdue = task.deadlineBucket === 'overdue'

  const toggleChecklistItem = (itemId: string) => {
    checklistMutation.mutate(
      task.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      ),
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
    uploading

  return (
    <Drawer.Root open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[92vh] flex-col rounded-t-[28px] bg-white outline-none">
          <Drawer.Title className="sr-only">Детали задачи</Drawer.Title>
          <Drawer.Description className="sr-only">Подробности выбранной задачи</Drawer.Description>

          <div className="flex justify-center pt-3 pb-1">
            <div className="h-[4px] w-10 rounded-full bg-gray-300" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]">
            {/* Заголовок */}
            <div className="mb-1 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {task.code ? (
                  <span className="mb-1.5 inline-flex rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent)]">
                    {task.code}
                  </span>
                ) : null}
                <p className="m-0 text-[17px] font-extrabold leading-snug text-[var(--text-main)]">
                  {task.title || 'Без названия'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-1 -mt-0.5 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-xl border-0 bg-gray-100 text-[var(--text-secondary)] active:bg-gray-200"
                aria-label="Закрыть"
              >
                <Icon icon="mdi:close" width={18} />
              </button>
            </div>

            {/* Статус — кликабельный: смена через task_move */}
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => setStatusPickerOpen((prev) => !prev)}
                disabled={busy || statuses.length === 0}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-0 px-2.5 py-1.5 text-[12.5px] font-bold active:scale-95 disabled:opacity-60"
                style={{
                  background: task.statusColor ? `${task.statusColor}1A` : '#f3f4f6',
                  color: task.statusColor || '#4b5563',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: task.statusColor || '#9ca3af' }}
                />
                {task.statusTitle || 'Без статуса'}
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

              {statusPickerOpen ? (
                <div className="mt-2 flex flex-col gap-1 rounded-2xl border border-[var(--line)] bg-white p-1.5">
                  {statuses.map((status) => {
                    const isCurrent = status.id === task.statusId
                    return (
                      <button
                        key={status.id}
                        type="button"
                        onClick={() => (isCurrent ? setStatusPickerOpen(false) : statusMutation.mutate(status.id))}
                        disabled={busy}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border-0 px-2.5 py-2 text-left text-[12.5px] font-semibold active:bg-gray-100 disabled:opacity-60 ${
                          isCurrent ? 'bg-gray-100' : 'bg-transparent'
                        }`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: status.color || '#9ca3af' }}
                        />
                        <span className="flex-1 text-[var(--text-main)]">{status.title}</span>
                        {isCurrent ? (
                          <Icon icon="mdi:check" width={14} className="text-[var(--accent)]" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>

            {actionError ? (
              <p className="m-0 mt-2 rounded-xl bg-[var(--error-bg)] px-3 py-2 text-[12px] font-semibold text-[var(--error-text)]">
                {actionError}
              </p>
            ) : null}

            {/* Просрочка */}
            {isOverdue && task.daysLeft != null ? (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50/70 px-3.5 py-2.5">
                <Icon icon="mdi:alert-circle-outline" width={16} className="shrink-0 text-rose-600" />
                <p className="m-0 text-[12.5px] font-bold text-rose-700">
                  Просрочено на {Math.abs(task.daysLeft)} дн.
                </p>
              </div>
            ) : null}

            {/* Описание */}
            {description ? (
              <Section title="Описание">
                <p className="m-0 whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {description}
                </p>
              </Section>
            ) : null}

            {/* Детали — состав повторяет панель «Детали» в hrms-front */}
            <Section title="Детали">
              <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">
                <DetailRow label="Тип">
                  {task.typeTitle ? plain(task.typeTitle) : muted}
                </DetailRow>

                <DetailRow label="Исполнители">
                  {task.assignees.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {task.assignees.map((person) => (
                        <span
                          key={person.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-0.5 pl-0.5 pr-2"
                        >
                          {person.photo ? (
                            <img
                              src={person.photo}
                              alt=""
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          ) : (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
                              {initials(person.name)}
                            </span>
                          )}
                          <span className="text-[11.5px] font-semibold text-[var(--text-main)]">
                            {person.name}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    muted
                  )}
                </DetailRow>

                <DetailRow label="Приоритет">
                  {task.priorityTitle ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-bold"
                      style={{
                        background: task.priorityColor ? `${task.priorityColor}1A` : '#f3f4f6',
                        color: task.priorityColor || '#4b5563',
                      }}
                    >
                      <Icon icon="mdi:flag-outline" width={11} />
                      {task.priorityTitle}
                    </span>
                  ) : (
                    muted
                  )}
                </DetailRow>

                <DetailRow label="Локация">
                  {task.location?.title ? plain(task.location.title) : muted}
                </DetailRow>

                <DetailRow label="Начало">{plain(formatDate(task.startDate))}</DetailRow>

                <DetailRow label="Дедлайн">
                  <span
                    className={`text-[12.5px] font-bold ${
                      isOverdue ? 'text-rose-600' : 'text-[var(--text-main)]'
                    }`}
                  >
                    {formatDate(task.deadline)}
                  </span>
                </DetailRow>

                <DetailRow label="Родитель">
                  {task.parent ? (
                    <span className="text-[12.5px] font-bold text-[var(--text-main)]">
                      {task.parent.code ? `${task.parent.code} · ` : ''}
                      {task.parent.title}
                    </span>
                  ) : (
                    muted
                  )}
                </DetailRow>

                <DetailRow label="Лист">
                  {task.sheet?.title ? plain(task.sheet.title) : muted}
                </DetailRow>

                <DetailRow label="Теги">
                  {task.tags.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {task.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            background: tag.color ? `${tag.color}1A` : '#f3f4f6',
                            color: tag.color || '#4b5563',
                          }}
                        >
                          {tag.title}
                        </span>
                      ))}
                    </div>
                  ) : (
                    muted
                  )}
                </DetailRow>
              </div>
            </Section>

            {/* Чек-лист */}
            {task.checklist.length > 0 ? (
              <Section title={`Чек-лист · ${doneCount}/${task.checklist.length}`}>
                <div className="flex flex-col gap-1.5">
                  {task.checklist.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleChecklistItem(item.id)}
                      disabled={busy}
                      className="flex w-full cursor-pointer items-start gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-left active:bg-gray-50 disabled:opacity-60"
                    >
                      <Icon
                        icon={item.done ? 'mdi:checkbox-marked' : 'mdi:checkbox-blank-outline'}
                        width={15}
                        className={`mt-0.5 shrink-0 ${
                          item.done ? 'text-emerald-500' : 'text-gray-300'
                        }`}
                      />
                      <p
                        className={`m-0 text-[12.5px] leading-snug ${
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
              <Section title={`Подзадачи · ${task.subtasks.length}`}>
                <div className="flex flex-col gap-1.5">
                  {task.subtasks.map((subtask) => (
                    <SubtaskRow key={subtask.id} subtask={subtask} />
                  ))}
                </div>
              </Section>
            ) : null}

            {/* Вложения */}
            <Section title={`Вложения${task.attachments.length ? ` · ${task.attachments.length}` : ''}`}>
              <div className="flex flex-col gap-1.5">
                {task.attachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                  >
                    <Icon
                      icon="mdi:paperclip"
                      width={14}
                      className="shrink-0 text-[var(--text-muted)]"
                    />
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--text-main)] no-underline"
                    >
                      {file.name}
                    </a>
                    {formatSize(file.size) ? (
                      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                        {formatSize(file.size)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      disabled={busy}
                      className="shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-1 text-[var(--text-muted)] active:bg-gray-100 disabled:opacity-60"
                      aria-label={`Удалить ${file.name}`}
                    >
                      <Icon icon="mdi:close" width={14} />
                    </button>
                  </div>
                ))}

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
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line)] bg-white px-3 py-2.5 text-[12.5px] font-bold text-[var(--accent)] active:bg-[var(--accent-soft)] disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
                      Загружаем…
                    </>
                  ) : (
                    <>
                      <Icon icon="mdi:tray-arrow-up" width={14} />
                      Добавить вложение
                    </>
                  )}
                </button>
              </div>
            </Section>

            {/* Служебные даты — как нижний блок панели «Детали» во front'е */}
            <Section title="Даты">
              <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">
                <DetailRow label="Создана">{plain(formatDateTime(task.createdAt))}</DetailRow>
                <DetailRow label="Обновлена">{plain(formatDateTime(task.updatedAt))}</DetailRow>
                {task.beginAt ? (
                  <DetailRow label="Начата">{plain(formatDateTime(task.beginAt))}</DetailRow>
                ) : null}
                {isCompleted ? (
                  <DetailRow label="Завершена">
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
            <Section title="Комментарии">
              <div className="flex flex-col gap-2">
                {activityQuery.isPending ? (
                  <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
                ) : activityQuery.isError ? (
                  <p className="m-0 text-[12px] text-[var(--text-muted)]">
                    Не удалось загрузить комментарии.
                  </p>
                ) : activityQuery.data && activityQuery.data.comments.length > 0 ? (
                  activityQuery.data.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-xl border border-[var(--line)] bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5">
                        {comment.authorPhoto ? (
                          <img
                            src={comment.authorPhoto}
                            alt=""
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-white">
                            {initials(comment.authorName)}
                          </span>
                        )}
                        <span className="text-[11.5px] font-bold text-[var(--text-main)]">
                          {comment.authorName}
                        </span>
                        <span className="ml-auto text-[10.5px] text-[var(--text-muted)]">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="m-0 mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                        {comment.text}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="m-0 text-[12px] text-[var(--text-muted)]">
                    Комментариев пока нет — начните обсуждение.
                  </p>
                )}

                <div className="flex items-end gap-1.5">
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    rows={2}
                    placeholder="Напишите комментарий…"
                    className="min-h-[42px] flex-1 resize-none rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-[12.5px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => commentMutation.mutate(commentDraft.trim())}
                    disabled={commentMutation.isPending || commentDraft.trim().length === 0}
                    className="inline-flex h-[42px] w-[42px] shrink-0 cursor-pointer items-center justify-center rounded-xl border-0 bg-[var(--accent)] text-white active:scale-95 disabled:opacity-40"
                    aria-label="Отправить комментарий"
                  >
                    {commentMutation.isPending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <Icon icon="mdi:send" width={16} />
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
