// Клиент HRMS Copilot (udevs_hrms_copilot).
//
// Мимо axios-слоя приложения намеренно: чат — это SSE-поток, а интерцептор
// ответов здесь разворачивает ucode-конверт и на стрим не годится. Токен и
// Project-Id поэтому вешаем руками — это те же значения, что и в adminRequest.
//
// ponytail: протокол скопирован из udevs_hrms_admin/src/features/copilot/types.ts
// в урезанном виде (только то, что рисует мини-апп). Общего пакета между
// админкой и вебвью нет, заводить его ради одного файла типов дороже, чем
// синхронизировать руками, когда сервис поменяет контракт.

import { DEFAULT_PROJECT_ID } from './adminRequest'

const BASE_URL = (
  (import.meta.env.VITE_COPILOT_URL as string | undefined) || 'http://localhost:8099'
).replace(/\/+$/, '')

export type CopilotToolRisk = 'read' | 'write' | 'destructive'

export type CopilotErrorCode =
  | 'forbidden'
  | 'permission_denied'
  | 'not_found'
  | 'rate_limited'
  | 'invalid_action'
  | 'action_expired'
  | 'timeout'
  | 'unavailable'
  | 'internal'

export type CopilotStopReason =
  | 'end_turn'
  | 'awaiting_confirmation'
  | 'max_turns'
  | 'max_tokens'
  | 'error'
  | 'refusal'

export interface CopilotChart {
  id: string
  kind: 'area' | 'line' | 'bar' | 'pie' | 'donut'
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  xKey?: string
  series?: Array<{ key: string; label?: string }>
}

export interface CopilotKpi {
  label: string
  value: string
  changePct?: number | null
  hint?: string
}

export interface CopilotLink {
  id: string
  label: string
  href: string
  external?: boolean
  description?: string
}

export interface CopilotTable {
  id: string
  title: string
  subtitle?: string
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, string | number | null>>
  totalCount?: number
  link?: CopilotLink
}

export interface CopilotFieldChange {
  field: string
  label?: string
  before: string | null
  after: string | null
}

export interface CopilotProposedAction {
  actionId: string
  toolName: string
  title: string
  description: string
  risk: CopilotToolRisk
  changes?: CopilotFieldChange[]
}

export interface CopilotExecutedAction {
  actionId: string
  toolName: string
  ok: boolean
  summary: string
  error?: string
}

export type CopilotStreamEvent =
  | { type: 'message_start'; messageId: string; conversationId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolName: string; toolUseId: string; risk: CopilotToolRisk }
  | { type: 'action_executed'; action: CopilotExecutedAction }
  | { type: 'action_proposed'; action: CopilotProposedAction }
  | { type: 'chart'; chart: CopilotChart }
  | { type: 'kpis'; kpis: CopilotKpi[] }
  | { type: 'link'; link: CopilotLink }
  | { type: 'table'; table: CopilotTable }
  | { type: 'message_complete'; messageId: string; stopReason: CopilotStopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string; code?: CopilotErrorCode }

const headers = (): Record<string, string> => {
  const token = localStorage.getItem('auth_token')
  return {
    'Project-Id': DEFAULT_PROJECT_ID,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

const parseRecord = (record: string): CopilotStreamEvent[] => {
  const events: CopilotStreamEvent[] = []
  for (const line of record.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload) continue
    try {
      events.push(JSON.parse(payload) as CopilotStreamEvent)
    } catch {
      // Битый кадр — не повод ронять весь поток.
    }
  }
  return events
}

/**
 * Открывает поток. Руками, а не через EventSource: тот умеет только GET, а
 * сообщение уходит телом.
 */
const openStream = async (
  endpoint: '/copilot/chat' | '/copilot/confirm',
  body: unknown,
  onEvent: (event: CopilotStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok || !response.body) {
    onEvent({
      type: 'error',
      message:
        response.status === 401
          ? 'Сессия истекла. Войдите заново.'
          : 'AI-помощник сейчас недоступен.',
      code: response.status === 401 ? 'forbidden' : 'internal',
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Кадры SSE разделены пустой строкой. Хвост после последнего разделителя —
    // недописанный кадр: держим до следующего чанка, а не парсим половину.
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) for (const event of parseRecord(part)) onEvent(event)
  }
}

export const streamChat = (
  body: { conversationId?: string | null; message: string },
  onEvent: (event: CopilotStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => openStream('/copilot/chat', body, onEvent, signal)

export const streamConfirm = (
  body: { conversationId: string; actionId: string; decision: 'approve' | 'reject' },
  onEvent: (event: CopilotStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> => openStream('/copilot/confirm', body, onEvent, signal)
