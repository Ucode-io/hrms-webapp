import adminRequest from './adminRequest'

const REPORTS_FUNCTION_PATH =
  '/v2/invoke_function/udevs-hrms-reports'

export type KpiPeriodType = 'yearly' | 'quarterly' | 'monthly' | 'weekly' | 'daily'

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
  start_date?: string
  end_date?: string
  own_plan_total?: number
  own_actual_total?: number
  plan_total?: number
  actual_total?: number
  percent_total?: number
  has_children?: boolean
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
  getKpiTable: async (data: {
    period_type: KpiPeriodType
    date_from: string
    date_to: string
    position_id?: string
    companies_id?: string
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

  getEmployeeAbsenceSummary: async (data: {
    user_base_id: string
    as_of_date?: string
    history_year?: number
  }): Promise<EmployeeAbsenceSummary> => {
    return invokeReports<EmployeeAbsenceSummary>('get_employee_absence_summary', data)
  },
}
