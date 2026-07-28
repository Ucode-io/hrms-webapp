import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import {
  reportsService,
  type KpiPeriodType,
} from '../api/reportsService'
import { resolveCompaniesId } from '../api/adminRequest'
import {
  KPI_PERIOD_TABS,
  clampPercent,
  collectLeaves,
  countNodesByType,
  formatPeriodLabel,
  getPeriodRange,
  getPercentTone,
  getPositionIdFromSource,
  movePeriod,
  normalizeGroups,
  updateGroupsActual,
  type KpiGroup,
  type KpiNode,
} from './kpi/kpiUtils'
import { KpiCard } from './kpi/KpiCard'
import { KpiEditSheet } from './kpi/KpiEditSheet'

const RING_SIZE = 96
const RING_STROKE = 9
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS

interface ProgressRingProps {
  percent: number
  color: string
}

function ProgressRing({ percent, color }: ProgressRingProps) {
  const clamped = clampPercent(percent)
  const offset = RING_CIRC - (clamped / 100) * RING_CIRC
  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-[22px] font-extrabold leading-none">{percent}%</span>
        <span className="text-[10px] font-semibold opacity-85 mt-0.5">средний</span>
      </div>
    </div>
  )
}

export function KpiPage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()
  const queryClient = useQueryClient()

  const [periodMode, setPeriodMode] = useState<KpiPeriodType>('yearly')
  const [cursorDate, setCursorDate] = useState(new Date())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [savingFactId, setSavingFactId] = useState<string | null>(null)
  const [groupsState, setGroupsState] = useState<KpiGroup[]>([])
  const [editingNode, setEditingNode] = useState<KpiNode | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const positionId = useMemo(() => {
    return (
      getPositionIdFromSource(profile) ||
      getPositionIdFromSource(session?.user_data) ||
      getPositionIdFromSource(session?.user)
    )
  }, [profile, session])

  const companiesId = useMemo(
    () => resolveCompaniesId(profile, session?.user_data, session?.user),
    [profile, session],
  )

  const range = useMemo(() => getPeriodRange(cursorDate, periodMode), [cursorDate, periodMode])
  const periodTitle = useMemo(() => formatPeriodLabel(cursorDate, periodMode), [cursorDate, periodMode])

  const queryKey = useMemo(
    () => ['kpi-table-mobile', periodMode, range.from, range.to, positionId, companiesId] as const,
    [periodMode, range.from, range.to, positionId, companiesId],
  )

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      return reportsService.getKpiTable({
        period_type: periodMode,
        date_from: range.from,
        date_to: range.to,
        position_id: positionId || undefined,
        companies_id: companiesId || undefined,
      })
    },
    enabled: Boolean(positionId),
  })

  useEffect(() => {
    if (data === undefined) {
      setGroupsState([])
      return
    }
    setGroupsState(normalizeGroups(data))
  }, [data])

  useEffect(() => {
    setExpandedIds(new Set())
  }, [periodMode, range.from, range.to, positionId, companiesId])

  const totalKpiCount = useMemo(
    () => groupsState.reduce((sum, group) => sum + countNodesByType(group.items, periodMode), 0),
    [groupsState, periodMode],
  )

  const summaryStats = useMemo(() => {
    const leaves = groupsState.flatMap((group) => collectLeaves(group.items))
    const leafCount = leaves.length
    const avgPercent = leafCount > 0
      ? Math.round(leaves.reduce((sum, node) => sum + node.percentTotal, 0) / leafCount)
      : 0
    const achievedCount = leaves.filter((n) => n.percentTotal >= 100).length
    const pendingCount = leaves.filter((n) => n.actualTotal === 0).length
    return { leafCount, avgPercent, achievedCount, pendingCount }
  }, [groupsState])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openEditSheet = (node: KpiNode) => {
    if (node.hasChildren && node.children.length > 0) return
    setEditingNode(node)
    setSheetOpen(true)
  }

  const closeEditSheet = () => {
    setSheetOpen(false)
    window.setTimeout(() => setEditingNode(null), 250)
  }

  const saveFact = async (node: KpiNode, value: number) => {
    setSavingFactId(node.id)
    setGroupsState((prev) => updateGroupsActual(prev, node.id, value))
    try {
      await reportsService.updateKpiValue(node.id, value)
      setSheetOpen(false)
      window.setTimeout(() => setEditingNode(null), 250)
      queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.invalidateQueries({ queryKey })
      throw err
    } finally {
      setSavingFactId(null)
    }
  }

  const ringTone = getPercentTone(summaryStats.avgPercent)

  if (!positionId) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-10 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--accent-soft)] inline-flex items-center justify-center mb-3">
          <Icon icon="mdi:account-question-outline" width={26} className="text-[var(--accent)]" />
        </div>
        <p className="m-0 text-[15px] font-bold text-[var(--text-main)]">Должность не найдена</p>
        <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">
          Не удалось определить вашу должность для загрузки KPI.
        </p>
      </div>
    )
  }

  if ((isLoading || isFetching) && groupsState.length === 0 && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200 border-t-[var(--accent)]" />
        <p className="m-0 text-[12.5px] font-semibold text-[var(--text-muted)]">Загружаем KPI…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-4">
        <div className="flex items-start gap-2.5">
          <Icon icon="mdi:alert-circle-outline" width={20} className="text-[var(--error-text)] mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="m-0 text-[13.5px] font-bold text-[var(--error-text)]">Не удалось загрузить KPI</p>
            <p className="m-0 mt-0.5 text-[12px] text-[var(--error-text)]/80">
              Проверьте соединение и попробуйте снова.
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--error-line)] bg-white px-3 py-1.5 text-[12px] font-bold text-[var(--error-text)] cursor-pointer active:scale-95"
            >
              <Icon icon="mdi:refresh" width={13} />
              Повторить
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isEmpty = groupsState.length === 0 || groupsState.every((group) => group.items.length === 0)

  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5">
      {/* Period type tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {KPI_PERIOD_TABS.map((tab) => {
          const isActive = tab.key === periodMode
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPeriodMode(tab.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-all active:scale-95 ${
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-[var(--line)] bg-white text-[var(--text-secondary)]'
              }`}
              style={isActive ? { background: company.mainColor } : undefined}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Hero summary */}
      <section
        className="relative overflow-hidden rounded-3xl text-white px-4 py-4"
        style={{
          background: `linear-gradient(135deg, ${company.mainColor}, color-mix(in srgb, ${company.mainColor} 70%, #000))`,
        }}
      >
        <div className="pointer-events-none absolute -top-12 -right-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 w-44 h-44 rounded-full bg-white/5" />

        <div className="relative flex items-center gap-4">
          <ProgressRing percent={summaryStats.avgPercent} color={ringTone.ring} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[11px] uppercase tracking-wider font-semibold opacity-80">
              Текущий период
            </p>
            <p className="m-0 mt-0.5 text-[16px] font-extrabold leading-tight truncate">
              {periodTitle}
            </p>
            <p className="m-0 mt-1 text-[12px] opacity-90">
              {totalKpiCount} KPI · {summaryStats.leafCount} к заполнению
            </p>
          </div>
        </div>

        {/* Period nav */}
        <div className="relative mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setCursorDate((prev) => movePeriod(prev, periodMode, 'prev'))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-0 bg-white/15 backdrop-blur text-white cursor-pointer active:bg-white/25"
            aria-label="Предыдущий период"
          >
            <Icon icon="mdi:chevron-left" width={18} />
          </button>
          <div className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border-0 bg-white/15 backdrop-blur text-white text-[12px] font-bold">
            <Icon icon="mdi:calendar-today" width={14} />
            {periodTitle}
            {isFetching ? (
              <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setCursorDate((prev) => movePeriod(prev, periodMode, 'next'))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border-0 bg-white/15 backdrop-blur text-white cursor-pointer active:bg-white/25"
            aria-label="Следующий период"
          >
            <Icon icon="mdi:chevron-right" width={18} />
          </button>
        </div>
      </section>

      {/* Stats strip */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon icon="mdi:check-bold" width={13} />
            </span>
            <p className="m-0 text-[10.5px] text-[var(--text-muted)] font-semibold">Достигнуто</p>
          </div>
          <p className="m-0 mt-1 text-[18px] font-extrabold text-[var(--text-main)]">
            {summaryStats.achievedCount}
            <span className="text-[12px] font-bold text-[var(--text-muted)]">
              /{summaryStats.leafCount}
            </span>
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Icon icon="mdi:clock-outline" width={13} />
            </span>
            <p className="m-0 text-[10.5px] text-[var(--text-muted)] font-semibold">Ждут факт</p>
          </div>
          <p className="m-0 mt-1 text-[18px] font-extrabold text-[var(--text-main)]">
            {summaryStats.pendingCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
              <Icon icon="mdi:target" width={13} />
            </span>
            <p className="m-0 text-[10.5px] text-[var(--text-muted)] font-semibold">Всего</p>
          </div>
          <p className="m-0 mt-1 text-[18px] font-extrabold text-[var(--text-main)]">
            {totalKpiCount}
          </p>
        </div>
      </section>

      {/* List */}
      {isFetching && isEmpty ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-[var(--accent)]" />
          <p className="m-0 text-[12.5px] font-semibold text-[var(--text-muted)]">Загружаем KPI…</p>
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--accent-soft)] inline-flex items-center justify-center mb-3">
            <Icon icon="mdi:target-variant" width={26} className="text-[var(--accent)]" />
          </div>
          <p className="m-0 text-[14.5px] font-bold text-[var(--text-main)]">KPI не найдены</p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">
            На выбранный период для вашей должности KPI отсутствуют.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {groupsState.map((group) => (
            <section key={group.position} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon icon="mdi:briefcase-outline" width={13} />
                </span>
                <p className="m-0 text-[12.5px] font-extrabold text-[var(--text-main)] uppercase tracking-wide truncate">
                  {group.position}
                </p>
                <span className="ml-auto text-[11px] text-[var(--text-muted)] font-bold">
                  {countNodesByType(group.items, periodMode)} KPI
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <KpiCard
                    key={item.id}
                    node={item}
                    level={0}
                    expandedIds={expandedIds}
                    savingFactId={savingFactId}
                    onToggle={toggleExpand}
                    onEdit={openEditSheet}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Footer hint */}
      <div className="rounded-2xl bg-[var(--accent-soft)] px-3.5 py-2.5">
        <div className="flex items-start gap-2">
          <Icon icon="mdi:information-outline" width={14} className="text-[var(--accent)] mt-0.5 shrink-0" />
          <p className="m-0 text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
            Изменять факт можно только у конечных KPI. У групповых KPI факт считается автоматически из дочерних.
          </p>
        </div>
      </div>

      <KpiEditSheet
        node={editingNode}
        open={sheetOpen}
        saving={savingFactId === editingNode?.id}
        brandColor={company.mainColor}
        onClose={closeEditSheet}
        onSave={saveFact}
      />
    </div>
  )
}
