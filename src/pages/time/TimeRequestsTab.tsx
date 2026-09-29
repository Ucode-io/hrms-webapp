import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useAuth } from '../../context/AuthContext'
import { useCompany } from '../../context/CompanyContext'
import { absenceService, formatDateRu, toIsoDate } from '../../api/absenceService'
import { uploadFile } from '../../api/dashboardService'
import DateField from '../../components/DateField'
import TimeField from '../../components/TimeField'
import {
  reportsService,
  type EmployeeAbsencePolicy,
  type EmployeeAbsenceRequest,
  type EmployeeAbsenceStatus,
} from '../../api/reportsService'
import { takePendingAbsence } from '../../telegram/startParam'
import {
  latePermissionErrorCode,
  latePermissionService,
  type LatePermission,
} from '../../api/latePermissionService'

const DEFAULT_ICON = 'mdi:airplane'
import { useT, type TKey } from '../../i18n'

const STATUS_LABELS: Record<EmployeeAbsenceStatus, TKey> = {
  pending: 'status.pending',
  approved: 'status.approved',
  rejected: 'status.rejected',
}

const STATUS_COLORS: Record<EmployeeAbsenceStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-amber-500/15', text: 'text-amber-500' },
  approved: { bg: 'bg-emerald-500/15', text: 'text-emerald-500' },
  rejected: { bg: 'bg-rose-500/15', text: 'text-rose-500' },
}

const GROUP_ORDER: EmployeeAbsenceStatus[] = ['pending', 'approved', 'rejected']

// Leave и Late Permission — общий список заявок, новые даты сверху.
type Entry =
  | { kind: 'absence'; key: string; date: string; status: EmployeeAbsenceStatus; req: EmployeeAbsenceRequest }
  | { kind: 'late'; key: string; date: string; status: EmployeeAbsenceStatus; item: LatePermission }

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

const FILTERS: { key: 'all' | EmployeeAbsenceStatus; label: TKey }[] = [
  { key: 'all', label: 'common.all' },
  { key: 'pending', label: 'status.pending' },
  { key: 'approved', label: 'status.approved' },
  { key: 'rejected', label: 'status.rejected' },
]

/* ── Tab ───────────────────────────────────────────── */

