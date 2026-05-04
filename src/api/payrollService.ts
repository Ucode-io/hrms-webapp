import adminRequest from './adminRequest'

/* ── Types ─────────────────────────────────────────── */

export type OperationType = 'income' | 'deduction'

export interface CompensationType {
  guid: string
  title?: string
  operation_type?: string[] | string | null
  [key: string]: unknown
}

export interface Compensation {
  guid: string
  user_base_id?: string | null
  date?: string | null
  amount?: number | string | null
  description?: string | null
  compensation_types_id?: string | null
  compensation_types_id_data?: { guid?: string; title?: string } | null
  operation_type?: string[] | string | null
  created_at?: string
  [key: string]: unknown
}

export interface CompensationRecord {
  guid: string
  date: string
  amount: number
  description: string
  typeId: string
  typeTitle: string
  operationType: OperationType
  createdAt: string
}

/* ── Helpers ───────────────────────────────────────── */

function enc(data: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(data))
}

function extractList<T>(res: unknown): T[] {
  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  if (Array.isArray(res)) return res as T[]
  return []
}

export function resolveOperationType(value: unknown): OperationType {
  const v = Array.isArray(value) ? value[0] : value
  return v === 'deduction' || v === 'outcome' ? 'deduction' : 'income'
}

export function normalizeAmount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') { const n = Number(raw); if (Number.isFinite(n)) return n }
  return 0
}

export function normalizeRecord(item: Compensation): CompensationRecord {
  return {
    guid: item.guid,
    date: typeof item.date === 'string' ? item.date : '',
    amount: normalizeAmount(item.amount),
    description: typeof item.description === 'string' ? item.description : '',
    typeId: typeof item.compensation_types_id === 'string' ? item.compensation_types_id : '',
    typeTitle: item.compensation_types_id_data?.title ?? '',
    operationType: resolveOperationType(item.operation_type),
    createdAt: typeof item.created_at === 'string' ? item.created_at : '',
  }
}

export function formatAmount(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n) + ' сум'
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getMonthLabel(iso: string): string {
  const d = new Date(iso + '-01')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

export const OPERATION_LABELS: Record<OperationType, string> = {
  income: 'Начисление',
  deduction: 'Удержание',
}

/* ── Service ───────────────────────────────────────── */

const COMP_SLUG = 'employee_compensations'
const TYPES_SLUG = 'compensation_types'

export const payrollService = {
  getCompensations: async (
    userBaseId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<CompensationRecord[]> => {
    if (!userBaseId) return []
    const query: Record<string, unknown> = {
      user_base_id: userBaseId,
      limit: 500,
      offset: 0,
    }
    if (dateFrom && dateTo) {
      query.date = { $gte: dateFrom, $lte: dateTo }
    }
    const res = await adminRequest.get(`/v2/items/${COMP_SLUG}`, {
      params: { with_relations: true, data: enc(query) },
    })
    return extractList<Compensation>(res).map(normalizeRecord)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  },

  getCompensationTypes: async (): Promise<CompensationType[]> => {
    const res = await adminRequest.get(`/v2/items/${TYPES_SLUG}`, {
      params: { data: enc({ limit: 200, offset: 0 }) },
    })
    return extractList<CompensationType>(res)
  },

  create: async (data: Record<string, unknown>): Promise<unknown> => {
    return adminRequest.post(`/v2/items/${COMP_SLUG}`, { data })
  },
}
