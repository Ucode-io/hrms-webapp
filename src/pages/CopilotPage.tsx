import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import {
  streamChat,
  streamConfirm,
  type CopilotChart,
  type CopilotErrorCode,
  type CopilotKpi,
  type CopilotLink,
  type CopilotStreamEvent,
  type CopilotTable,
} from '../api/copilotService'

/**
 * AI-помощник внутри мини-аппа.
 *
 * Тот же сервис и тот же протокол, что у панели в админке: здесь нет своей
 * логики агента — только отрисовка событий потока и кнопки подтверждения.
 *
 * ponytail: графики рисуются таблицей — в вебвью нет чарт-библиотеки, а цифры
 * приходят из результата запроса и в таблице читаются честно. Появится спрос —
 * ставим apexcharts и меняем chartToTable на настоящий график.
 */

type ActionState = 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed'

interface Action {
  actionId: string
  title: string
  description: string
  state: ActionState
  changes?: Array<{ field: string; label?: string; before: string | null; after: string | null }>
  summary?: string
  error?: string
}

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  actions?: Action[]
  tables?: CopilotTable[]
  kpis?: CopilotKpi[]
  links?: CopilotLink[]
}

const ERROR_TEXT: Record<CopilotErrorCode, string> = {
  forbidden: 'Нет доступа к этим данным.',
  permission_denied: 'Недостаточно прав для этого действия.',
  not_found: 'Не удалось найти запрошенное.',
  rate_limited: 'Слишком много запросов. Подождите немного и повторите.',
  invalid_action: 'Это действие больше недоступно.',
  action_expired: 'Действие устарело. Повторите запрос.',
  timeout: 'AI-помощник слишком долго отвечал, запрос остановлен.',
  unavailable: 'AI-помощник недоступен. Сообщите администратору.',
  internal: 'Что-то пошло не так. Попробуйте ещё раз.',
}

const SUGGESTIONS = [
  'Сколько у меня осталось отпускных дней?',
  'Покажи мои опоздания за этот месяц',
  'Когда была моя последняя зарплата?',
]

/** График как таблица: те же строки, без библиотеки рисования. */
const chartToTable = (chart: CopilotChart): CopilotTable => {
  const isPie = chart.kind === 'pie' || chart.kind === 'donut'
  const xKey = chart.xKey ?? 'label'
  const columns = isPie
    ? [
        { key: 'name', label: '' },
        { key: 'value', label: 'Значение' },
      ]
    : [
        { key: xKey, label: '' },
        ...(chart.series ?? []).map((s) => ({ key: s.key, label: s.label ?? s.key })),
      ]
  return { id: chart.id, title: chart.title, subtitle: chart.subtitle, columns, rows: chart.data }
}

/**
 * Применяет событие потока к списку сообщений.
 *
 * Артефакт (таблица, ссылка, KPI) после подтверждения действия приходит, когда
 * то сообщение уже закрыто — тогда заводим новое, иначе таблица приклеилась бы
 * под текстом, написанным до того, как она появилась.
 */
