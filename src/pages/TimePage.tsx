import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import {
  attendanceService,
  computeDelayTimeFromCheckIn,
  normalizeActionStatus,
  normalizeTime,
  normalizeWorkflowStatus,
  toIsoDate,
  type AttendanceRecord,
} from '../api/attendanceService'
import { resolveCompaniesId } from '../api/adminRequest'
import { reportsService } from '../api/reportsService'
// Единый формат сумм по всему приложению — чтобы валюта не разъезжалась
// между экранами «Зарплата» и «Учёт времени».
import { formatAmount } from '../api/payrollService'

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
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
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

function formatTime(t: string | null | undefined): string {
  return normalizeTime(String(t || '')) || '—'
}

function formatDuration(inTime: string, outTime: string): string {
  const toMin = (t: string) => {
    const n = normalizeTime(t); if (!n) return null
    const [h, m] = n.split(':').map(Number)
    return h * 60 + m
  }
  const a = toMin(inTime), b = toMin(outTime)
  if (a == null || b == null || b <= a) return ''
  const diff = b - a
  const h = Math.floor(diff / 60), m = diff % 60
  return `${h}ч ${String(m).padStart(2, '0')}м`
}

function recordDateIso(r: AttendanceRecord): string {
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) return r.date
  const s = typeof r.created_at === 'string' ? r.created_at : ''
  const p = new Date(s); return isNaN(p.getTime()) ? '' : toIsoDate(p)
}

// Prefer the server-computed delay_time; fall back to deriving from check-in.
function getDelay(r: AttendanceRecord): string {
  const stored = normalizeTime(String(r.delay_time || ''))
  if (stored) return stored
  return computeDelayTimeFromCheckIn(String(r.check_in_time || ''))
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
  present: { cell: 'bg-emerald-50 border border-emerald-200', num: 'text-emerald-700 font-bold', dot: 'bg-emerald-400' },
  late:    { cell: 'bg-amber-50 border border-amber-200',    num: 'text-amber-700 font-bold',   dot: 'bg-amber-400' },
  absent:  { cell: 'bg-rose-50 border border-rose-200',      num: 'text-rose-600 font-bold',    dot: 'bg-rose-400' },
  active:  { cell: 'border-2 border-[var(--accent)] bg-[var(--accent-light)]', num: 'text-[var(--accent)] font-extrabold' },
  future:  { cell: 'bg-transparent', num: 'text-gray-300 font-medium' },
  weekend: { cell: 'bg-gray-50/60', num: 'text-gray-300 font-medium' },
  empty:   { cell: 'bg-transparent', num: 'text-gray-400 font-medium' },
}

const ACTION_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  present: { label: 'Присутствовал', cls: 'bg-emerald-50 text-emerald-700',    icon: 'mdi:check-circle' },
  late:    { label: 'Опоздал',       cls: 'bg-amber-50 text-amber-700',        icon: 'mdi:clock-alert' },
  absent:  { label: 'Отсутствовал',  cls: 'bg-rose-50 text-rose-600',          icon: 'mdi:close-circle' },
  active:  { label: 'Активен',       cls: 'bg-[var(--accent-light)] text-[var(--accent)]', icon: 'mdi:circle' },
  unknown: { label: '—',             cls: 'bg-gray-100 text-gray-500',         icon: 'mdi:minus' },
}

