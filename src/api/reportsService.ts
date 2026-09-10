import adminRequest from './adminRequest'

const REPORTS_FUNCTION_PATH =
  '/v2/invoke_function/udevs-hrms-reports'

export type KpiPeriodType = 'yearly' | 'quarterly' | 'monthly' | 'weekly' | 'daily'

export type KpiAggregationType = 'sum' | 'min' | 'max' | 'avg'

export interface KpiTableItem {
  guid: string
  parent_id?: string | null
  positions_id?: string | null
  position?: string
  title?: string
  description?: string
  source?: string
  value_symbol?: string
  value_symbol_position?: 'prefix' | 'suffix' | string
  period_type?: KpiPeriodType | string
  aggregation_type?: KpiAggregationType | string
  start_date?: string
  end_date?: string
  own_plan_total?: number
  own_actual_total?: number
  plan_total?: number
  actual_total?: number
  percent_total?: number
  has_children?: boolean
  reward_amount?: number | null
  employee_ids?: string[]
  children?: KpiTableItem[]
}

export interface KpiTableGroup {
  position: string
  items: KpiTableItem[]
}

export interface KpiTableResponse {
  count?: number
  period_type?: KpiPeriodType | string
  period?: {
    from?: string
    to?: string
    label?: string
  }
  groups?: KpiTableGroup[]
  items?: KpiTableItem[]
  filters_applied?: Record<string, unknown>
}

export interface UpdateKpiValueResponse {
  guid: string
  parent_id?: string | null
  plan_total?: number
  actual_total?: number
  percent_total?: number
  root?: {
    guid: string
    plan_total?: number
    actual_total?: number
    percent_total?: number
  } | null
}

/* ── Задачи сотрудника (task_my_list) ─────────────────────────────────── */

export type TaskStatusGroup = 'todo' | 'in_progress' | 'completed'

/** Полная таксономия сроков (как в отчётах HR). */
export type TaskDeadlineBucket =
  | 'overdue'
  | 'today'
  | 'week'
  | 'later'
  | 'no_deadline'
  | 'completed'

/** Разрез «по срокам» для сотрудника: просрочено / сегодня / эта неделя / остальные. */
export type TaskDeadlineViewBucket = 'overdue' | 'today' | 'week' | 'rest'

export interface TaskRef {
  id: string
  title: string
}

export interface TaskAssignee {
  id: string
  name: string
  photo: string
}

export interface TaskTag {
  id: string
  title: string
  color: string
}

export interface TaskParentRef extends TaskRef {
  code: string
}

export interface TaskSubtask {
  id: string
  code: string
  title: string
  deadline: string | null
  statusTitle: string
  statusColor: string
  statusGroup: TaskStatusGroup
}

export interface MyTask {
  id: string
  code: string
  title: string
  description: string
  statusId: string | null
  /* id справочников — нужны пикерам в карточке (значения показываем из
     развёрнутых полей ниже, а выбираем по id). */
  typeId: string | null
  priorityId: string | null
  locationId: string | null
  sheetId: string | null
  parentId: string | null
  statusTitle: string
  statusColor: string
  statusGroup: TaskStatusGroup
  priorityTitle: string
  priorityColor: string
  typeTitle: string
  typeColor: string
  deadline: string | null
  startDate: string | null
  endDate: string | null
  deadlineBucket: TaskDeadlineBucket
  deadlineViewBucket: TaskDeadlineViewBucket
  daysLeft: number | null
  checklist: Array<{ id: string; text: string; done: boolean }>
  attachments: Array<{ id: string; name: string; size: number; mime: string; url: string }>
  assigneeIds: string[]
  commentCount: number
  beginAt: string | null
  completedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  /* Развёрнутые справочники — панель «Детали», как в hrms-front. */
  assignees: TaskAssignee[]
  tags: TaskTag[]
  location: TaskRef | null
  sheet: TaskRef | null
  parent: TaskParentRef | null
  subtasks: TaskSubtask[]
}