function applyEvent(msgs: Msg[], e: CopilotStreamEvent): Msg[] {
  const patchOpen = (mutate: (m: Msg) => Msg, requireStreaming = true): Msg[] => {
    const last = msgs[msgs.length - 1]
    if (last?.role === 'assistant' && (!requireStreaming || last.streaming)) {
      return [...msgs.slice(0, -1), mutate(last)]
    }
    return [
      ...msgs,
      mutate({ id: `local-${msgs.length}`, role: 'assistant', content: '', streaming: requireStreaming }),
    ]
  }

  switch (e.type) {
    case 'message_start':
      return [...msgs, { id: e.messageId, role: 'assistant', content: '', streaming: true }]

    case 'text_delta':
      return patchOpen((m) => ({ ...m, content: m.content + e.text }))

    case 'table':
      return patchOpen((m) => ({ ...m, tables: [...(m.tables ?? []), e.table] }))

    case 'chart':
      return patchOpen((m) => ({ ...m, tables: [...(m.tables ?? []), chartToTable(e.chart)] }))

    case 'kpis':
      return patchOpen((m) => ({ ...m, kpis: e.kpis }))

    case 'link':
      return patchOpen((m) => ({ ...m, links: [...(m.links ?? []), e.link] }))

    case 'action_proposed':
      return patchOpen((m) => ({
        ...m,
        actions: [
          ...(m.actions ?? []),
          {
            actionId: e.action.actionId,
            title: e.action.title,
            description: e.action.description,
            changes: e.action.changes,
            state: 'proposed',
          },
        ],
      }))

    case 'action_executed': {
      const state: ActionState = e.action.ok ? 'executed' : 'failed'
      const known = msgs.some((m) => m.actions?.some((a) => a.actionId === e.action.actionId))
      if (known) {
        return msgs.map((m) =>
          m.actions?.some((a) => a.actionId === e.action.actionId)
            ? {
                ...m,
                actions: m.actions.map((a) =>
                  a.actionId === e.action.actionId
                    ? { ...a, state, summary: e.action.summary, error: e.action.error }
                    : a,
                ),
              }
            : m,
        )
      }
      return patchOpen((m) => ({
        ...m,
        actions: [
          ...(m.actions ?? []),
          {
            actionId: e.action.actionId,
            title: e.action.summary,
            description: '',
            state,
            summary: e.action.summary,
            error: e.action.error,
          },
        ],
      }))
    }

    case 'message_complete':
      return msgs.map((m) => (m.id === e.messageId ? { ...m, streaming: false } : m))

    default:
      return msgs
  }
}

