import { useMemo, useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import {
  payrollService,
  formatAmount,
  getMonthLabel,
  OPERATION_LABELS,
  type CompensationRecord,
} from '../api/payrollService'

/* ── Month key helpers ─────────────────────────────── */
function dateToMonthKey(iso: string): string { return iso ? iso.slice(0, 7) : '' }
function monthKeyLabel(key: string): string { return getMonthLabel(key) }

function getCurrentMonthKey(): string {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/* ── Group records by month ────────────────────────── */
interface MonthGroup {
  key: string
  income: CompensationRecord[]
  deductions: CompensationRecord[]
  totalIncome: number
  totalDeductions: number
  net: number
}

function groupByMonth(records: CompensationRecord[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>()
  for (const r of records) {
    const key = dateToMonthKey(r.date)
    if (!key) continue
    if (!map.has(key)) map.set(key, { key, income: [], deductions: [], totalIncome: 0, totalDeductions: 0, net: 0 })
    const g = map.get(key)!
    if (r.operationType === 'income') { g.income.push(r); g.totalIncome += r.amount }
    else { g.deductions.push(r); g.totalDeductions += r.amount }
    g.net = g.totalIncome - g.totalDeductions
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, v]) => v)
}

/* ── Payslip card (summary for one month) ──────────── */
function PayslipHeader({ group, color, name }: { group: MonthGroup; color: string; name: string }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ background: `linear-gradient(135deg, ${color}ee, ${color}bb)` }}>
      <div className="px-4 pt-4 pb-3">
        <p className="m-0 text-[11px] text-white/70 font-semibold uppercase tracking-wider">{monthKeyLabel(group.key)}</p>
        <p className="m-0 mt-1 text-[15px] font-bold text-white">{name}</p>
      </div>
      <div className="px-4 pb-4 flex items-end justify-between">
        <div>
          <p className="m-0 text-[11px] text-white/70 font-semibold uppercase tracking-wider">Начислено</p>
          <p className="m-0 mt-0.5 text-[22px] font-extrabold text-white leading-none">{formatAmount(group.totalIncome)}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[11px] text-white/70 font-semibold uppercase tracking-wider">Удержано</p>
          <p className="m-0 mt-0.5 text-[16px] font-bold text-white/90 leading-none">−{formatAmount(group.totalDeductions)}</p>
        </div>
      </div>
      <div className="px-4 py-3 bg-black/10 flex items-center justify-between">
        <p className="m-0 text-[12px] text-white/80 font-semibold">К выплате</p>
        <p className="m-0 text-[18px] font-extrabold text-white">{formatAmount(group.net)}</p>
      </div>
    </div>
  )
}

/* ── Line item row ─────────────────────────────────── */
function LineRow({ record }: { record: CompensationRecord }) {
  const isIncome = record.operationType === 'income'
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--line)] last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center"
          style={{ background: isIncome ? '#ecfdf5' : '#fff1f2', color: isIncome ? '#059669' : '#e11d48' }}>
          <Icon icon={isIncome ? 'mdi:trending-up' : 'mdi:trending-down'} width={14} />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-semibold text-[var(--text-main)] truncate">{record.typeTitle || OPERATION_LABELS[record.operationType]}</p>
          {record.description && <p className="m-0 text-[11px] text-[var(--text-muted)] truncate">{record.description}</p>}
        </div>
      </div>
      <p className="m-0 ml-3 text-[13px] font-bold shrink-0" style={{ color: isIncome ? '#059669' : '#e11d48' }}>
        {isIncome ? '+' : '−'}{formatAmount(record.amount)}
      </p>
    </div>
  )
}

/* ── Month detail section ──────────────────────────── */
function MonthDetail({ group, color }: { group: MonthGroup; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white overflow-hidden">
      {/* Earnings */}
      {group.income.length > 0 && (
        <div className="px-4 pt-4">
          <p className="m-0 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Начисления</p>
          {group.income.map(r => <LineRow key={r.guid} record={r} />)}
          <div className="flex items-center justify-between py-3 border-t border-[var(--line)]">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">Итого начислений</p>
            <p className="m-0 text-[14px] font-extrabold text-emerald-600">+{formatAmount(group.totalIncome)}</p>
          </div>
        </div>
      )}

      {/* Deductions */}
      {group.deductions.length > 0 && (
        <div className={`px-4 ${group.income.length > 0 ? 'border-t border-[var(--line)]' : ''} pt-4`}>
          <p className="m-0 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Удержания</p>
          {group.deductions.map(r => <LineRow key={r.guid} record={r} />)}
          <div className="flex items-center justify-between py-3 border-t border-[var(--line)]">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">Итого удержаний</p>
            <p className="m-0 text-[14px] font-extrabold text-rose-600">−{formatAmount(group.totalDeductions)}</p>
          </div>
        </div>
      )}

      {/* Net */}
      <div className="px-4 py-3 border-t border-[var(--line)] flex items-center justify-between" style={{ background: `${color}08` }}>
        <p className="m-0 text-[14px] font-extrabold text-[var(--text-main)]">К выплате</p>
        <p className="m-0 text-[16px] font-extrabold" style={{ color }}>{formatAmount(group.net)}</p>
      </div>
    </div>
  )
}

