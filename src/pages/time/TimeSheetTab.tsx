import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useT, tr, weekdayNames, getLang, type TKey, formatDateLocal } from '../../i18n'
import { useAuth } from '../../context/AuthContext'
import { useCompany } from '../../context/CompanyContext'
import {
  attendanceService,
  normalizeActionStatus,
  normalizeTime,
  normalizeWorkflowStatus,
  toIsoDate,
  type AttendanceRecord,
} from '../../api/attendanceService'
import { resolveCompaniesId } from '../../api/adminRequest'
import { reportsService } from '../../api/reportsService'
// Единый формат сумм по всему приложению — чтобы валюта не разъезжалась
// между экранами «Зарплата» и «Учёт времени».
import { formatAmount } from '../../api/payrollService'
import { CheckInSummary } from '../../components/CheckInActions'

/* ── Date helpers ────────────────────────────────────── */
function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthKeyToDate(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

function monthLabel(key: string): string {
  const d = monthKeyToDate(key)
  return formatDateLocal(d, { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase())
}

function daysInMonth(key: string): number {
  const d = monthKeyToDate(key)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

// Mon = 0 … Sun = 6
function firstWeekdayOfMonth(key: string): number {
  const d = monthKeyToDate(key)
  return (d.getDay() + 6) % 7
}

function isWeekend(dayNum: number, key: string): boolean {
  const d = monthKeyToDate(key)
  const wd = new Date(d.getFullYear(), d.getMonth(), dayNum).getDay()
  return wd === 0 || wd === 6
}

function countWorkdaysInMonth(key: string): number {
  const total = daysInMonth(key)
  let count = 0
  for (let i = 1; i <= total; i++) if (!isWeekend(i, key)) count++
  return count
}

function countElapsedWorkdays(key: string, todayIso: string): number {
  const today = new Date(todayIso)
  const d = monthKeyToDate(key)
  const total = daysInMonth(key)
  let count = 0
  for (let i = 1; i <= total; i++) {
    const cur = new Date(d.getFullYear(), d.getMonth(), i)
    if (cur > today) break
    if (!isWeekend(i, key)) count++
  }
  return count
}

function isoForDay(key: string, day: number): string {
  const d = monthKeyToDate(key)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function recordDateIso(r: AttendanceRecord): string {
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) return r.date
  const s = typeof r.created_at === 'string' ? r.created_at : ''
  const p = new Date(s); return isNaN(p.getTime()) ? '' : toIsoDate(p)
}

/* ── Day status type ─────────────────────────────────── */
type DayStatus = 'present' | 'late' | 'absent' | 'active' | 'future' | 'weekend' | 'empty'

function getDayStatus(
  day: number,
  key: string,
  todayIso: string,
  recordsByDate: Map<string, AttendanceRecord[]>,
): DayStatus {
  const iso = isoForDay(key, day)
  if (isWeekend(day, key)) return 'weekend'
  if (iso > todayIso) return 'future'
  if (iso === todayIso) {
    const recs = recordsByDate.get(iso) || []
    if (recs.length > 0) {
      const last = recs[0]
      const inn = normalizeTime(String(last.check_in_time || ''))
      const out = normalizeTime(String(last.check_out_time || ''))
      if (inn && !out) return 'active'
      const actionStatus = normalizeActionStatus(last.action_status)
      if (actionStatus === 'late') return 'late'
      if (actionStatus === 'absent') return 'absent'
      return 'present'
    }
    return 'active'
  }
  const recs = recordsByDate.get(iso) || []
  if (recs.length === 0) return 'empty'
  const last = recs[0]
  const actionStatus = normalizeActionStatus(last.action_status)
  if (actionStatus === 'late') return 'late'
  if (actionStatus === 'absent') return 'absent'
  return 'present'
}

/* ── Status visual config ────────────────────────────── */
const DAY_STATUS_STYLE: Record<DayStatus, { cell: string; num: string; dot?: string }> = {
  present: { cell: 'bg-emerald-500/15 border border-emerald-500/30', num: 'text-emerald-500 font-bold', dot: 'bg-emerald-400' },
  late:    { cell: 'bg-amber-500/15 border border-amber-500/30',    num: 'text-amber-500 font-bold',   dot: 'bg-amber-400' },
  absent:  { cell: 'bg-rose-500/15 border border-rose-500/30',      num: 'text-rose-500 font-bold',    dot: 'bg-rose-400' },
  active:  { cell: 'border-2 border-[var(--accent)] bg-[var(--accent-light)]', num: 'text-[var(--accent)] font-extrabold' },
  future:  { cell: 'bg-transparent', num: 'text-[var(--text-muted)] opacity-50 font-medium' },
  weekend: { cell: 'bg-[var(--surface-muted)]', num: 'text-[var(--text-muted)] opacity-60 font-medium' },
  empty:   { cell: 'bg-transparent', num: 'text-[var(--text-muted)] opacity-70 font-medium' },
}

// Подписи — ключи: объекты собираются на импорт модуля, до выбора языка.
const ACTION_BADGE: Record<string, { label: TKey | '—'; cls: string; icon: string }> = {
  present: { label: 'sheet.present', cls: 'bg-emerald-500/15 text-emerald-500',    icon: 'mdi:check-circle' },
  late:    { label: 'sheet.late',    cls: 'bg-amber-500/15 text-amber-500',        icon: 'mdi:clock-alert' },
  absent:  { label: 'sheet.absent',  cls: 'bg-rose-500/15 text-rose-500',          icon: 'mdi:close-circle' },
  active:  { label: 'sheet.active',  cls: 'bg-[var(--accent-light)] text-[var(--accent)]', icon: 'mdi:circle' },
  unknown: { label: '—',             cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]', icon: 'mdi:minus' },
}

const WORKFLOW_BADGE: Record<string, { label: TKey | '—'; cls: string }> = {
  accepted:  { label: 'sheet.accepted',  cls: 'bg-emerald-500/15 text-emerald-500' },
  requested: { label: 'sheet.requested', cls: 'bg-amber-500/15 text-amber-500' },
  rejected:  { label: 'status.rejected', cls: 'bg-rose-500/15 text-rose-500' },
  unknown:   { label: '—',               cls: 'bg-[var(--surface-muted)] text-[var(--text-muted)]' },
}

/** '—' у неизвестного статуса — не ключ, переводить нечего. */
const badgeLabel = (label: TKey | '—'): string => (label === '—' ? label : tr(label))

/* ── Calendar grid ───────────────────────────────────── */
function CalendarGrid({
  monthKey,
  todayIso,
  recordsByDate,
  onDayPress,
}: {
  monthKey: string
  todayIso: string
  recordsByDate: Map<string, AttendanceRecord[]>
  onDayPress: (iso: string) => void
}) {
  const t = useT()

  const total = daysInMonth(monthKey)
  const firstWd = firstWeekdayOfMonth(monthKey)
  const cells: (number | null)[] = [
    ...Array(firstWd).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-7 mb-1">
        {weekdayNames(getLang()).map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-bold py-1 ${i >= 5 ? 'text-rose-400' : 'text-[var(--text-muted)]'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Rows */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />
          const iso = isoForDay(monthKey, day)
          const status = getDayStatus(day, monthKey, todayIso, recordsByDate)
          const style = DAY_STATUS_STYLE[status]
          const recs = recordsByDate.get(iso) || []
          const checkIn = recs.length > 0 ? normalizeTime(String(recs[0].check_in_time || '')) : ''
          const isToday = iso === todayIso
          const interactive = status !== 'future' && status !== 'weekend'

          return (
            <button
              key={iso}
              type="button"
              aria-label={t('sheet.dayNumber', { day })}
              onClick={() => interactive && onDayPress(iso)}
              className={`relative flex flex-col items-center justify-center rounded-xl py-1.5 min-h-[46px] transition-all active:scale-95 ${style.cell} ${
                isToday && status !== 'active' ? 'ring-2 ring-[var(--accent)]/50' : ''
              } ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className={`text-[13px] leading-none ${style.num}`}>{day}</span>
              {checkIn && (
                <span className="mt-0.5 text-[9px] font-medium text-[var(--text-muted)] leading-none">{checkIn}</span>
              )}
              {style.dot && !checkIn && (
                <span className={`mt-1 h-1.5 w-1.5 rounded-full ${style.dot}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-[var(--line)] pt-3">
        {[
          { color: 'bg-emerald-400', label: t('sheet.present') },
          { color: 'bg-amber-400', label: t('sheet.late') },
          { color: 'bg-rose-400', label: t('sheet.absent') },
          { color: 'bg-[var(--accent)]', label: t('sheet.active') },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${color}`} />
            <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Record detail drawer ────────────────────────────── */
function RecordDetailDrawer({ record, open, onClose }: {
  record: AttendanceRecord | null
  open: boolean
  onClose: () => void
}) {
  const t = useT()

  if (!record) return null
  const iso = recordDateIso(record)
  const checkIn = normalizeTime(String(record.check_in_time || '')) || '—'
  const checkOut = normalizeTime(String(record.check_out_time || '')) || '—'
  const duration = (() => {
    const toMin = (t: string) => {
      const n = normalizeTime(t); if (!n) return null
      const [h, m] = n.split(':').map(Number)
      return h * 60 + m
    }
    const a = toMin(String(record.check_in_time || '')), b = toMin(String(record.check_out_time || ''))
    if (a == null || b == null || b <= a) return ''
    const diff = b - a
    const h = Math.floor(diff / 60), m = diff % 60
    return tr('sheet.hoursMinutes', { hours: h, minutes: String(m).padStart(2, '0') })
  })()
  const actionStatus = normalizeActionStatus(record.action_status)
  const workflowStatus = normalizeWorkflowStatus(record.status)
  const actionCfg = ACTION_BADGE[actionStatus] || ACTION_BADGE.unknown
  // Только записанное опоздание: своего расчёта здесь нет, он был бы
  // вычитанием чужих 09:00 (CONTEXT.md, Lateness). В строке уже лежит цифра,
  // посчитанная по графику сотрудника при записи.
  const delay = normalizeTime(String(record.delay_time || '')) || '00:00'
  const d = iso ? new Date(iso) : null

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none">
          <Drawer.Title className="sr-only">{t('sheet.detailsSr')}</Drawer.Title>
          <Drawer.Description className="sr-only">{t('sheet.detailsSrDesc')}</Drawer.Description>
          <div className="flex justify-center pt-3 pb-2"><div className="h-1 w-10 rounded-full bg-gray-300" /></div>

          <div className="px-5 pb-[calc(28px+env(safe-area-inset-bottom))]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="m-0 text-[18px] font-extrabold text-[var(--text-main)]">
                  {d ? formatDateLocal(d, { day: 'numeric', month: 'long' }) : iso}
                </p>
                <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)] capitalize">
                  {d ? formatDateLocal(d, { weekday: 'long' }) : ''}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${actionCfg.cls}`}>
                <Icon icon={actionCfg.icon} width={14} />
                {badgeLabel(actionCfg.label)}
              </span>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { icon: 'mdi:login', label: t('check.in'), value: checkIn, color: '#10b981' },
                { icon: 'mdi:logout', label: t('check.out'), value: checkOut, color: '#6366f1' },
              ].map(({ icon, label, value, color }) => (
                <div key={label} className="rounded-2xl bg-[var(--app-bg)] px-4 py-3.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon icon={icon} width={14} style={{ color }} />
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{label}</span>
                  </div>
                  <p className="m-0 text-[22px] font-extrabold text-[var(--text-main)]">{value}</p>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-2xl bg-[var(--app-bg)] px-4 py-3.5">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{t('sheet.duration')}</span>
                <p className="m-0 mt-1 text-[17px] font-extrabold text-[var(--text-main)]">{duration || '—'}</p>
              </div>
              <div className="rounded-2xl bg-[var(--app-bg)] px-4 py-3.5">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">{t('sheet.delay')}</span>
                <p className={`m-0 mt-1 text-[17px] font-extrabold ${delay !== '00:00' ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {delay !== '00:00' ? `+${delay}` : t('sheet.onTime')}
                </p>
              </div>
            </div>

            {/* Workflow */}
            {workflowStatus !== 'unknown' && (
              <div className={`rounded-2xl px-4 py-3 flex items-center gap-2 ${WORKFLOW_BADGE[workflowStatus].cls}`}>
                <Icon icon="mdi:information-outline" width={16} />
                <span className="text-[13px] font-semibold">{badgeLabel(WORKFLOW_BADGE[workflowStatus].label)}</span>
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/* ── Add-record form drawer ──────────────────────────── */
function AddRecordDrawer({ open, defaultDate, employeeGuid, companyId, accentColor, onClose, onSaved }: {
  open: boolean
  defaultDate: string
  employeeGuid: string
  companyId: string
  accentColor: string
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()

  const [form, setForm] = useState({ date: defaultDate, checkIn: '', checkOut: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [prevOpen, setPrevOpen] = useState(open)

  // The drawer stays mounted between opens. Re-seed the form on each open
  // transition (React-recommended "adjust state during render" pattern) so the
  // chosen calendar day is applied and previous input is cleared.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setForm({ date: defaultDate, checkIn: '', checkOut: '' })
      setError('')
    }
  }

  // ponytail: предпросмотр опоздания убран вместе с местной арифметикой —
  // честное число знает только сервер (он читает график), а спрашивать его на
  // каждый тик поля времени дорого. Цифра появляется в строке после сохранения.
  const handleSave = async () => {
    if (!normalizeTime(form.checkIn)) { setError(t('sheet.needCheckIn')); return }
    try {
      setSaving(true)
      await attendanceService.create({
        userBaseId: employeeGuid, companyId,
        date: form.date, checkInTime: form.checkIn, checkOutTime: form.checkOut,
      })
      onSaved()
      onClose()
    } catch { setError(t('sheet.saveFailed')) } finally { setSaving(false) }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none max-h-[90dvh] flex flex-col">
          <Drawer.Title className="sr-only">{t('sheet.addTitle')}</Drawer.Title>
          <Drawer.Description className="sr-only">{t('sheet.addSrDesc')}</Drawer.Description>
          <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-gray-300" /></div>

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
            <p className="m-0 text-[20px] font-extrabold text-[var(--text-main)]">{t('sheet.addTitle')}</p>
            <p className="m-0 mt-1 mb-5 text-[13px] text-[var(--text-muted)]">{t('sheet.addHint')}</p>

            <div className="flex flex-col gap-3">
              {[
                { label: t('sheet.date'), type: 'date', key: 'date' as const },
                { label: t('check.in'), type: 'time', key: 'checkIn' as const },
                { label: t('sheet.checkOutOptional'), type: 'time', key: 'checkOut' as const },
              ].map(({ label, type, key }) => (
                <label key={key} className="block">
                  <span className="block mb-1.5 text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
                  <input
                    type={type}
                    value={form[key]}
                    onChange={(e) => { setForm((p) => ({ ...p, [key]: e.target.value })); setError('') }}
                    className="h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--app-bg)] px-4 text-[15px] font-semibold text-[var(--text-main)] outline-none"
                    style={{ WebkitAppearance: 'none' }}
                  />
                </label>
              ))}
            </div>

            {error && (
              <div className="mt-3 rounded-2xl bg-rose-500/15 px-4 py-3 text-[13px] font-semibold text-rose-500">
                {error}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose} disabled={saving}
                className="h-12 rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-[14px] font-bold text-[var(--text-secondary)]">
                {t('common.cancel')}
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}
                className="h-12 rounded-2xl text-[14px] font-extrabold text-white transition active:scale-[0.98]"
                style={{ background: accentColor }}>
                {saving ? t('sheet.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** «95 мин» → «1 ч 35 мин»: часы читаются быстрее трёхзначных минут. */
function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total))
  if (minutes < 60) return tr('sheet.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0
    ? tr('sheet.hoursAndMinutes', { hours, minutes: rest })
    : tr('sheet.hours', { count: hours })
}

/* ── Stats card ──────────────────────────────────────── */
function StatCard({ icon, iconBg, value, label, sub, valueColor }: {
  icon: string; iconBg: string; value: string; label: string; sub?: string; valueColor?: string
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--line)] px-4 py-4">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-3 ${iconBg}`}>
        <Icon icon={icon} width={18} className="text-white" />
      </div>
      <p className={`m-0 text-[22px] font-extrabold leading-none ${valueColor || 'text-[var(--text-main)]'}`}>
        {value}
      </p>
      <p className="m-0 mt-1 text-[11.5px] text-[var(--text-muted)]">{label}</p>
      {sub && (
        <p className={`m-0 mt-0.5 text-[11px] font-semibold ${valueColor || 'text-[var(--text-muted)]'}`}>
          {sub}
        </p>
      )}
    </div>
  )
}

/* ── Tab ─────────────────────────────────────────────── */
export function TimeSheetTab() {
  const t = useT()

  const { session, profile } = useAuth()
  const { company } = useCompany()
  const accent = company.mainColor || '#3b6cf5'
  const todayIso = toIsoDate(new Date())
  const todayMonthKey = getMonthKey(new Date())

  const [monthKey, setMonthKey] = useState(todayMonthKey)
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addDefaultDate, setAddDefaultDate] = useState(todayIso)

  const employeeGuid = useMemo(() =>
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  , [profile, session])

  const companyId = useMemo(
    () => resolveCompaniesId(profile, session?.user_data, session?.user),
    [profile, session],
  )

  const { data: allRecords = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance', employeeGuid],
    queryFn: () => attendanceService.getByEmployee(employeeGuid),
    enabled: Boolean(employeeGuid),
    staleTime: 60_000,
  })

  /* Records grouped by ISO date */
  const recordsByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord[]>()
    for (const r of allRecords) {
      const iso = recordDateIso(r)
      if (!iso) continue
      if (!map.has(iso)) map.set(iso, [])
      map.get(iso)!.push(r)
    }
    return map
  }, [allRecords])

  const monthPrefix = monthKey + '-'

  /* Опоздания и штраф за месяц — считает сервер: нужны оклад, график работы,
     рабочие дни по календарю праздников и настройки компании (коэффициент и
     «прощаемые» минуты), которых на клиенте нет. */
  const { data: lateness = null } = useQuery({
    queryKey: ['employee-lateness', employeeGuid, monthKey],
    queryFn: () =>
      reportsService.getEmployeeLatenessSummary({
        user_base_id: employeeGuid,
        month: monthKey,
      }),
    enabled: Boolean(employeeGuid),
    staleTime: 60_000,
  })

  /** Пока метод не задеплоен (`lateness === null`) показываем «—», а не «0 сум»:
   *  ноль читался бы как «штрафа нет», хотя данных просто нет. */
  const latenessPenaltyLabel = !lateness
    ? '—'
    : !lateness.has_work_schedule
      ? '—'
      : formatAmount(Math.round(lateness.penalty_amount))

  const latenessPenaltyHint = !lateness
    ? t('sheet.noData')
    : !lateness.has_work_schedule
      ? t('sheet.noSchedule')
      : lateness.penalized_minutes > 0
        ? t('sheet.penaltyOver', { minutes: formatMinutes(lateness.penalized_minutes), grace: lateness.grace_minutes })
        : t('sheet.graceInfo', { grace: lateness.grace_minutes })

  /* Stats — counted per unique day (a day may have several attendance rows) */
  const stats = useMemo(() => {
    const plannedDays = countWorkdaysInMonth(monthKey)
    const elapsedDays = countElapsedWorkdays(monthKey, todayIso)
    let worked = 0, late = 0, absent = 0
    for (const [iso, recs] of recordsByDate) {
      if (!iso.startsWith(monthPrefix) || recs.length === 0) continue
      const s = normalizeActionStatus(recs[0].action_status) // recs[0] = newest
      if (s === 'present' || s === 'late') worked++
      if (s === 'late') late++
      if (s === 'absent') absent++
    }
    const rate = elapsedDays > 0 ? Math.min(100, Math.round((worked / elapsedDays) * 100)) : 0
    const rateLabel = rate >= 95 ? tr('sheet.rateExcellent')
      : rate >= 80 ? tr('sheet.rateGood')
        : rate >= 60 ? tr('sheet.rateFair') : tr('sheet.rateLow')
    return { plannedDays, elapsedDays, worked, late, absent, rate, rateLabel }
  }, [recordsByDate, monthPrefix, monthKey, todayIso])

  const prevMonth = () => {
    const d = monthKeyToDate(monthKey)
    setMonthKey(getMonthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)))
  }
  const nextMonth = () => {
    const d = monthKeyToDate(monthKey)
    setMonthKey(getMonthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)))
  }

  const openAdd = (iso: string) => { setAddDefaultDate(iso); setShowAdd(true) }

  // Tap a calendar day: open its record if one exists, otherwise add a new one.
  const handleDayPress = (iso: string) => {
    const recs = recordsByDate.get(iso)
    if (recs && recs.length > 0) setSelectedRecord(recs[0])
    else openAdd(iso)
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col gap-4">

        {/* ── Month header ──────────────────────────── */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${accent}f0 0%, ${accent}90 100%)` }}>
          <div className="flex items-center justify-between px-4 py-4">
            <button type="button" onClick={prevMonth}
              className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
              <Icon icon="mdi:chevron-left" width={20} className="text-white" />
            </button>
            <div className="text-center">
              <p className="m-0 text-[18px] font-extrabold text-white leading-snug">{monthLabel(monthKey)}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-white/70">
                {t('sheet.progress', { elapsed: stats.elapsedDays, left: stats.plannedDays - stats.elapsedDays })}
              </p>
            </div>
            <button type="button" onClick={nextMonth}
              disabled={monthKey >= todayMonthKey}
              className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
              <Icon icon="mdi:chevron-right" width={20} className="text-white" />
            </button>
          </div>
        </div>

        {/* ── Error ─────────────────────────────────── */}
        {isError && !isLoading && (
          <div className="rounded-2xl bg-rose-500/15 px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon icon="mdi:alert-circle-outline" width={20} className="shrink-0 text-rose-500" />
              <p className="m-0 text-[13px] font-semibold text-rose-500 truncate">{t('sheet.loadFailed')}</p>
            </div>
            <button type="button" onClick={() => void refetch()}
              className="shrink-0 rounded-xl bg-[var(--surface)] px-3 py-1.5 text-[12px] font-bold text-rose-500 active:scale-95 transition-transform">
              {t('events.repeat')}
            </button>
          </div>
        )}

        {/* ── Stats 2×2 ─────────────────────────────── */}
        {!isLoading && !isError && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="mdi:calendar-month" iconBg="bg-indigo-400"
              value={String(stats.plannedDays)} label={t('sheet.workingDays')} sub={t('sheet.elapsed', { count: stats.elapsedDays })} />
            <StatCard icon="mdi:check-circle" iconBg="bg-emerald-400"
              value={String(stats.worked)} label={t('sheet.worked')} valueColor="text-emerald-500" />
            {/* Опоздания: количество и суммарные минуты. Минуты приходят с
                сервера (та же агрегация, что в отчётах и зарплатном Excel) —
                на клиенте их из сырых записей честно не посчитать. */}
            <StatCard icon="mdi:clock-alert" iconBg="bg-amber-400"
              value={String(lateness?.late_days ?? stats.late)} label={t('sheet.lateDays')}
              valueColor={(lateness?.late_days ?? stats.late) > 0 ? 'text-amber-500' : undefined}
              sub={
                lateness
                  ? t('sheet.lateTotal', { minutes: formatMinutes(lateness.late_minutes) })
                  : stats.absent
                    ? t('sheet.absentShort', { count: stats.absent })
                    : undefined
              } />
            <StatCard icon="mdi:cash-remove" iconBg="bg-rose-400"
              value={latenessPenaltyLabel} label={t('sheet.latePenalty')}
              valueColor={(lateness?.penalty_amount ?? 0) > 0 ? 'text-rose-500' : undefined}
              sub={latenessPenaltyHint} />
          </div>
        )}

        {/* ── Check-in / check-out ──────────────────── */}
        <CheckInSummary />

        {/* ── Calendar ──────────────────────────────── */}
        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--line)] px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('sheet.calendar')}</p>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">{monthLabel(monthKey)}</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--line)]" style={{ borderTopColor: accent }} />
            </div>
          ) : (
            <CalendarGrid
              monthKey={monthKey}
              todayIso={todayIso}
              recordsByDate={recordsByDate}
              onDayPress={handleDayPress}
            />
          )}
        </div>
      </div>

      {/* FAB */}
      <button type="button" onClick={() => openAdd(todayIso)}
        className="fixed bottom-[88px] right-4 z-20 h-14 w-14 rounded-2xl text-white shadow-xl flex items-center justify-center transition-transform active:scale-90"
        style={{ background: `color-mix(in srgb, ${accent} 55%, white)` }}>
        <Icon icon="mdi:plus" width={26} />
      </button>

      <RecordDetailDrawer
        record={selectedRecord}
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
      />

      <AddRecordDrawer
        open={showAdd}
        defaultDate={addDefaultDate}
        employeeGuid={employeeGuid}
        companyId={companyId}
        accentColor={accent}
        onClose={() => setShowAdd(false)}
        onSaved={() => void refetch()}
      />
    </>
  )
}
