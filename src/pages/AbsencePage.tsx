import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { absenceService, formatDateRu, toIsoDate } from '../api/absenceService'
import {
  reportsService,
  type EmployeeAbsencePolicy,
  type EmployeeAbsenceRequest,
  type EmployeeAbsenceStatus,
} from '../api/reportsService'

const DEFAULT_ICON = 'mdi:airplane'

const STATUS_LABELS: Record<EmployeeAbsenceStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  rejected: 'Отклонено',
}

const STATUS_COLORS: Record<EmployeeAbsenceStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  approved: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  rejected: { bg: 'bg-rose-50', text: 'text-rose-700' },
}

function countWeekdays(from: string, to: string): number {
  const s = new Date(from)
  const e = new Date(to)
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return 0
  let c = 0
  const cur = new Date(s)
  while (cur <= e && c < 366) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) c++
    cur.setDate(cur.getDate() + 1)
  }
  return c
}

function hexColor(v: unknown, fb: string): string {
  if (typeof v !== 'string') return fb
  return /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : fb
}

const FILTERS: { key: 'all' | EmployeeAbsenceStatus; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'pending', label: 'Ожидает' },
  { key: 'approved', label: 'Одобрено' },
  { key: 'rejected', label: 'Отклонено' },
]

/* ── Page ──────────────────────────────────────────── */