export interface MyTaskStatusColumn {
  statusId: string | null
  title: string
  color: string
  group: TaskStatusGroup
  sortOrder: number
  taskIds: string[]
  count: number
}

export interface MyTaskDeadlineGroup {
  key: TaskDeadlineViewBucket
  label: string
  taskIds: string[]
  count: number
}

export interface TaskStatusOption {
  id: string
  title: string
  color: string
  group: TaskStatusGroup
  sortOrder: number
  isInitial: boolean
}

export interface TaskDirectoryItem {
  id: string
  title: string
  color: string
  icon: string
}

/** Справочники для пикеров в карточке задачи. */
export interface TaskDirectories {
  types: TaskDirectoryItem[]
  priorities: TaskDirectoryItem[]
  tags: TaskDirectoryItem[]
  sheets: TaskDirectoryItem[]
  locations: TaskRef[]
  employees: TaskAssignee[]
}

export interface MyTasksResponse {
  user_base_id: string
  tasks: MyTask[]
  /** Справочник статусов компании — для смены статуса из карточки. */
  statuses: TaskStatusOption[]
  directories: TaskDirectories
  views: {
    by_status: MyTaskStatusColumn[]
    by_deadline: MyTaskDeadlineGroup[]
  }
}

/** Поля задачи, которые можно патчить точечно (см. `task_content_patch`). */
export interface TaskPatch {
  title?: string
  description?: string
  type_id?: string | null
  priority_id?: string | null
  location_id?: string | null
  sheet_id?: string | null
  parent_id?: string | null
  start_date?: string | null
  deadline?: string | null
  assignee_ids?: string[]
  tag_ids?: string[]
  checklist?: Array<{ id: string; text: string; done: boolean }>
  attachments?: TaskAttachmentInput[]
}

export interface TaskComment {
  id: string
  authorId: string | null
  authorName: string
  authorPhoto: string
  text: string
  createdAt: string | null
}

export interface TaskHistoryEntry {
  id: string
  authorId: string | null
  authorName: string
  authorPhoto: string
  kind: string
  text: string
  at: string | null
}

export interface TaskActivity {
  comments: TaskComment[]
  history: TaskHistoryEntry[]
}

export interface TaskAttachmentInput {
  id: string
  name: string
  size: number
  mime: string
  url: string
  uploadedById?: string | null
  uploadedAt?: string | null
}

/** Опоздания за месяц + штраф (та же формула, что в зарплатном Excel). */
export interface EmployeeLatenessSummary {
  month: string
  user_base_id: string
  late_days: number
  late_minutes: number
  /** Минуты сверх «прощаемых» — именно они превращаются в деньги. */
  penalized_minutes: number
  penalty_amount: number
  /** Без графика работы штраф не считается — нужно, чтобы отличить «0» от «нет данных». */
  has_work_schedule: boolean
  grace_minutes: number
  coefficient: number
  work_days: number
  scheduled_working_days: number
}

export type EmployeeAbsenceStatus = 'pending' | 'approved' | 'rejected'
export type EmployeeAbsencePeriodSlug = 'week' | 'month' | 'year'

export interface EmployeeAbsencePolicy {
  guid: string
  title: string
  icon: string | null
  color: string | null
  period: EmployeeAbsencePeriodSlug
  limit: number
  cycle: { from: string; to: string }
  used_days: number
  pending_days: number
  available: number
  /** Minimum employment tenure (months) required before this policy can be used. */
  min_months?: number
  /** False when the employee has not yet reached `min_months` of tenure. */
  eligible?: boolean
  /** ISO date from which the policy becomes available (hire date + min_months). */
  eligible_at?: string | null
}

export interface EmployeeAbsencePolicyRef {
  guid: string
  title: string
  icon: string | null
  color: string | null
  period: EmployeeAbsencePeriodSlug
}

export interface EmployeeAbsenceRequest {
  guid: string
  absence_policies_id: string | null
  policy: EmployeeAbsencePolicyRef | null
  date_from: string | null
  date_to: string | null
  requested_days: number
  status: EmployeeAbsenceStatus
  note: string | null
  attachments: string | null
  requested_breakdown: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  reject_reason: string | null
  created_at: string | null
  updated_at: string | null
}