export function TimeRequestsTab() {
  const t = useT()

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
  const requests = useMemo<EmployeeAbsenceRequest[]>(() => data?.requests ?? [], [data])

  const { data: lateItems = [], refetch: refetchLate } = useQuery({
    queryKey: ['late-permissions-mine', employeeGuid],
    queryFn: latePermissionService.listMine,
    enabled: Boolean(employeeGuid),
  })
  const [showLate, setShowLate] = useState(false)
  const [showChoice, setShowChoice] = useState(false)

  // Пришли из бота кнопкой «Отпроситься» — сначала выбор «опоздаю / не приду».
  const [pendingCreate, setPendingCreate] = useState(takePendingAbsence)
  if (pendingCreate) {
    setPendingCreate(false)
    setShowChoice(true)
  }

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...requests.map((req) => ({
        kind: 'absence' as const, key: req.guid, date: req.date_from || '', status: req.status, req,
      })),
      ...lateItems
        .filter((item) => item.status !== 'withdrawn')
        .map((item) => ({
          kind: 'late' as const, key: item.guid, date: item.date, status: item.status as EmployeeAbsenceStatus, item,
        })),
    ]
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [requests, lateItems])

  const policyById = useMemo(() => {
    const m = new Map<string, EmployeeAbsencePolicy>()
    policies.forEach((p) => m.set(p.guid, p))
    return m
  }, [policies])

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((r) => r.status === filter)),
    [entries, filter],
  )

  const grouped = useMemo(() => {
    if (filter !== 'all') return null
    const map = new Map<EmployeeAbsenceStatus, Entry[]>()
    for (const status of GROUP_ORDER) map.set(status, [])
    for (const r of filtered) map.get(r.status)?.push(r)
    return map
  }, [filtered, filter])

  const counts = useMemo(() => {
    const c = { all: entries.length, pending: 0, approved: 0, rejected: 0 }
    entries.forEach((r) => {
      if (r.status in c) c[r.status] += 1
    })
    return c
  }, [entries])

  const renderEntry = (entry: Entry) =>
    entry.kind === 'late' ? (
      <LateRow key={entry.key} item={entry.item} brandColor={company.mainColor} onChanged={() => void refetchLate()} />
    ) : (
      <RequestRow
        key={entry.key}
        req={entry.req}
        pol={policyById.get(entry.req.absence_policies_id || '')}
        brandColor={company.mainColor}
      />
    )

  /* ── Loading / Error ── */
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 overflow-hidden">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="min-w-[180px] shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 animate-pulse"
            >
              <div className="h-9 w-9 rounded-xl bg-[var(--surface-muted)]" />
              <div className="mt-4 h-8 w-16 rounded bg-[var(--surface-muted)]" />
              <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-muted)]" />
              <div className="mt-3 h-9 rounded-xl bg-[var(--surface-muted)]" />
            </div>
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[72px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (error && !policies.length) {
    return (
      <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-8 text-center text-sm animate-fade-in-up">
        {t('absence.loadFailed')}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-5 animate-fade-in-up">
        {/* ── Late Permission — отдельно от балансов: баланса у него нет ── */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex items-center gap-3 shadow-sm">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${company.mainColor}22`, color: company.mainColor }}
          >
            <Icon icon="mdi:clock-alert-outline" width={20} height={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">{t('late.cardTitle')}</p>
            <p className="m-0 mt-0.5 text-[11px] text-[var(--text-muted)] leading-snug">{t('late.cardHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowLate(true)}
            className="shrink-0 h-9 px-4 rounded-xl border-0 text-[12px] font-bold text-white cursor-pointer shadow-sm transition-all active:scale-[0.97]"
            style={{ background: company.mainColor }}
          >
            {t('late.create')}
          </button>
        </div>

        {/* ── Balance cards ── */}
        {policies.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-0.5 -mx-4 pl-4 pr-4 snap-x snap-proximity scroll-pl-4 scroll-pr-4 scrollbar-hide">
            {policies.map((pol) => {
              const pct = pol.limit > 0 ? Math.min((pol.used_days / pol.limit) * 100, 100) : 0
              const ic = typeof pol.icon === 'string' && pol.icon ? pol.icon : DEFAULT_ICON
              const clr = hexColor(pol.color, company.mainColor)
              const eligible = pol.eligible !== false

              return (
                <div
                  key={pol.guid}
                  className="min-w-[180px] shrink-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 flex flex-col justify-between gap-3 shadow-sm snap-start"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${clr}22`, color: clr }}
                    >
                      <Icon icon={ic} width={18} height={18} />
                    </div>
                    <p className="m-0 text-[13px] font-bold text-[var(--text-main)] leading-tight line-clamp-2">
                      {pol.title}
                    </p>
                  </div>
                  <div>
                    <p className="m-0 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                      {t('absence.available')}
                    </p>
                    <div className="flex items-end gap-1 mt-1">
                      <span
                        className="text-[28px] font-extrabold leading-none"
                        style={{ color: clr }}
                      >
                        {pol.available % 1 === 0 ? pol.available : pol.available.toFixed(1)}
                      </span>
                      <span className="text-[14px] font-semibold text-[var(--text-secondary)] pb-0.5">
                        {t('absence.ofLimit', { limit: pol.limit })}
                      </span>
                    </div>
                    {pol.pending_days > 0 ? (
                      <p className="m-0 mt-1 text-[10.5px] font-semibold text-amber-500">
                        {t('absence.pendingDays', { days: pol.pending_days % 1 === 0 ? pol.pending_days : pol.pending_days.toFixed(1) })}
                      </p>
                    ) : null}
                    {!eligible ? (
                      <p className="m-0 mt-1.5 rounded-lg bg-amber-500/15 px-2 py-1 text-[10.5px] font-semibold text-amber-500">
                        {pol.eligible_at
                          ? t('absence.eligibleFrom', { date: formatDateRu(pol.eligible_at) })
                          : t('absence.eligibleAfter', { months: pol.min_months ?? 0 })}
                      </p>
                    ) : null}
                  </div>
                  <div className="h-[5px] rounded-full bg-[var(--surface-muted)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: clr }}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!eligible}
                    onClick={() => {
                      setInitPolicyId(pol.guid)
                      setShowCreate(true)
                    }}
                    className="w-full h-9 rounded-xl border-0 text-[12px] font-bold cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    style={{ background: `${clr}22`, color: clr }}
                  >
                    {t('absence.create')}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-10 text-center text-sm text-[var(--text-muted)]">
            {t('absence.noPolicies')}
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
                className={`shrink-0 px-3.5 py-2 rounded-full text-[12px] font-bold border cursor-pointer transition-all active:scale-95 ${
                  act
                    ? 'border-transparent text-white'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
                style={act ? { background: company.mainColor } : undefined}
              >
                {t(o.label)}
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
        <section className="flex flex-col gap-4">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-10 text-center flex flex-col items-center gap-2">
              <span className="text-3xl">📋</span>
              <p className="m-0 text-sm font-medium text-[var(--text-muted)]">{t('absence.noRequests')}</p>
            </div>
          ) : grouped ? (
            GROUP_ORDER.map((status) => {
              const items = grouped.get(status) || []
              if (items.length === 0) return null
              return (
                <div key={status} className="flex flex-col gap-2">
                  <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">
                    {t(STATUS_LABELS[status])}
                  </p>
                  {items.map(renderEntry)}
                </div>
              )
            })
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(renderEntry)}
            </div>
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
          style={{ background: `color-mix(in srgb, ${company.mainColor} 55%, white)` }}
          aria-label={t('absence.create')}
        >
          <Icon icon="mdi:plus" width={24} />
        </button>
      )}

      {/* ── Create Drawer ── */}
      {/* handleOnly: drag is restricted to the handle so the form controls
          (select / date inputs) stay tappable — otherwise vaul's drag gesture
          swallows taps and the native pickers never open. */}
      <Drawer.Root open={showCreate} onOpenChange={setShowCreate} handleOnly>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none max-h-[92vh] flex flex-col">
            <Drawer.Title className="sr-only">{t('absence.newRequestSr')}</Drawer.Title>
            <Drawer.Description className="sr-only">
              {t('absence.newRequestSrDesc')}
            </Drawer.Description>
            <div className="flex justify-center pt-3 pb-1">
              <Drawer.Handle className="!w-10 !h-[4px] !bg-gray-300" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]">
              <CreateForm
                policies={policies}
                initPolicyId={initPolicyId}
                color={company.mainColor}
                employeeGuid={employeeGuid}
                onClose={() => setShowCreate(false)}
                onDone={() => {
                  setShowCreate(false)
                  void refetch()
                }}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* ── Late Permission Drawer ── */}
      <Drawer.Root open={showLate} onOpenChange={setShowLate} handleOnly>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none h-[88vh] max-h-[92vh] flex flex-col">
            <Drawer.Title className="sr-only">{t('late.newSr')}</Drawer.Title>
            <Drawer.Description className="sr-only">{t('late.newTitle')}</Drawer.Description>
            <div className="flex justify-center pt-3 pb-1">
              <Drawer.Handle className="!w-10 !h-[4px] !bg-gray-300" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]">
              <LateForm
                color={company.mainColor}
                onClose={() => setShowLate(false)}
                onDone={() => {
                  setShowLate(false)
                  void refetchLate()
                }}
              />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* ── «Отпроситься» из бота: опоздаю или не приду ── */}
      <Drawer.Root open={showChoice} onOpenChange={setShowChoice}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none flex flex-col px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <div className="flex justify-center pb-3">
              <Drawer.Handle className="!w-10 !h-[4px] !bg-gray-300" />
            </div>
            <Drawer.Title className="m-0 mb-4 text-[18px] font-extrabold text-[var(--text-main)]">
              {t('late.chooseTitle')}
            </Drawer.Title>
            <Drawer.Description className="sr-only">{t('late.chooseTitle')}</Drawer.Description>
            {[
              { icon: 'mdi:clock-alert-outline', title: t('late.chooseLate'), hint: t('late.chooseLateHint'),
                onClick: () => setShowLate(true), disabled: false },
              { icon: DEFAULT_ICON, title: t('late.chooseAbsent'), hint: t('late.chooseAbsentHint'),
                onClick: () => {
                  setInitPolicyId(policies[0]?.guid || '')
                  setShowCreate(true)
                },
                disabled: policies.length === 0 },
            ].map((option) => (
              <button
                key={option.title}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  setShowChoice(false)
                  option.onClick()
                }}
                className="mb-2.5 w-full text-left rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.985] transition-all disabled:opacity-50"
              >
                <div
                  className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
                  style={{ background: `${company.mainColor}22`, color: company.mainColor }}
                >
                  <Icon icon={option.icon} width={20} height={20} />
                </div>
                <div className="min-w-0">
                  <p className="m-0 text-[14px] font-bold text-[var(--text-main)]">{option.title}</p>
                  <p className="m-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">{option.hint}</p>
                </div>
              </button>
            ))}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

/* ── Late Permission Row ──────────────────────────── */

function LateRow({
  item,
  brandColor,
  onChanged,
}: {
  item: LatePermission
  brandColor: string
  onChanged: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const status = item.status as EmployeeAbsenceStatus
  const sc = STATUS_COLORS[status]

  const withdraw = async () => {
    setBusy(true)
    setErr('')
    try {
      await latePermissionService.withdraw(item.guid)
      onChanged()
    } catch (error) {
      const code = latePermissionErrorCode(error)
      setErr(code === 'not_pending' ? t('late.error.not_pending') : t('late.error.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left border-0 bg-transparent p-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.985] transition-all"
      >
        <div
          className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
          style={{ background: `${brandColor}22`, color: brandColor }}
        >
          <Icon icon="mdi:clock-alert-outline" width={18} height={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)] truncate">
              {t('late.title', { time: item.arrive_by })}
            </p>
            {sc ? (
              <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold ${sc.bg} ${sc.text}`}>
                {t(STATUS_LABELS[status])}
              </span>
            ) : null}
          </div>
          <p className="m-0 mt-0.5 text-[11px] text-[var(--text-muted)]">{formatDateRu(item.date)}</p>
        </div>
        <Icon
          icon="mdi:chevron-down"
          width={16}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-[var(--line)]">
          <div className="mt-3 p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--line)] flex items-center gap-1.5">
            <Icon icon="mdi:comment-outline" width={14} className="text-[var(--text-muted)] shrink-0" />
            <p className="m-0 text-[12px] text-[var(--text-secondary)] leading-relaxed">{item.reason}</p>
          </div>
          {item.status === 'rejected' && item.reject_reason ? (
            <div className="mt-2.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <p className="m-0 text-[10px] text-rose-500 uppercase tracking-wider font-semibold">
                {t('absence.rejectReason')}
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-[var(--text-main)] leading-relaxed">{item.reject_reason}</p>
            </div>
          ) : null}
          {item.status === 'pending' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void withdraw()}
              className="mt-2.5 w-full h-10 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold text-rose-500 cursor-pointer active:scale-[0.98] disabled:opacity-50"
            >
              {t('late.withdraw')}
            </button>
          ) : null}
          {err ? <p className="m-0 mt-2 text-[12px] text-[var(--error-text)]">{err}</p> : null}
        </div>
      )}
    </div>
  )
}

/* ── Late Permission Form ─────────────────────────── */

function formatDelay(t: ReturnType<typeof useT>, minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return [h ? t('late.hours', { h }) : '', m ? t('late.minutes', { m }) : ''].filter(Boolean).join(' ')
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

function LateForm({
  color,
  onClose,
  onDone,
}: {
  color: string
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const today = toIsoDate(new Date())
  const [date, setDate] = useState(today)
  const [arriveBy, setArriveBy] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const { data: plan } = useQuery({
    queryKey: ['late-permission-day', date],
    queryFn: () => latePermissionService.day(date),
  })

  const errorText = (code: string | null) => {
    const key = `late.error.${code}` as TKey
    return code && t(key) !== key ? t(key) : t('late.error.generic')
  }

  const startMinutes = plan?.start ? toMinutes(plan.start) : null
  const arriveMinutes = arriveBy ? toMinutes(arriveBy) : null
  const delay = startMinutes != null && arriveMinutes != null ? arriveMinutes - startMinutes : null

  const submit = async () => {
    setSubmitting(true)
    setErr('')
    try {
      await latePermissionService.submit({ date, arrive_by: arriveBy, reason: reason.trim() })
      onDone()
    } catch (error) {
      setErr(errorText(latePermissionErrorCode(error)))
    } finally {
      setSubmitting(false)
    }
  }

  const labelCls = 'text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[18px] font-extrabold text-[var(--text-main)]">{t('late.newTitle')}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-9 h-9 rounded-xl border-0 bg-[var(--surface-muted)] text-[var(--text-main)] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        >
          <Icon icon="mdi:close" width={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>{t('late.date')}</label>
          <DateField value={date} min={today} accent={color} onChange={setDate} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls}>{t('late.arriveBy')}</label>
          <TimeField value={arriveBy} onChange={setArriveBy} defaultValue={plan?.start || undefined} accent={color} />
        </div>
      </div>

      {plan?.refusal ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 px-4 py-2.5 text-[13px] font-medium">
          {errorText(plan.refusal)}
        </div>
      ) : plan?.start ? (
        <p className="m-0 -mt-2 text-[12px] text-[var(--text-muted)]">
          {t('late.bySchedule', {
            start: plan.start,
            delay: delay != null && delay > 0 ? formatDelay(t, delay) : '…',
          })}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>{t('late.reason')}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('late.reasonPlaceholder')}
          rows={3}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[14px] text-[var(--text-main)] outline-none resize-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {err && (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-2.5 text-[13px] font-medium">
          {err}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || !arriveBy || !reason.trim() || Boolean(plan?.refusal)}
        onClick={() => void submit()}
        className="w-full h-[52px] rounded-2xl text-white font-bold text-[15px] border-0 cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg"
        style={{ background: color }}
      >
        {submitting ? t('late.submitting') : t('late.submit')}
      </button>
    </div>
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
  const t = useT()

  const [open, setOpen] = useState(false)
  const sc = STATUS_COLORS[req.status]
  const policyIcon = req.policy?.icon || pol?.icon || ''
  const ic = typeof policyIcon === 'string' && policyIcon ? policyIcon : DEFAULT_ICON
  const policyColorRaw = req.policy?.color || pol?.color || null
  const clr = hexColor(policyColorRaw, brandColor)
  const title = req.policy?.title || pol?.title || t('absence.defaultTitle')

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden transition-all active:scale-[0.985]"
    >
      <div className="p-3.5 flex items-center gap-3">
        <div
          className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
          style={{ background: `${clr}22`, color: clr }}
        >
          <Icon icon={ic} width={18} height={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)] truncate">{title}</p>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold ${sc.bg} ${sc.text}`}
            >
              {t(STATUS_LABELS[req.status])}
            </span>
          </div>
          <p className="m-0 mt-0.5 text-[11px] text-[var(--text-muted)]">
            {formatDateRu(req.date_from || '')} — {formatDateRu(req.date_to || '')}
            {req.requested_days > 0 && ` · ${t('absence.days', { days: req.requested_days })}`}
          </p>
        </div>
        <Icon
          icon="mdi:chevron-down"
          width={16}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 border-t border-[var(--line)]">
          <div className="grid grid-cols-2 gap-2 pt-3">
            {[
              [t('absence.from'), formatDateRu(req.date_from || '')],
              [t('absence.to'), formatDateRu(req.date_to || '')],
              [t('absence.daysLabel'), String(req.requested_days)],
              [t('absence.createdAt'), formatDateRu((req.created_at || '').slice(0, 10))],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="m-0 text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                  {l}
                </p>
                <p className="m-0 mt-0.5 text-[13px] font-bold text-[var(--text-main)]">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-2.5 p-2.5 rounded-xl bg-[var(--surface-muted)] border border-[var(--line)] flex items-center gap-1.5">
            <Icon icon="mdi:comment-outline" width={14} className="text-[var(--text-muted)] shrink-0" />
            <p className="m-0 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              {req.note || t('absence.noNote')}
            </p>
          </div>
          {req.status === 'rejected' && req.reject_reason ? (
            <div className="mt-2.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <p className="m-0 text-[10px] text-rose-500 uppercase tracking-wider font-semibold">
                {t('absence.rejectReason')}
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-[var(--text-main)] leading-relaxed">
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
  onClose,
  onDone,
}: {
  policies: EmployeeAbsencePolicy[]
  initPolicyId: string
  color: string
  employeeGuid: string
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()

  const [policyId, setPolicyId] = useState(initPolicyId || policies[0]?.guid || '')
  const [dateFrom, setDateFrom] = useState(() => toIsoDate(new Date()))
  const [dateTo, setDateTo] = useState(() => toIsoDate(new Date()))
  const [note, setNote] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  const days = useMemo(() => countWeekdays(dateFrom, dateTo), [dateFrom, dateTo])
  const selected = policies.find((p) => p.guid === policyId)
  const avail = selected?.available ?? 0
  const forecast = avail - days
  const eligible = selected ? selected.eligible !== false : true

  const submit = async () => {
    if (!policyId || days <= 0) return
    if (selected && selected.eligible === false) {
      setErr(
        selected.eligible_at
          ? t('absence.typeEligibleFrom', { date: formatDateRu(selected.eligible_at) })
          : t('absence.typeEligibleAfter', { months: selected.min_months ?? 0 }),
      )
      return
    }
    setSubmitting(true)
    setErr('')
    try {
      const attachmentUrl = attachment ? await uploadFile(attachment) : ''
      await absenceService.create({
        user_base_id: employeeGuid,
        absence_policies_id: policyId,
        date_from: dateFrom,
        date_to: dateTo,
        requested_days: days,
        note: note.trim() || undefined,
        attachments: attachmentUrl ? [attachmentUrl] : undefined,
        status: ['pending'] as unknown as string,
      })
      onDone()
    } catch {
      setErr(t('absence.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'mobile-input h-12 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="m-0 text-[18px] font-extrabold text-[var(--text-main)]">{t('absence.newTitle')}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-9 h-9 rounded-xl border-0 bg-[var(--surface-muted)] text-[var(--text-main)] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        >
          <Icon icon="mdi:close" width={18} />
        </button>
      </div>

      {/* Policy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          {t('absence.type')}
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
            {t('absence.dateFrom')}
          </label>
          <DateField
            value={dateFrom}
            accent={color}
            onChange={(iso) => {
              setDateFrom(iso)
              if (dateTo < iso) setDateTo(iso)
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            {t('absence.dateTo')}
          </label>
          <DateField
            value={dateTo}
            min={dateFrom}
            accent={color}
            align="right"
            onChange={(iso) => setDateTo(iso)}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-2xl bg-[var(--surface-muted)] border border-[var(--line)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{t('absence.workingDays')}</span>
          <span className="text-[15px] font-extrabold text-[var(--text-main)]">{t('absence.days', { days })}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{t('absence.available')}</span>
          <span className="text-[15px] font-extrabold text-[var(--text-main)]">
            {t('absence.days', { days: avail % 1 === 0 ? avail : avail.toFixed(1) })}
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{t('absence.balance')}</span>
          <span className={`text-[15px] font-extrabold ${forecast < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
            {t('absence.days', { days: forecast % 1 === 0 ? forecast : forecast.toFixed(1) })}
          </span>
        </div>
      </div>

      {/* Note */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          {t('absence.note')}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('absence.notePlaceholder')}
          rows={2}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-[14px] text-[var(--text-main)] outline-none resize-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* Attachment */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          {t('absence.attachment')}
        </label>
        <label className="inline-flex w-fit items-center gap-1.5 text-[13px] font-bold cursor-pointer" style={{ color }}>
          <Icon icon="mdi:tray-arrow-up" width={16} />
          {t('absence.uploadFile')}
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => setAttachment(e.target.files?.[0] || null)}
          />
        </label>
        <p className="m-0 text-[12px] text-[var(--text-muted)]">
          {attachment ? attachment.name : t('absence.noFile')}
        </p>
      </div>

      {!eligible && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 px-4 py-2.5 text-[13px] font-medium">
          {selected?.eligible_at
            ? t('absence.typeEligibleFrom', { date: formatDateRu(selected.eligible_at) })
            : t('absence.typeEligibleAfter', { months: selected?.min_months ?? 0 })}
        </div>
      )}

      {err && (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-2.5 text-[13px] font-medium">
          {err}
        </div>
      )}

      <button
        type="button"
        disabled={submitting || !policyId || days <= 0 || !eligible}
        onClick={() => void submit()}
        className="w-full h-[52px] rounded-2xl text-white font-bold text-[15px] border-0 cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50 shadow-lg"
        style={{ background: color }}
      >
        {submitting ? t('absence.submitting') : t('absence.submit')}
      </button>
    </div>
  )
}
