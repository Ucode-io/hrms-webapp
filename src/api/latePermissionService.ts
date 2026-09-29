// Late Permission (ADR-0015): заявка «приду к 11:00». Пишет только reports —
// у мини-аппа на late_permissions только чтение; сотрудника сервер берёт из
// токена, guid в теле не нужен.

import { invokeReports } from './reportsService'

export type LatePermissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface LatePermission {
  guid: string
  date: string
  arrive_by: string
  reason: string
  status: LatePermissionStatus
  reject_reason: string | null
  created_at: string
  /** Начало дня по плану — у одобренной уже с разрешением. */
  day_start: string | null
}

export interface LateDayPlan {
  start: string | null
  end: string | null
  /** Код, по которому на этот день просить нельзя, или null. */
  refusal: string | null
}

/** Код отказа сервера (`LATE_PERMISSION:day_off` → `day_off`) или null. */
export function latePermissionErrorCode(error: unknown): string | null {
  const response = (error as { response?: { data?: unknown } })?.response?.data
  const text = `${error instanceof Error ? error.message : ''} ${JSON.stringify(response ?? error ?? '')}`
  return /LATE_PERMISSION:(\w+)/.exec(text)?.[1] ?? null
}

async function call<T>(method: string, data: Record<string, unknown>): Promise<T> {
  const raw = await invokeReports<T & { server_error?: string }>(method, data)
  // Ошибку метода шлюз отдаёт как 200 с `server_error` внутри.
  if (typeof raw?.server_error === 'string' && raw.server_error) throw new Error(raw.server_error)
  return raw
}

export const latePermissionService = {
  listMine: async (): Promise<LatePermission[]> =>
    (await call<{ items?: LatePermission[] }>('late_permission_list', { scope: 'mine' })).items ?? [],
  day: (date: string) => call<LateDayPlan>('late_permission_day', { date }),
  submit: (input: { date: string; arrive_by: string; reason: string }) =>
    call<LatePermission>('late_permission_submit', input),
  withdraw: (guid: string) => call<{ guid: string }>('late_permission_withdraw', { guid }),
}