/* ── Net history bars ──────────────────────────────── */
function NetHistory({ groups, selectedKey, color, onSelect }: {
  groups: MonthGroup[]; selectedKey: string; color: string; onSelect: (k: string) => void
}) {
  const maxNet = Math.max(...groups.map(g => g.net), 1)
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
      <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)] mb-4">История выплат</p>
      <div className="flex flex-col gap-3">
        {groups.map(g => {
          const pct = Math.min((g.net / maxNet) * 100, 100)
          const isSelected = g.key === selectedKey
          return (
            <button key={g.key} type="button" onClick={() => onSelect(g.key)}
              className="w-full text-left cursor-pointer border-0 bg-transparent p-0 active:opacity-70">
              <div className="flex items-center justify-between mb-1">
                <p className={`m-0 text-[13px] font-semibold ${isSelected ? 'text-[var(--text-main)]' : 'text-[var(--text-secondary)]'}`}
                  style={isSelected ? { color } : undefined}>
                  {monthKeyLabel(g.key)}
                </p>
                <p className={`m-0 text-[13px] font-bold ${isSelected ? '' : 'text-[var(--text-secondary)]'}`}
                  style={isSelected ? { color } : undefined}>
                  {formatAmount(g.net)}
                </p>
              </div>
              <div className="h-[6px] rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: isSelected ? color : `${color}60` }} />
              </div>
            </button>
          )
        })}
      </div>
      {groups.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center justify-between">
          <p className="m-0 text-[12px] text-[var(--text-muted)] font-semibold">Всего за период</p>
          <p className="m-0 text-[14px] font-extrabold" style={{ color }}>{formatAmount(groups.reduce((s, g) => s + g.net, 0))}</p>
        </div>
      )}
    </div>
  )
}


/* ── Main Page ─────────────────────────────────────── */

export function PayrollPage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()

  const employeeGuid = useMemo(() =>
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  , [profile, session])

  const employeeName = useMemo(() => {
    const u = session?.user_data ?? session?.user ?? {}
    const fn = typeof (u as Record<string,unknown>).first_name === 'string' ? (u as Record<string,unknown>).first_name : ''
    const ln = typeof (u as Record<string,unknown>).second_name === 'string' ? (u as Record<string,unknown>).second_name : ''
    return [fn, ln].filter(Boolean).join(' ') || 'Сотрудник'
  }, [session])

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey())
  const pillsRef = useRef<HTMLDivElement>(null)

  // Auto-scroll pills to the right (current month) on mount
  useEffect(() => {
    if (pillsRef.current) {
      pillsRef.current.scrollLeft = pillsRef.current.scrollWidth
    }
  }, [])

  const {
    data: records = [],
    isLoading: isLoadingMonth,
    error,
  } = useQuery({
    queryKey: ['compensations', employeeGuid, selectedMonth],
    queryFn: async () => {
      if (!employeeGuid) return []
      const [year, month] = selectedMonth.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      const dateFrom = `${selectedMonth}-01`
      const dateTo = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`
      return payrollService.getCompensations(employeeGuid, dateFrom, dateTo)
    },
    enabled: !!employeeGuid,
  })

  const groups = useMemo(() => groupByMonth(records), [records])
  const selectedGroup = useMemo(() => groups.find(g => g.key === selectedMonth) ?? null, [groups, selectedMonth])

  /* ── Month pills — 6 months: oldest on left, current on right ── */
  const monthPills = useMemo(() => {
    const pills: string[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      pills.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return pills // oldest first, current last
  }, [])



  if (error) return (
    <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-8 text-center text-sm animate-fade-in-up">
      Не удалось загрузить данные
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-4 animate-fade-in-up">
        {/* Month pills — auto-scrolled to current month on right */}
        <div ref={pillsRef} className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {monthPills.map(k => {
            const d = new Date(k + '-01')
            const label = isNaN(d.getTime()) ? k : d.toLocaleDateString('ru-RU', { month: 'short' })
            const active = k === selectedMonth
            return (
              <button key={k} type="button" onClick={() => setSelectedMonth(k)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border cursor-pointer transition-all active:scale-95 ${active ? 'border-transparent text-white' : 'border-[var(--line)] bg-white text-[var(--text-secondary)]'}`}
                style={active ? { background: company.mainColor } : undefined}>
                {label}
              </button>
            )
          })}
        </div>

        {isLoadingMonth ? (
          <div className="flex flex-col gap-4 animate-pulse">
            <div className="h-[140px] rounded-2xl bg-gray-200" />
            <div className="h-[200px] rounded-2xl bg-gray-200" />
          </div>
        ) : (
          <>
            {/* Payslip header card */}
            {selectedGroup ? (
              <PayslipHeader group={selectedGroup} color={company.mainColor} name={employeeName} />
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-white py-10 text-center flex flex-col items-center gap-2">
                <span className="text-3xl">📅</span>
                <p className="m-0 text-[14px] font-semibold text-[var(--text-main)]">
                  {new Date(selectedMonth + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </p>
                <p className="m-0 text-[13px] text-[var(--text-muted)]">Нет данных о зарплате за этот месяц</p>
              </div>
            )}

            {/* Month detail breakdown */}
            {selectedGroup && (selectedGroup.income.length > 0 || selectedGroup.deductions.length > 0) && (
              <MonthDetail group={selectedGroup} color={company.mainColor} />
            )}
          </>
        )}

        {/* History bars */}
        {groups.length > 1 && (
          <NetHistory groups={groups} selectedKey={selectedMonth} color={company.mainColor} onSelect={setSelectedMonth} />
        )}


      </div>

    </>
  )
}
