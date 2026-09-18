import { Icon } from '@iconify/react'
import {
  clampPercent,
  formatCompactPeriodLabel,
  formatValueWithSymbol,
  getPercentTone,
  getTypeChipClass,
  getTypeLabel,
  type KpiNode,
} from './kpiUtils'

interface KpiCardProps {
  node: KpiNode
  level: number
  expandedIds: Set<string>
  savingFactId: string | null
  onToggle: (id: string) => void
  onEdit: (node: KpiNode) => void
}

const LEVEL_RAIL_COLORS = [
  'border-l-blue-300',
  'border-l-violet-300',
  'border-l-emerald-300',
  'border-l-amber-300',
  'border-l-rose-300',
]

const LEVEL_DOT_COLORS = [
  'bg-blue-400',
  'bg-violet-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-rose-400',
]

export function KpiCard({
  node,
  level,
  expandedIds,
  savingFactId,
  onToggle,
  onEdit,
}: KpiCardProps) {
  const isLeaf = !node.hasChildren || node.children.length === 0
  const isExpanded = expandedIds.has(node.id)
  const isSaving = savingFactId === node.id
  const percent = clampPercent(node.percentTotal)
  const tone = getPercentTone(node.percentTotal)
  const isRoot = level === 0

  // Compact mode for nested cards: smaller fonts, tighter padding, no period chip row
  const compact = !isRoot

  return (
    <article
      className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden ${
        isRoot ? 'shadow-[0_1px_2px_rgba(15,30,60,0.04)]' : ''
      }`}
    >
      {/* Top: title row */}
      <button
        type="button"
        onClick={() => (isLeaf ? onEdit(node) : onToggle(node.id))}
        disabled={isSaving}
        className={`block w-full text-left bg-[var(--surface)] border-0 cursor-pointer active:bg-gray-50 disabled:opacity-60 ${
          compact ? 'px-3 pt-2.5 pb-2' : 'px-3.5 pt-3 pb-2.5'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {compact ? (
                <span
                  className={`shrink-0 inline-block h-1.5 w-1.5 rounded-full ${
                    LEVEL_DOT_COLORS[(level - 1) % LEVEL_DOT_COLORS.length]
                  }`}
                />
              ) : null}
              <p
                className={`m-0 font-bold text-[var(--text-main)] leading-snug break-words ${
                  compact ? 'text-[13.5px]' : 'text-[14.5px]'
                }`}
              >
                {node.title}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${getTypeChipClass(
                  node.periodType,
                )}`}
              >
                {getTypeLabel(node.periodType)}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Icon icon="mdi:calendar-blank-outline" width={11} />
                {formatCompactPeriodLabel(node.periodType, node.startDate, node.endDate)}
              </span>
              {!isLeaf && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--text-muted)]">
                  <Icon icon="mdi:file-tree-outline" width={11} />
                  {node.children.length}
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-0.5">
            <span
              className={`font-extrabold leading-none ${tone.text} ${
                compact ? 'text-[15px]' : 'text-[18px]'
              }`}
            >
              {node.percentTotal}%
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-semibold">
              {isLeaf ? 'факт' : 'итог'}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className={`overflow-hidden rounded-full bg-gray-100 ${compact ? 'mt-2 h-1' : 'mt-3 h-1.5'}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Plan / Fact line */}
        <div className={`flex items-center justify-between gap-3 ${compact ? 'mt-2' : 'mt-2.5'}`}>
          <div className="min-w-0">
            <p className="m-0 text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-semibold">
              План
            </p>
            <p
              className={`m-0 mt-0.5 font-bold text-[var(--text-secondary)] truncate ${
                compact ? 'text-[12.5px]' : 'text-[13.5px]'
              }`}
            >
              {formatValueWithSymbol(node.planTotal, node.valueSymbol, node.valueSymbolPosition)}
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="m-0 text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-semibold">
              Факт
            </p>
            <p
              className={`m-0 mt-0.5 font-extrabold truncate ${tone.text} ${
                compact ? 'text-[12.5px]' : 'text-[13.5px]'
              }`}
            >
              {formatValueWithSymbol(node.actualTotal, node.valueSymbol, node.valueSymbolPosition)}
            </p>
          </div>
        </div>
      </button>

      {/* Action row */}
      {isLeaf ? (
        <div className="border-t border-[var(--line)]/70 bg-[var(--surface)]">
          <button
            type="button"
            onClick={() => onEdit(node)}
            disabled={isSaving}
            className={`w-full bg-transparent border-0 inline-flex items-center justify-center gap-1.5 font-bold text-[var(--accent)] cursor-pointer active:bg-[var(--accent-soft)] disabled:opacity-60 ${
              compact ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-2.5 text-[12.5px]'
            }`}
          >
            {isSaving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)]/30 border-t-[var(--accent)]" />
                Сохранение…
              </>
            ) : (
              <>
                <Icon icon="mdi:pencil-outline" width={14} />
                Ввести факт
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(node.id)}
          className={`w-full border-0 border-t border-[var(--line)]/70 bg-gray-50/40 inline-flex items-center justify-center gap-1.5 font-semibold text-[var(--text-secondary)] cursor-pointer active:bg-gray-100 ${
            compact ? 'px-3 py-1.5 text-[11px]' : 'px-3.5 py-2 text-[11.5px]'
          }`}
        >
          <Icon
            icon="mdi:chevron-down"
            width={14}
            className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`}
          />
          {isExpanded ? 'Скрыть дочерние' : `Показать дочерние · ${node.children.length}`}
        </button>
      )}

      {/* Nested children — RENDERED INSIDE PARENT CARD */}
      {!isLeaf && isExpanded ? (
        <div className="bg-gray-50/60 border-t border-[var(--line)]/70 px-2 py-2">
          <div
            className={`pl-2 border-l-2 ${
              LEVEL_RAIL_COLORS[level % LEVEL_RAIL_COLORS.length]
            } flex flex-col gap-1.5`}
          >
            {node.children.map((child) => (
              <KpiCard
                key={child.id}
                node={child}
                level={level + 1}
                expandedIds={expandedIds}
                savingFactId={savingFactId}
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}
