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
}
