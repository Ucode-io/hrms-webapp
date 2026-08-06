import { useEffect, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import {
  clampPercent,
  formatCompactPeriodLabel,
  formatNumber,
  formatValueWithSymbol,
  getPercentTone,
  tryParseActualValue,
  type KpiNode,
} from './kpiUtils'

interface KpiEditSheetProps {
  node: KpiNode | null
  open: boolean
  saving: boolean
  brandColor: string
  onClose: () => void
  onSave: (node: KpiNode, value: number) => Promise<void>
}

export function KpiEditSheet({ node, open, saving, brandColor, onClose, onSave }: KpiEditSheetProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open && node) {
      setDraft(node.actualTotal ? String(node.actualTotal) : '')
      setError(null)
      const t = window.setTimeout(() => inputRef.current?.focus(), 220)
      return () => window.clearTimeout(t)
    }
  }, [open, node])

  if (!node) return null

  const parsed = tryParseActualValue(draft)
  const projectedPercent = parsed != null && node.planTotal > 0
    ? Math.round((parsed / node.planTotal) * 100)
    : node.percentTotal
  const tone = getPercentTone(projectedPercent)
  const projectedClamped = clampPercent(projectedPercent)
  const symbol = node.valueSymbol

  const setQuickValue = (value: number) => {
    setDraft(formatNumber(value).replace(/\s/g, ''))
    setError(null)
  }

  const handleSave = async () => {
    const value = tryParseActualValue(draft)
    if (value == null) {
      setError('Введите корректное число (≥ 0)')
      return
    }
    setError(null)
    try {
      await onSave(node, value)
    } catch {
      setError('Не удалось сохранить. Попробуйте ещё раз.')
    }
  }

  return (
    <Drawer.Root open={open} onOpenChange={(v) => (!v && !saving ? onClose() : undefined)}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] outline-none max-h-[94vh] flex flex-col">
          <Drawer.Title className="sr-only">Ввод факта по KPI</Drawer.Title>
          <Drawer.Description className="sr-only">
            Введите фактическое значение для конечного KPI
          </Drawer.Description>

          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-[4px] bg-gray-300 rounded-full" />
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-[calc(20px+env(safe-area-inset-bottom))]">
            {/* Title */}
            <div className="flex items-start gap-2 mb-1">
              <p className="m-0 flex-1 text-[17px] font-extrabold text-[var(--text-main)] leading-snug">
                {node.title}
              </p>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="shrink-0 -mt-0.5 -mr-1 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gray-100 border-0 text-[var(--text-secondary)] cursor-pointer active:bg-gray-200 disabled:opacity-60"
                aria-label="Закрыть"
              >
                <Icon icon="mdi:close" width={18} />
              </button>
            </div>
            <p className="m-0 mb-4 text-[12px] text-[var(--text-muted)]">
              Период: {formatCompactPeriodLabel(node.periodType, node.startDate, node.endDate)}
              {node.source ? ` · Источник: ${node.source}` : ''}
            </p>

            {node.description ? (
              <div className="mb-4 rounded-2xl border border-[var(--line)] bg-gray-50 px-3.5 py-2.5">
                <p className="m-0 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
                  {node.description}
                </p>
              </div>
            ) : null}

            {/* Plan / projected progress */}
            <div className="rounded-2xl border border-[var(--line)] bg-white p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-[10.5px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                    План
                  </p>
                  <p className="m-0 mt-0.5 text-[18px] font-extrabold text-[var(--text-main)]">
                    {formatValueWithSymbol(node.planTotal, node.valueSymbol, node.valueSymbolPosition)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-[10.5px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
                    Будет
                  </p>
                  <p className={`m-0 mt-0.5 text-[18px] font-extrabold ${tone.text}`}>
                    {projectedPercent}%
                  </p>
                </div>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${tone.bar}`}
                  style={{ width: `${projectedClamped}%` }}
                />
              </div>
            </div>

            {/* Reward preview: payout is proportional to completion, full amount at 100%+ */}
            {node.rewardAmount != null && node.rewardAmount > 0 ? (
              <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-3.5 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon icon="mdi:cash-multiple" width={16} className="text-amber-600 shrink-0" />
                  <p className="m-0 text-[11.5px] font-semibold text-amber-800 truncate">
                    Вознаграждение при 100%: {formatNumber(node.rewardAmount)}
                  </p>
                </div>
                <p className="m-0 shrink-0 text-[13px] font-extrabold text-amber-700">
                  ≈ {formatNumber((node.rewardAmount * projectedClamped) / 100)}
                </p>
              </div>
            ) : null}

            {/* Input */}
            <div className="mt-4">
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
                Фактическое значение
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    setError(null)
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-full h-14 rounded-2xl border border-[var(--line)] bg-white px-4 pr-12 text-[22px] font-extrabold text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
                {symbol ? (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-bold text-[var(--text-muted)]">
                    {symbol}
                  </span>
                ) : null}
              </div>
              {error ? (
                <p className="m-0 mt-1.5 text-[12px] font-semibold text-[var(--error-text)]">
                  {error}
                </p>
              ) : (
                <p className="m-0 mt-1.5 text-[11.5px] text-[var(--text-muted)]">
                  Текущий факт: {formatValueWithSymbol(node.actualTotal, node.valueSymbol, node.valueSymbolPosition)}
                </p>
              )}
            </div>

            {/* Quick chips */}
            {node.planTotal > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  { label: '50% плана', value: node.planTotal * 0.5 },
                  { label: '75% плана', value: node.planTotal * 0.75 },
                  { label: '100% плана', value: node.planTotal },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setQuickValue(preset.value)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-full bg-[var(--accent-soft)] border-0 text-[11.5px] font-bold text-[var(--accent)] cursor-pointer active:scale-95 disabled:opacity-60"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setQuickValue(0)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-full bg-gray-100 border-0 text-[11.5px] font-bold text-[var(--text-secondary)] cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  Сбросить
                </button>
              </div>
            ) : null}

            {/* Buttons */}
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 h-12 rounded-2xl border border-[var(--line)] bg-white text-[14px] font-bold text-[var(--text-secondary)] cursor-pointer active:bg-gray-50 disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || parsed == null}
                className="flex-[1.6] h-12 rounded-2xl border-0 text-white text-[14px] font-extrabold cursor-pointer active:scale-[0.985] disabled:opacity-60"
                style={{ background: brandColor }}
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Сохранение…
                  </span>
                ) : (
                  'Сохранить факт'
                )}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