export function CopilotPage() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [isStreaming, setStreaming] = useState(false)
  const [tool, setTool] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const conversationId = useRef<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, tool])

  // Уходя со страницы, обрываем поток: ответ всё равно некому показать, а
  // соединение и токены продолжали бы тратиться.
  useEffect(() => () => controller.current?.abort(), [])

  const run = useCallback(
    async (
      start: (
        onEvent: (event: CopilotStreamEvent) => void,
        signal: AbortSignal,
      ) => Promise<void>,
    ): Promise<void> => {
      controller.current?.abort()
      const own = new AbortController()
      controller.current = own
      setStreaming(true)
      setError(null)
      setTool(null)

      try {
        await start((event) => {
          if (event.type === 'error') {
            setError((event.code && ERROR_TEXT[event.code]) || event.message)
            setTool(null)
            return
          }
          if (event.type === 'message_start') conversationId.current = event.conversationId
          if (event.type === 'tool_call') setTool(event.toolName)
          setMessages((msgs) => applyEvent(msgs, event))
        }, own.signal)
      } catch {
        if (!own.signal.aborted) setError('Соединение с AI-помощником прервалось.')
      } finally {
        // Закрывать состояние вправе только тот запуск, который ещё владеет
        // контроллером: finally отменённого прилетает, когда его сменщик уже в
        // эфире, и сбросил бы флаги живому потоку.
        if (controller.current === own) {
          controller.current = null
          setStreaming(false)
          setTool(null)
          setMessages((msgs) => msgs.map((m) => (m.streaming ? { ...m, streaming: false } : m)))
        }
      }
    },
    [],
  )

  const send = useCallback(
    (text: string): void => {
      const message = text.trim()
      if (!message || isStreaming) return
      setDraft('')
      setMessages((msgs) => [
        ...msgs,
        { id: `user-${msgs.length}`, role: 'user', content: message },
      ])
      void run((onEvent, signal) =>
        streamChat({ conversationId: conversationId.current, message }, onEvent, signal),
      )
    },
    [isStreaming, run],
  )

  const confirm = useCallback(
    (actionId: string, decision: 'approve' | 'reject'): void => {
      const id = conversationId.current
      if (!id || isStreaming) return
      // Отражаем решение сразу: за круг сервис успеет выполнить настоящее
      // действие, а карточка, всё ещё спрашивающая «Подтвердить?», провоцирует
      // второй клик.
      setMessages((msgs) =>
        msgs.map((m) => ({
          ...m,
          actions: m.actions?.map((a) =>
            a.actionId === actionId
              ? { ...a, state: decision === 'approve' ? 'approved' : 'rejected' }
              : a,
          ),
        })),
      )
      void run((onEvent, signal) =>
        streamConfirm({ conversationId: id, actionId, decision }, onEvent, signal),
      )
    },
    [isStreaming, run],
  )

  return (
    <div className="animate-fade-in-up flex flex-col gap-3 flex-1 min-h-0 pb-[132px]">
      {messages.length === 0 && (
        <div className="flex flex-col gap-3 pt-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-light)] flex items-center justify-center">
              <Icon icon="mdi:robot-happy-outline" className="text-[var(--accent)]" width={30} />
            </div>
            <p className="text-[15px] font-semibold text-[var(--text-main)]">AI-помощник HRMS</p>
            <p className="text-[13px] text-[var(--text-muted)] max-w-[260px]">
              Спросите про отпуск, зарплату, график или задачи — отвечу по вашим данным.
            </p>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="text-left text-[13px] px-3.5 py-3 rounded-2xl bg-white border border-[var(--line)]/70 text-[var(--text-main)] active:scale-[0.98] transition"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m) => (
        <Bubble key={m.id} message={m} onConfirm={confirm} busy={isStreaming} />
      ))}

      {isStreaming && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)] px-1">
          <Icon icon="svg-spinners:3-dots-fade" width={22} />
          {tool ? toolLabel(tool) : 'Думаю…'}
        </div>
      )}

      {error && (
        <div className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-2xl px-3.5 py-2.5">
          {error}
        </div>
      )}

      <div ref={bottom} />

      <div className="fixed bottom-[68px] left-0 right-0 z-20 px-4 pb-2 pt-2 bg-[var(--app-bg)]/95 backdrop-blur-xl">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(draft)
              }
            }}
            rows={1}
            maxLength={8000}
            placeholder="Спросите что-нибудь…"
            className="flex-1 resize-none max-h-28 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-[14px] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => (isStreaming ? controller.current?.abort() : send(draft))}
            disabled={!isStreaming && draft.trim().length === 0}
            className="w-11 h-11 shrink-0 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition"
          >
            <Icon icon={isStreaming ? 'mdi:stop' : 'mdi:arrow-up'} width={22} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Имя инструмента человеку. Незнакомое не показываем — оно английское и техническое. */
const toolLabel = (tool: string): string => {
  if (tool.includes('report')) return 'Собираю отчёт…'
  if (tool.includes('knowledge')) return 'Ищу в базе знаний…'
  if (tool.includes('create') || tool.includes('update') || tool.includes('delete'))
    return 'Готовлю изменение…'
  return 'Смотрю данные…'
}

