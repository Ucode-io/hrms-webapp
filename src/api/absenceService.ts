import adminRequest from './adminRequest'

/* ── Types ─────────────────────────────────────────── */

export type AbsenceStatus = 'pending' | 'approved' | 'rejected'

export interface AbsencePolicy {
  guid: string
  title?: string
  icon?: string
  color?: string
  value?: number | string
  period?: string[] | string
  [key: string]: unknown
}

export interface Absence {
  guid: string
  user_base_id: string
  absence_policies_id: string
  date_from: string
  date_to: string
  requested_days?: number
  requested_breakdown?: Array<{ date: string; value: number }> | string
  note?: string | null
  attachments?: string[] | string
  status?: string | string[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface BalanceTransaction {
  guid: string
  absence_policies_id?: string
  absences_id?: string
  amount?: number
  transaction_type?: string | string[]
  type?: string | string[]
  date?: string
  occurred_at?: string
  created_at?: string
  [key: string]: unknown
}

/* ── Helpers ───────────────────────────────────────── */

function encodeData(data: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(data))
}

function extractList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

/* ── Service ───────────────────────────────────────── */

const ABSENCES_COLLECTION = 'absences'
const ABSENCE_POLICIES_SLUG = 'absence_policies'
const BALANCE_TRANSACTIONS_SLUG = 'absence_balance_transactions'

export const absenceService = {
  /** Fetch all absence policies */
  getPolicies: async (): Promise<AbsencePolicy[]> => {
    const res = await adminRequest.get(`/v2/items/${ABSENCE_POLICIES_SLUG}`, {
      params: { data: encodeData({ limit: 200, offset: 0 }) },
    })
    return extractList<AbsencePolicy>(res)
  },

  /** Fetch absences for a given employee (paginated, all pages) */
  getByEmployee: async (userBaseId: string): Promise<Absence[]> => {
    if (!userBaseId) return []
    const limit = 200
    let offset = 0
    const all: Absence[] = []

    for (let i = 0; i < 50; i++) {
      const res = await adminRequest.get(`/v2/items/${ABSENCES_COLLECTION}`, {
        params: { data: encodeData({ user_base_id: userBaseId, limit, offset }) },
      })
      const chunk = extractList<Absence>(res)
      if (chunk.length === 0) break
      all.push(...chunk)
      offset += chunk.length
      if (chunk.length < limit) break
    }
    return all
  },

  /** Fetch balance transactions for a given employee */
  getBalanceTransactions: async (userBaseId: string): Promise<BalanceTransaction[]> => {
    if (!userBaseId) return []
    const res = await adminRequest.get(`/v2/items/${BALANCE_TRANSACTIONS_SLUG}`, {
      params: { data: encodeData({ user_base_id: userBaseId, limit: 2000, offset: 0 }) },
    })
    return extractList<BalanceTransaction>(res)
  },

  /** Create a new absence request */
  create: async (data: Partial<Absence>): Promise<unknown> => {
    return adminRequest.post(`/v2/items/${ABSENCES_COLLECTION}`, { data })
  },
}

/* ── Derived helpers ───────────────────────────────── */

export function resolveStatus(value: unknown): AbsenceStatus {
  if (Array.isArray(value)) {
    const first = value[0]
    if (first === 'approved' || first === 'rejected' || first === 'pending') return first
    return 'pending'
  }
  if (value === 'approved' || value === 'rejected' || value === 'pending') return value
  return 'pending'
}

export function resolveNumeric(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function getPeriodSlug(value: unknown): 'week' | 'month' | 'year' {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  const first = (list[0] || '').toString().toLowerCase()
  if (first === 'week' || first === 'month' || first === 'year') return first
  return 'year'
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeBalance(
  policyGuid: string,
  policyLimit: number,
  periodSlug: 'week' | 'month' | 'year',
  transactions: BalanceTransaction[],
): number {
  const now = new Date()
  let from: string
  let to: string

  if (periodSlug === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    from = toIsoDate(start)
    to = toIsoDate(end)
  } else if (periodSlug === 'month') {
    from = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1))
    to = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  } else {
    from = toIsoDate(new Date(now.getFullYear(), 0, 1))
    to = toIsoDate(new Date(now.getFullYear(), 11, 31))
  }

  const periodBalance = transactions.reduce((sum, t) => {
    const pid = t.absence_policies_id
    if (pid !== policyGuid) return sum
    const raw = t.date || t.occurred_at || t.created_at || ''
    const d = raw.slice(0, 10)
    if (d < from || d > to) return sum
    return sum + resolveNumeric(t.amount, 0)
  }, 0)

  return Math.max(0, policyLimit + periodBalance)
}

export function formatDateRu(iso: string): string {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length < 3) return iso
  return `${parts[2]}.${parts[1]}.${parts[0]}`
}

export const STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  rejected: 'Отклонено',
}

export const STATUS_COLORS: Record<AbsenceStatus, { bg: string; text: string }> = {
  pending:  { bg: 'bg-amber-50',   text: 'text-amber-700' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected: { bg: 'bg-rose-50',    text: 'text-rose-700' },
}