export function AbsencePage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session],
  )

  const [filter, setFilter] = useState<'all' | EmployeeAbsenceStatus>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [initPolicyId, setInitPolicyId] = useState('')

  const summaryQueryKey = useMemo(
    () => ['employee-absence-summary', employeeGuid] as const,
    [employeeGuid],
  )

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: summaryQueryKey,
    queryFn: async () => {
      if (!employeeGuid) return null
      return reportsService.getEmployeeAbsenceSummary({
        user_base_id: employeeGuid,
        as_of_date: toIsoDate(new Date()),
        history_year: new Date().getFullYear(),
      })
    },
    enabled: Boolean(employeeGuid),
  })

  const policies: EmployeeAbsencePolicy[] = data?.policies ?? []
  const requests: EmployeeAbsenceRequest[] = data?.requests ?? []

  const policyById = useMemo(() => {
    const m = new Map<string, EmployeeAbsencePolicy>()
    policies.forEach((p) => m.set(p.guid, p))
    return m
  }, [policies])

  const filtered = useMemo(
    () => (filter === 'all' ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  )

  const counts = useMemo(() => {
    const c = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
    requests.forEach((r) => {
      if (r.status in c) c[r.status] += 1
    })
    return c
  }, [requests])

  /* ── Loading / Error ── */
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 overflow-hidden">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="min-w-[180px] shrink-0 rounded-2xl border border-[var(--line)] bg-white p-4 animate-pulse"
            >
              <div className="h-9 w-9 rounded-xl bg-gray-200" />
              <div className="mt-4 h-8 w-16 rounded bg-gray-200" />
              <div className="mt-3 h-1.5 rounded-full bg-gray-200" />
              <div className="mt-3 h-9 rounded-xl bg-gray-200" />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[72px] rounded-2xl border border-[var(--line)] bg-white animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (error && !policies.length) {
    return (
      <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-8 text-center text-sm animate-fade-in-up">
        Не удалось загрузить данные
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-5 animate-fade-in-up">
        {/* ── Balance cards ── */}
        {policies.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-0.5 -mx-4 pl-4 pr-4 snap-x snap-proximity scroll-pl-4 scroll-pr-4 scrollbar-hide">
            {policies.map((pol) => {
              const pct = pol.limit > 0 ? Math.min((pol.used_days / pol.limit) * 100, 100) : 0
              const ic = typeof pol.icon === 'string' && pol.icon ? pol.icon : DEFAULT_ICON
              const clr = hexColor(pol.color, company.mainColor)

              return (
                <div
                  key={pol.guid}
                  className="min-w-[180px] shrink-0 rounded-2xl border border-[var(--line)] bg-white p-4 flex flex-col justify-between gap-3 shadow-sm snap-start"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${clr}14`, color: clr }}
                    >
                      <Icon icon={ic} width={18} height={18} />
                    </div>
                    <p className="m-0 text-[13px] font-bold text-[var(--text-main)] leading-tight line-clamp-2">
                      {pol.title}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      Доступно
                    </p>
                    <div className="flex items-end gap-1 mt-1">
                      <span
                        className="text-[28px] font-extrabold leading-none"
                        style={{ color: clr }}
                      >
                        {pol.available % 1 === 0 ? pol.available : pol.available.toFixed(1)}
                      </span>
                      <span className="text-[14px] font-semibold text-[var(--text-secondary)] pb-0.5">
                        / {pol.limit} д
                      </span>
                    </div>
                    {pol.pending_days > 0 ? (
                      <p className="m-0 mt-1 text-[10.5px] font-semibold text-amber-600">
                        Ожидает: {pol.pending_days % 1 === 0 ? pol.pending_days : pol.pending_days.toFixed(1)} д
                      </p>
                    ) : null}
                  </div>
                  <div className="h-[5px] rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: clr }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInitPolicyId(pol.guid)
                      setShowCreate(true)
                    }}
                    className="w-full h-9 rounded-xl border-0 text-[12px] font-bold cursor-pointer transition-all active:scale-[0.97]"
                    style={{ background: `${clr}12`, color: clr }}
                  >
                    Создать запрос
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-white py-10 text-center text-sm text-[var(--text-muted)]">
            Политики отсутствий не найдены
          </div>
        )}

        {/* ── Filter pills ── */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {FILTERS.map((o) => {
            const act = filter === o.key
            const cnt = counts[o.key] || 0
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setFilter(o.key)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border cursor-pointer transition-all active:scale-95 ${
                  act
                    ? 'border-transparent text-white'
                    : 'border-[var(--line)] bg-white text-[var(--text-secondary)]'
                }`}
                style={act ? { background: company.mainColor } : undefined}
              >
                {o.label}
                {cnt > 0 && (
                  <span className={`ml-1.5 ${act ? 'opacity-80' : 'text-[var(--text-muted)]'}`}>
                    {cnt}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Requests ── */}
        <section className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-white py-10 text-center flex flex-col items-center gap-2">
              <span className="text-3xl">📋</span>
              <p className="m-0 text-sm font-medium text-[var(--text-muted)]">Нет запросов</p>
            </div>
          ) : (
            filtered.map((req) => (
              <RequestRow
                key={req.guid}
                req={req}
                pol={policyById.get(req.absence_policies_id || '')}
                brandColor={company.mainColor}
              />
            ))
          )}
        </section>
      </div>

      {/* ── FAB ── */}
      {policies.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setInitPolicyId(policies[0]?.guid || '')
            setShowCreate(true)
          }}
          className="fixed bottom-[88px] right-4 z-20 w-14 h-14 rounded-2xl border-0 text-white shadow-xl cursor-pointer flex items-center justify-center transition-transform active:scale-90"
          style={{ background: company.mainColor }}
          aria-label="Создать запрос"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      {/* ── Create Drawer ── */}
      <Drawer.Root open={showCreate} onOpenChange={setShowCreate}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] outline-none max-h-[92vh] flex flex-col">
            <Drawer.Title className="sr-only">Новый запрос на отсутствие</Drawer.Title>
            <Drawer.Description className="sr-only">
              Создание заявки на отсутствие
            </Drawer.Description>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-[4px] bg-gray-300 rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]">
              <CreateForm
                policies={policies}
                initPolicyId={initPolicyId}
                color={company.mainColor}
                employeeGuid={employeeGuid}
                onDone={() => {
                  setShowCreate(false)
                  void refetch()
                }}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

    </>
  )
}

/* ── Request Row ──────────────────────────────────── */

function RequestRow({
  req,
  pol,
  brandColor,
}: {
  req: EmployeeAbsenceRequest
  pol?: EmployeeAbsencePolicy
  brandColor: string
}) {
  const [open, setOpen] = useState(false)
  const sc = STATUS_COLORS[req.status]
  const policyIcon = req.policy?.icon || pol?.icon || ''
  const ic = typeof policyIcon === 'string' && policyIcon ? policyIcon : DEFAULT_ICON
  const policyColorRaw = req.policy?.color || pol?.color || null
  const clr = hexColor(policyColorRaw, brandColor)
  const title = req.policy?.title || pol?.title || 'Отсутствие'

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-2xl border border-[var(--line)] bg-white overflow-hidden transition-all active:scale-[0.985]"
    >
      <div className="p-3.5 flex items-center gap-3">
        <div
          className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
          style={{ background: `${clr}12`, color: clr }}
        >
          <Icon icon={ic} width={18} height={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)] truncate">{title}</p>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold ${sc.bg} ${sc.text}`}
            >
              {STATUS_LABELS[req.status]}
            </span>
          </div>
          <p className="m-0 mt-0.5 text-[11px] text-[var(--text-muted)]">
            {formatDateRu(req.date_from || '')} — {formatDateRu(req.date_to || '')}
            {req.requested_days > 0 && ` · ${req.requested_days} д`}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-[var(--line)]">
          <div className="grid grid-cols-2 gap-2 pt-3">
            {[
              ['Начало', formatDateRu(req.date_from || '')],
              ['Конец', formatDateRu(req.date_to || '')],
              ['Дней', String(req.requested_days)],
              ['Создано', formatDateRu((req.created_at || '').slice(0, 10))],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="m-0 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  {l}
                </p>
                <p className="m-0 mt-0.5 text-[13px] font-bold text-[var(--text-main)]">{v}</p>
              </div>
            ))}
          </div>
          {req.note ? (
            <div className="mt-2.5 p-2.5 rounded-xl bg-gray-50 border border-[var(--line)]">
              <p className="m-0 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                Комментарий
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-[var(--text-secondary)] leading-relaxed">
                {req.note}
              </p>
            </div>
          ) : null}
          {req.status === 'rejected' && req.reject_reason ? (
            <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200">
              <p className="m-0 text-[10px] text-rose-700 uppercase tracking-wider font-semibold">
                Причина отказа
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-rose-800 leading-relaxed">
                {req.reject_reason}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </button>
  )
}

