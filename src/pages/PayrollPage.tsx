import { useMemo, useState } from 'react'
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
        <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
          style={{ background: isIncome ? 'rgba(16,185,129,0.15)' : 'rgba(225,29,72,0.15)', color: isIncome ? '#34d399' : '#fb7185' }}>
          <Icon icon={isIncome ? 'mdi:cash-plus' : 'mdi:cash-minus'} width={18} />
        </div>
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-semibold text-[var(--text-main)] truncate">{record.typeTitle || OPERATION_LABELS[record.operationType]}</p>
          {record.description && <p className="m-0 text-[11px] text-[var(--text-muted)] truncate">{record.description}</p>}
        </div>
      </div>
      <p className="m-0 ml-3 text-[13px] font-bold shrink-0" style={{ color: isIncome ? '#34d399' : '#fb7185' }}>
        {isIncome ? '+' : '−'}{formatAmount(record.amount)}
      </p>
    </div>
  )
}

/* ── Month detail section ──────────────────────────── */
function MonthDetail({ group, color }: { group: MonthGroup; color: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      {/* Earnings */}
      {group.income.length > 0 && (
        <div className="px-4 pt-4">
          <p className="m-0 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Начисления</p>
          {group.income.map(r => <LineRow key={r.guid} record={r} />)}
          <div className="flex items-center justify-between py-3 border-t border-[var(--line)]">
            <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">Итого начислений</p>
            <p className="m-0 text-[14px] font-extrabold text-emerald-500">+{formatAmount(group.totalIncome)}</p>
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
            <p className="m-0 text-[14px] font-extrabold text-rose-500">−{formatAmount(group.totalDeductions)}</p>
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

/* ── Month navigator ───────────────────────────────── */
function MonthNav({ monthKey, income, deductions, color, canGoNext, onPrev, onNext }: {
  monthKey: string; income: number; deductions: number; color: string
  canGoNext: boolean; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="rounded-3xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}f0 0%, ${color}90 100%)` }}>
      <div className="flex items-center justify-between px-4 py-4">
        <button type="button" onClick={onPrev}
          className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center active:scale-90 transition-transform">
          <Icon icon="mdi:chevron-left" width={20} className="text-white" />
        </button>
        <div className="text-center">
          <p className="m-0 text-[18px] font-extrabold text-white leading-snug">{monthKeyLabel(monthKey)}</p>
          <p className="m-0 mt-0.5 text-[11.5px] text-white/70">
            Начислено {formatAmount(income)} · Удержано {formatAmount(deductions)}
          </p>
        </div>
        <button type="button" onClick={onNext} disabled={!canGoNext}
          className="h-9 w-9 rounded-2xl bg-white/20 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30">
          <Icon icon="mdi:chevron-right" width={20} className="text-white" />
        </button>
      </div>
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

  const currentMonthKey = getCurrentMonthKey()
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey)

  const shiftMonth = (delta: number) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const d = new Date(year, month - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

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

  if (error) return (
    <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-8 text-center text-sm animate-fade-in-up">
      Не удалось загрузить данные
    </div>
  )

  return (
    <>
      <div className="flex flex-col gap-4 animate-fade-in-up">
        <MonthNav
          monthKey={selectedMonth}
          income={selectedGroup?.totalIncome ?? 0}
          deductions={selectedGroup?.totalDeductions ?? 0}
          color={company.mainColor}
          canGoNext={selectedMonth < currentMonthKey}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
        />

        {isLoadingMonth ? (
          <div className="flex flex-col gap-4 animate-pulse">
            <div className="h-[140px] rounded-2xl bg-[var(--surface-muted)]" />
            <div className="h-[200px] rounded-2xl bg-[var(--surface-muted)]" />
          </div>
        ) : (
          <>
            {/* Payslip header card */}
            {selectedGroup ? (
              <PayslipHeader group={selectedGroup} color={company.mainColor} name={employeeName} />
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-10 text-center flex flex-col items-center gap-2">
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
      </div>
    </>
  )
}