const WORKFLOW_BADGE: Record<string, { label: string; cls: string }> = {
  accepted:  { label: 'Подтверждено', cls: 'bg-emerald-50 text-emerald-600' },
  requested: { label: 'На проверке',  cls: 'bg-amber-50 text-amber-700' },
  rejected:  { label: 'Отклонено',    cls: 'bg-rose-50 text-rose-600' },
  unknown:   { label: '—',            cls: 'bg-gray-100 text-gray-500' },
}

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

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
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-bold py-1 ${i >= 5 ? 'text-rose-300' : 'text-[var(--text-muted)]'}`}>
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
              aria-label={`${day} число`}
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
          { color: 'bg-emerald-400', label: 'Присутствовал' },
          { color: 'bg-amber-400', label: 'Опоздал' },
          { color: 'bg-rose-400', label: 'Отсутствовал' },
          { color: 'bg-[var(--accent)]', label: 'Активен' },
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

/* ── Daily log row ───────────────────────────────────── */
function LogRow({ record, todayIso, onPress }: { record: AttendanceRecord; todayIso: string; onPress: () => void }) {
  const iso = recordDateIso(record)
  const checkIn = formatTime(record.check_in_time)
  const checkOut = formatTime(record.check_out_time)
  const duration = formatDuration(String(record.check_in_time || ''), String(record.check_out_time || ''))
  const actionStatus = normalizeActionStatus(record.action_status)
  const workflowStatus = normalizeWorkflowStatus(record.status)
  const delay = getDelay(record)
  // "Active" only makes sense for today: checked in, not yet checked out.
  const isActive = iso === todayIso && checkIn !== '—' && checkOut === '—'
  const actionCfg = isActive ? ACTION_BADGE.active : (ACTION_BADGE[actionStatus] || ACTION_BADGE.unknown)
  const workflowCfg = WORKFLOW_BADGE[workflowStatus] || WORKFLOW_BADGE.unknown

  const d = iso ? new Date(iso) : null
  const dayNum = d ? String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') : '—'
  const dayName = d ? d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '') : ''

  return (
    <button
      type="button"
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors"
    >
      {/* Date */}
      <div className="shrink-0 w-12 text-left">
        <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">{dayNum}</p>
        <p className="m-0 text-[11px] text-[var(--text-muted)] capitalize">{dayName}</p>
      </div>

      {/* Times */}
      <div className="flex-1 min-w-0">
        <p className="m-0 text-[14px] font-bold text-[var(--text-main)] leading-snug">
          {checkIn} — {isActive ? <span className="text-[var(--accent)]">…</span> : checkOut}
        </p>
        <p className="m-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">
          {duration && <span>{duration}</span>}
          {delay !== '00:00' && (
            <span className="text-amber-600">{duration ? ' · ' : ''}+{delay} опозд.</span>
          )}
          {!duration && delay === '00:00' && actionStatus === 'absent' && <span>Отсутствие</span>}
        </p>
      </div>

      {/* Badge */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${actionCfg.cls}`}>
          <Icon icon={actionCfg.icon} width={11} />
          {actionCfg.label}
        </span>
        {workflowStatus !== 'unknown' && (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${workflowCfg.cls}`}>
            {workflowCfg.label}
          </span>
        )}
      </div>

      <Icon icon="mdi:chevron-right" width={16} className="shrink-0 text-[var(--text-muted)] opacity-40" />
    </button>
  )
}

/* ── Record detail drawer ────────────────────────────── */
function RecordDetailDrawer({ record, open, onClose }: {
  record: AttendanceRecord | null
  open: boolean
  onClose: () => void
}) {
  if (!record) return null
  const iso = recordDateIso(record)
  const checkIn = formatTime(record.check_in_time)
  const checkOut = formatTime(record.check_out_time)
  const duration = formatDuration(String(record.check_in_time || ''), String(record.check_out_time || ''))
  const actionStatus = normalizeActionStatus(record.action_status)
  const workflowStatus = normalizeWorkflowStatus(record.status)
  const actionCfg = ACTION_BADGE[actionStatus] || ACTION_BADGE.unknown
  const delay = getDelay(record)
  const d = iso ? new Date(iso) : null

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] outline-none">
          <Drawer.Title className="sr-only">Детали посещаемости</Drawer.Title>
          <Drawer.Description className="sr-only">Детали записи посещаемости</Drawer.Description>
          <div className="flex justify-center pt-3 pb-2"><div className="h-1 w-10 rounded-full bg-gray-300" /></div>

          <div className="px-5 pb-[calc(28px+env(safe-area-inset-bottom))]">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="m-0 text-[18px] font-extrabold text-[var(--text-main)]">
                  {d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : iso}
                </p>
                <p className="m-0 mt-0.5 text-[13px] text-[var(--text-muted)] capitalize">
                  {d ? d.toLocaleDateString('ru-RU', { weekday: 'long' }) : ''}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${actionCfg.cls}`}>
                <Icon icon={actionCfg.icon} width={14} />
                {actionCfg.label}
              </span>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { icon: 'mdi:login', label: 'Приход', value: checkIn, color: '#10b981' },
                { icon: 'mdi:logout', label: 'Уход', value: checkOut, color: '#6366f1' },
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
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Длительность</span>
                <p className="m-0 mt-1 text-[17px] font-extrabold text-[var(--text-main)]">{duration || '—'}</p>
              </div>
              <div className="rounded-2xl bg-[var(--app-bg)] px-4 py-3.5">
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Опоздание</span>
                <p className={`m-0 mt-1 text-[17px] font-extrabold ${delay !== '00:00' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {delay !== '00:00' ? `+${delay}` : 'Вовремя'}
                </p>
              </div>
            </div>

            {/* Workflow */}
            {workflowStatus !== 'unknown' && (
              <div className={`rounded-2xl px-4 py-3 flex items-center gap-2 ${WORKFLOW_BADGE[workflowStatus].cls}`}>
                <Icon icon="mdi:information-outline" width={16} />
                <span className="text-[13px] font-semibold">{WORKFLOW_BADGE[workflowStatus].label}</span>
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

  const delay = useMemo(
    () => (normalizeTime(form.checkIn) ? computeDelayTimeFromCheckIn(form.checkIn) : null),
    [form.checkIn],
  )

  const handleSave = async () => {
    if (!normalizeTime(form.checkIn)) { setError('Укажите время прихода'); return }
    try {
      setSaving(true)
      await attendanceService.create({
        userBaseId: employeeGuid, companyId,
        date: form.date, checkInTime: form.checkIn, checkOutTime: form.checkOut,
      })
      onSaved()
      onClose()
    } catch { setError('Не удалось сохранить') } finally { setSaving(false) }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] outline-none max-h-[90dvh] flex flex-col">
          <Drawer.Title className="sr-only">Добавить запись</Drawer.Title>
          <Drawer.Description className="sr-only">Форма добавления посещаемости</Drawer.Description>
          <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full bg-gray-300" /></div>

          <div className="flex-1 overflow-y-auto px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
            <p className="m-0 text-[20px] font-extrabold text-[var(--text-main)]">Добавить запись</p>
            <p className="m-0 mt-1 mb-5 text-[13px] text-[var(--text-muted)]">Запись будет отправлена на подтверждение</p>

            <div className="flex flex-col gap-3">
              {[
                { label: 'Дата', type: 'date', key: 'date' as const },
                { label: 'Приход', type: 'time', key: 'checkIn' as const },
                { label: 'Уход (необязательно)', type: 'time', key: 'checkOut' as const },
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

            {/* Delay preview */}
            {delay !== null && (
              <div className={`mt-3 rounded-2xl px-4 py-3 flex items-center gap-3 ${delay === '00:00' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <Icon icon={delay === '00:00' ? 'mdi:check-circle' : 'mdi:clock-alert'} width={20}
                  className={delay === '00:00' ? 'text-emerald-500' : 'text-amber-500'} />
                <div>
                  <p className="m-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Опоздание</p>
                  <p className={`m-0 text-[15px] font-extrabold ${delay === '00:00' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {delay === '00:00' ? 'Вовремя ✓' : `+${delay}`}
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-600">
                {error}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose} disabled={saving}
                className="h-12 rounded-2xl border border-[var(--line)] bg-white text-[14px] font-bold text-[var(--text-secondary)]">
                Отмена
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={saving}
                className="h-12 rounded-2xl text-[14px] font-extrabold text-white transition active:scale-[0.98]"
                style={{ background: accentColor }}>
                {saving ? 'Сохранение…' : 'Сохранить'}
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
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours} ч ${rest} мин` : `${hours} ч`
}


/* ── Stats card ──────────────────────────────────────── */
function StatCard({ icon, iconBg, value, label, sub, valueColor }: {
  icon: string; iconBg: string; value: string; label: string; sub?: string; valueColor?: string
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
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

/* ── Page ────────────────────────────────────────────── */
export function TimePage() {
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

  /* Month-scoped records for the log */
  const monthPrefix = monthKey + '-'
  const monthRecords = useMemo(
    () => allRecords.filter((r) => recordDateIso(r).startsWith(monthPrefix)).sort((a, b) => recordDateIso(b).localeCompare(recordDateIso(a))),
    [allRecords, monthPrefix],
  )

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
    ? 'Нет данных'
    : !lateness.has_work_schedule
      ? 'Не задан график работы'
      : lateness.penalized_minutes > 0
        ? `${formatMinutes(lateness.penalized_minutes)} сверх ${lateness.grace_minutes} мин`
        : `До ${lateness.grace_minutes} мин не штрафуется`

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
    const rateLabel = rate >= 95 ? 'Отлично' : rate >= 80 ? 'Хорошо' : rate >= 60 ? 'Удовл.' : 'Низкий'
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
        <div className="rounded-3xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
          style={{ background: `linear-gradient(135deg, ${accent}f0 0%, ${accent}90 100%)` }}>
          <div className="flex items-center justify-between px-4 py-4">
            <button type="button" onClick={prevMonth}
              className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
              <Icon icon="mdi:chevron-left" width={20} className="text-white" />
            </button>
            <div className="text-center">
              <p className="m-0 text-[18px] font-extrabold text-white leading-snug">{monthLabel(monthKey)}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-white/70">
                {stats.elapsedDays} раб. дней прошло · {stats.plannedDays - stats.elapsedDays} осталось
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
          <div className="rounded-2xl bg-rose-50 px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Icon icon="mdi:alert-circle-outline" width={20} className="shrink-0 text-rose-500" />
              <p className="m-0 text-[13px] font-semibold text-rose-600 truncate">Не удалось загрузить данные</p>
            </div>
            <button type="button" onClick={() => void refetch()}
              className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-[12px] font-bold text-rose-600 active:scale-95 transition-transform">
              Повторить
            </button>
          </div>
        )}

        {/* ── Stats 2×2 ─────────────────────────────── */}
        {!isLoading && !isError && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon="mdi:calendar-month" iconBg="bg-indigo-400"
              value={String(stats.plannedDays)} label="Рабочих дней" sub={`${stats.elapsedDays} прошло`} />
            <StatCard icon="mdi:check-circle" iconBg="bg-emerald-400"
              value={String(stats.worked)} label="Отработано" valueColor="text-emerald-600" />
            {/* Опоздания: количество и суммарные минуты. Минуты приходят с
                сервера (та же агрегация, что в отчётах и зарплатном Excel) —
                на клиенте их из сырых записей честно не посчитать. */}
            <StatCard icon="mdi:clock-alert" iconBg="bg-amber-400"
              value={String(lateness?.late_days ?? stats.late)} label="Опозданий"
              valueColor={(lateness?.late_days ?? stats.late) > 0 ? 'text-amber-600' : undefined}
              sub={
                lateness
                  ? `${formatMinutes(lateness.late_minutes)} всего`
                  : stats.absent
                    ? `${stats.absent} отс.`
                    : undefined
              } />
            <StatCard icon="mdi:cash-remove" iconBg="bg-rose-400"
              value={latenessPenaltyLabel} label="Штраф за опоздания"
              valueColor={(lateness?.penalty_amount ?? 0) > 0 ? 'text-rose-600' : undefined}
              sub={latenessPenaltyHint} />
          </div>
        )}

        {/* ── Calendar ──────────────────────────────── */}
        <div className="rounded-3xl bg-white px-4 py-4 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Календарь</p>
            <p className="m-0 text-[13px] text-[var(--text-muted)]">{monthLabel(monthKey)}</p>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200" style={{ borderTopColor: accent }} />
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

        {/* ── Daily log ─────────────────────────────── */}
        <div className="rounded-3xl bg-white overflow-hidden shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--line)]">
            <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Журнал</p>
            <span className="rounded-full bg-[var(--app-bg)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--text-muted)]">
              {monthRecords.length}
            </span>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200" style={{ borderTopColor: accent }} />
            </div>
          ) : monthRecords.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Icon icon="mdi:calendar-blank-outline" width={36} className="text-[var(--text-muted)] opacity-30" />
              <p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">Записей нет</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {monthRecords.map((r) => (
                <LogRow key={r.guid} record={r} todayIso={todayIso} onPress={() => setSelectedRecord(r)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button type="button" onClick={() => openAdd(todayIso)}
        className="fixed bottom-[88px] right-4 z-20 h-14 w-14 rounded-2xl text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] flex items-center justify-center transition-transform active:scale-90"
        style={{ background: accent }}>
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