/* ── Create Form ──────────────────────────────────── */

function CreateForm({
  policies,
  initPolicyId,
  color,
  employeeGuid,
  onDone,
}: {
  policies: EmployeeAbsencePolicy[]
  initPolicyId: string
  color: string
  employeeGuid: string
  onDone: () => void
}) {
  const [policyId, setPolicyId] = useState(initPolicyId || policies[0]?.guid || '')
  const [dateFrom, setDateFrom] = useState(() => toIsoDate(new Date()))
  const [dateTo, setDateTo] = useState(() => toIsoDate(new Date()))
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const days = useMemo(() => countWeekdays(dateFrom, dateTo), [dateFrom, dateTo])
  const selected = policies.find((p) => p.guid === policyId)
  const avail = selected?.available ?? 0
  const forecast = avail - days

  const submit = async () => {
    if (!policyId || days <= 0) return
    setSubmitting(true)
    setErr('')
    try {
      await absenceService.create({
        user_base_id: employeeGuid,
        absence_policies_id: policyId,
        date_from: dateFrom,
        date_to: dateTo,
        requested_days: days,
        note: note.trim() || undefined,
        status: ['pending'] as unknown as string,
      })
      onDone()
    } catch {
      setErr('Не удалось создать запрос')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'mobile-input h-12 rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="m-0 text-[20px] font-extrabold text-[var(--text-main)]">Новый запрос</p>
        <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">
          Создание заявки на отсутствие
        </p>
      </div>

      {/* Policy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Тип отсутствия
        </label>
        <select
          value={policyId}
          onChange={(e) => setPolicyId(e.target.value)}
          className={inputCls}
        >
          {policies.map((p) => (
            <option key={p.guid} value={p.guid}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            С
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              if (dateTo < e.target.value) setDateTo(e.target.value)
            }}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            По
          </label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between rounded-2xl bg-gray-50 border border-[var(--line)] px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Раб. дней
          </span>
          <span className="text-[18px] font-extrabold mt-0.5" style={{ color }}>
            {days}
          </span>
        </div>
        <div className="h-8 w-px bg-[var(--line)]" />
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Доступно
          </span>
          <span className="text-[18px] font-extrabold mt-0.5 text-[var(--text-main)]">
            {avail % 1 === 0 ? avail : avail.toFixed(1)}
          </span>
        </div>
        <div className="h-8 w-px bg-[var(--line)]" />
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Остаток
          </span>
          <span
            className={`text-[18px] font-extrabold mt-0.5 ${
              forecast < 0 ? 'text-red-500' : 'text-emerald-600'
            }`}
          >
            {forecast % 1 === 0 ? forecast : forecast.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Note */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          Комментарий
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Необязательно"
          rows={2}
          className="rounded-2xl border border-[var(--line)] bg-gray-50 px-4 py-3 text-[14px] text-[var(--text-main)] outline-none resize-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {err && (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-2.5 text-[13px] font-medium">
          {err}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || !policyId || days <= 0}
        onClick={() => void submit()}
        className="w-full h-[52px] rounded-2xl text-white font-bold text-[15px] border-0 cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg"
        style={{ background: color }}
      >
        {submitting ? 'Создание...' : 'Создать запрос'}
      </button>
    </div>
  )
}