export interface EmployeeAbsenceSummary {
  as_of_date: string
  user_base_id: string
  policies: EmployeeAbsencePolicy[]
  requests: EmployeeAbsenceRequest[]
  history: {
    year: number
    from: string
    to: string
    total_used_days: number
    approved: EmployeeAbsenceRequest[]
  }
}

type ReportsInvokeResponse<T> = {
  method?: string
  result?: T
} & T

const normalizeInvokeResult = <T>(raw: ReportsInvokeResponse<T>): T => {
  if (raw && typeof raw === 'object' && 'result' in raw) {
    const wrapped = raw as { result?: T }
    if (wrapped.result != null) return wrapped.result
  }
  return raw as T
}

const invokeReports = async <T>(method: string, data: Record<string, unknown>): Promise<T> => {
  const response = await adminRequest.post(REPORTS_FUNCTION_PATH, {
    data: {
      method,
      data,
    },
  })
  return normalizeInvokeResult<T>(response as unknown as ReportsInvokeResponse<T>)
}

export const reportsService = {
  // Привязка Telegram-аккаунта к сотруднику: шлём подписанную строку целиком,
  // chat_id из неё достаёт бек после проверки HMAC. Сотрудника он берёт из
  // токена, а не из тела запроса, поэтому guid здесь не нужен.
  linkTelegram: async (initData: string): Promise<{ linked: boolean }> => {
    return invokeReports<{ linked: boolean }>('telegram_link', { init_data: initData })
  },

  getKpiTable: async (data: {
    period_type: KpiPeriodType
    date_from: string
    date_to: string
    position_id?: string
    companies_id?: string
    employee_id?: string
    search?: string
  }): Promise<KpiTableResponse> => {
    return invokeReports<KpiTableResponse>('get_kpi_table', data)
  },

  updateKpiValue: async (guid: string, actualValue: number): Promise<UpdateKpiValueResponse> => {
    return invokeReports<UpdateKpiValueResponse>('update_kpi_value', {
      guid,
      actual_value: actualValue,
    })
  },

  getMyTasks: async (userBaseId: string): Promise<MyTasksResponse> => {
    const raw = await invokeReports<Partial<MyTasksResponse> & { server_error?: string }>(
      'task_my_list',
      { user_base_id: userBaseId },
    )

    // Ошибку метода шлюз отдаёт как обычный 200 с `server_error` внутри. Без
    // явной проверки экран показал бы «Задач нет» — то есть соврал бы, что у
    // сотрудника нет задач, вместо того чтобы показать сбой и «Повторить».
    if (typeof raw?.server_error === 'string' && raw.server_error) {
      throw new Error(raw.server_error)
    }

    // Шлюз отдаёт конверт метода как есть, поэтому `tasks`/`views` могут не
    // прийти вовсе. Нормализуем здесь, чтобы тип не врал, а экран не падал на
    // `tasks.length`.
    const views = raw?.views
    // Развёрнутые справочники (assignees/tags/subtasks/…) появились в методе
    // позже самого метода: пока задеплоена старая версия, их в ответе нет, и
    // без подстановки карточка деталей падала бы на `assignees.length`.
    const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
    const normalizeTask = (task: MyTask): MyTask => ({
      ...task,
      checklist: arr(task?.checklist),
      attachments: arr(task?.attachments),
      assigneeIds: arr(task?.assigneeIds),
      assignees: arr(task?.assignees),
      tags: arr(task?.tags),
      subtasks: arr(task?.subtasks),
      location: task?.location ?? null,
      sheet: task?.sheet ?? null,
      parent: task?.parent ?? null,
    })
    return {
      user_base_id: raw?.user_base_id || userBaseId,
      tasks: Array.isArray(raw?.tasks) ? raw.tasks.map(normalizeTask) : [],
      statuses: arr<TaskStatusOption>(raw?.statuses),
      directories: {
        types: arr<TaskDirectoryItem>(raw?.directories?.types),
        priorities: arr<TaskDirectoryItem>(raw?.directories?.priorities),
        tags: arr<TaskDirectoryItem>(raw?.directories?.tags),
        sheets: arr<TaskDirectoryItem>(raw?.directories?.sheets),
        locations: arr<TaskRef>(raw?.directories?.locations),
        employees: arr<TaskAssignee>(raw?.directories?.employees),
      },
      views: {
        by_status: Array.isArray(views?.by_status) ? views.by_status : [],
        by_deadline: Array.isArray(views?.by_deadline) ? views.by_deadline : [],
      },
    }
  },

  /** Смена статуса. `task_move` вместо `task_save`: тот сохраняет задачу целиком. */
  moveTask: async (taskId: string, statusId: string, authorId: string): Promise<unknown> => {
    return invokeReports('task_move', {
      guid: taskId,
      status_id: statusId,
      author_id: authorId || undefined,
    })
  },

  getTaskActivity: async (taskId: string): Promise<TaskActivity> => {
    const raw = await invokeReports<Partial<TaskActivity>>('task_activity_get', {
      task_id: taskId,
    })
    return {
      comments: Array.isArray(raw?.comments) ? raw.comments : [],
      history: Array.isArray(raw?.history) ? raw.history : [],
    }
  },

  addTaskComment: async (taskId: string, text: string, authorId: string): Promise<unknown> => {
    return invokeReports('task_comment_add', {
      task_id: taskId,
      text,
      author_id: authorId || undefined,
    })
  },

  /**
   * Точечный патч полей задачи. Поле, которого нет в объекте, сервер не
   * трогает — поэтому здесь передаём только то, что реально меняем.
   * Статуса тут нет: он двигает ещё и даты задачи, для него `moveTask`.
   */
  patchTaskContent: async (
    taskId: string,
    patch: TaskPatch,
    authorId: string,
  ): Promise<unknown> => {
    const raw = await invokeReports<{ server_error?: string }>('task_content_patch', {
      task_id: taskId,
      author_id: authorId || undefined,
      ...patch,
    })
    // Ошибку метод отдаёт как обычный 200 с `server_error` — без проверки
    // правка «сохранилась» бы молча, а на деле не применилась.
    if (typeof raw?.server_error === 'string' && raw.server_error) {
      throw new Error(raw.server_error)
    }
    return raw
  },

  getEmployeeLatenessSummary: async (data: {
    user_base_id: string
    month: string
  }): Promise<EmployeeLatenessSummary | null> => {
    const raw = await invokeReports<Partial<EmployeeLatenessSummary> & { server_error?: string }>(
      'get_employee_lateness_summary',
      data,
    )
    // Метод новый: пока он не задеплоен, шлюз вернёт конверт без наших полей.
    // Отдаём null — карточки покажут «—» вместо выдуманного нуля.
    if (typeof raw?.server_error === 'string' && raw.server_error) return null
    if (typeof raw?.late_minutes !== 'number') return null
    return {
      month: raw.month || data.month,
      user_base_id: raw.user_base_id || data.user_base_id,
      late_days: raw.late_days ?? 0,
      late_minutes: raw.late_minutes ?? 0,
      penalized_minutes: raw.penalized_minutes ?? 0,
      penalty_amount: raw.penalty_amount ?? 0,
      has_work_schedule: Boolean(raw.has_work_schedule),
      grace_minutes: raw.grace_minutes ?? 0,
      coefficient: raw.coefficient ?? 0,
      work_days: raw.work_days ?? 0,
      scheduled_working_days: raw.scheduled_working_days ?? 0,
    }
  },

  getEmployeeAbsenceSummary: async (data: {
    user_base_id: string
    as_of_date?: string
    history_year?: number
  }): Promise<EmployeeAbsenceSummary> => {
    return invokeReports<EmployeeAbsenceSummary>('get_employee_absence_summary', data)
  },
}