function Bubble({
  message,
  onConfirm,
  busy,
}: {
  message: Msg
  onConfirm: (actionId: string, decision: 'approve' | 'reject') => void
  busy: boolean
}) {
  const isUser = message.role === 'user'
  const hasBody =
    message.content.trim().length > 0 ||
    message.tables?.length ||
    message.kpis?.length ||
    message.links?.length ||
    message.actions?.length
  if (!hasBody) return null

  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      {message.content.trim().length > 0 && (
        <div
          className={`max-w-[85%] whitespace-pre-wrap text-[14px] leading-relaxed px-3.5 py-2.5 rounded-2xl ${
            isUser
              ? 'bg-[var(--accent)] text-white rounded-br-md'
              : 'bg-white border border-[var(--line)]/70 text-[var(--text-main)] rounded-bl-md'
          }`}
        >
          {message.content}
        </div>
      )}

      {message.kpis && message.kpis.length > 0 && (
        <div className="w-full grid grid-cols-2 gap-2">
          {message.kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-2xl bg-white border border-[var(--line)]/70 px-3 py-2.5">
              <p className="text-[11px] text-[var(--text-muted)]">{kpi.label}</p>
              <p className="text-[17px] font-semibold text-[var(--text-main)]">{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      {message.tables?.map((table) => (
        <ResultTable key={table.id} table={table} />
      ))}

      {message.actions?.map((action) => (
        <ActionCard key={action.actionId} action={action} onConfirm={onConfirm} busy={busy} />
      ))}

      {/* Только внешние ссылки: in-app href'ы — это маршруты админки,
          которых в мини-аппе нет, и кнопка вела бы в никуда. */}
      {message.links
        ?.filter((link) => link.external)
        .map((link) => (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] font-medium text-[var(--accent)] px-3.5 py-2 rounded-2xl bg-[var(--accent-light)]"
          >
            {link.label}
          </a>
        ))}
    </div>
  )
}

function ResultTable({ table }: { table: CopilotTable }) {
  return (
    <div className="w-full rounded-2xl bg-white border border-[var(--line)]/70 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--line)]/60">
        <p className="text-[13px] font-semibold text-[var(--text-main)]">{table.title}</p>
        {table.subtitle && <p className="text-[11px] text-[var(--text-muted)]">{table.subtitle}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[var(--text-muted)]">
              {table.columns.map((c) => (
                <th key={c.key} className="text-left font-medium px-3 py-2 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-t border-[var(--line)]/50">
                {table.columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 whitespace-nowrap text-[var(--text-main)]">
                    {row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.totalCount != null && table.totalCount > table.rows.length && (
        <p className="px-3.5 py-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--line)]/60">
          Показано {table.rows.length} из {table.totalCount}
        </p>
      )}
    </div>
  )
}

function ActionCard({
  action,
  onConfirm,
  busy,
}: {
  action: Action
  onConfirm: (actionId: string, decision: 'approve' | 'reject') => void
  busy: boolean
}) {
  return (
    <div className="w-full rounded-2xl bg-white border border-[var(--line)] px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <Icon icon="mdi:alert-circle-outline" className="text-[var(--accent)] shrink-0 mt-0.5" width={18} />
        <div>
          <p className="text-[13px] font-semibold text-[var(--text-main)]">{action.title}</p>
          {action.description && (
            <p className="text-[12px] text-[var(--text-muted)]">{action.description}</p>
          )}
        </div>
      </div>

      {action.changes && action.changes.length > 0 && (
        <div className="flex flex-col gap-1">
          {action.changes.map((c) => (
            <p key={c.field} className="text-[12px] text-[var(--text-muted)]">
              {c.label ?? c.field}: <s>{c.before ?? '—'}</s> → <b className="text-[var(--text-main)]">{c.after ?? '—'}</b>
            </p>
          ))}
        </div>
      )}

      {action.state === 'proposed' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(action.actionId, 'approve')}
            className="flex-1 py-2 rounded-xl bg-[var(--accent)] text-white text-[13px] font-medium disabled:opacity-50 active:scale-[0.98] transition"
          >
            Подтвердить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(action.actionId, 'reject')}
            className="flex-1 py-2 rounded-xl bg-[var(--app-bg)] text-[var(--text-main)] text-[13px] font-medium disabled:opacity-50 active:scale-[0.98] transition"
          >
            Отклонить
          </button>
        </div>
      ) : (
        <p
          className={`text-[12px] ${
            action.state === 'failed' ? 'text-red-600' : 'text-[var(--text-muted)]'
          }`}
        >
          {action.state === 'executed' && (action.summary || 'Выполнено')}
          {action.state === 'failed' && (action.error || 'Не удалось выполнить')}
          {action.state === 'approved' && 'Выполняю…'}
          {action.state === 'rejected' && 'Отклонено'}
        </p>
      )}
    </div>
  )
}
