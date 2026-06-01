import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { Drawer } from 'vaul'
import { useAuth } from '../context/AuthContext'
import {
  propertyService,
  normalizeStatus,
  formatDate,
  formatDatetime,
  PROPERTY_STATUS_CONFIG,
  type PropertyItem,
  type PropertyHistoryItem,
  type PropertyStatus,
} from '../api/propertyService'

/* ── Helpers ────────────────────────────────────────── */
function formatCost(value: number | null | undefined): string {
  if (!value && value !== 0) return '—'
  return Number(value).toLocaleString('ru-RU')
}

/* ── Status badge ────────────────────────────────────── */
function StatusBadge({ status }: { status: PropertyStatus }) {
  const cfg = PROPERTY_STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

/* ── History timeline ────────────────────────────────── */
function HistoryTimeline({ history }: { history: PropertyHistoryItem[] }) {
  if (history.length === 0) {
    return (
      <p className="text-center text-[12px] text-[var(--text-muted)] py-4">
        История изменений пуста
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-0 pl-1">
      {history.map((entry, index) => {
        const fromRaw = Array.isArray(entry.from_status) ? entry.from_status[0] : entry.from_status
        const toRaw = Array.isArray(entry.to_status) ? entry.to_status[0] : entry.to_status
        const fromStatus = fromRaw as PropertyStatus | null
        const toStatus = (toRaw as PropertyStatus) || 'in_stock'
        const toCfg = PROPERTY_STATUS_CONFIG[toStatus] || PROPERTY_STATUS_CONFIG.in_stock
        const fromCfg = fromStatus ? PROPERTY_STATUS_CONFIG[fromStatus] : null
        const isLast = index === history.length - 1

        const authorData = entry.user_base_id_2_data
        const author = authorData
          ? [authorData.second_name, authorData.first_name].filter(Boolean).join(' ')
          : '—'

        return (
          <li key={entry.guid} className="relative flex gap-3 pb-5">
            {!isLast && (
              <span className="absolute left-[7px] top-4 h-full w-px bg-[var(--line)]" />
            )}
            <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-white ${toCfg.dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--text-main)]">
                {fromCfg ? (
                  <>
                    <span className="text-[var(--text-muted)]">{fromCfg.label}</span>
                    <Icon icon="mdi:arrow-right" width={12} className="text-[var(--text-muted)]" />
                  </>
                ) : null}
                <span className="font-semibold">{toCfg.label}</span>
              </div>
              {entry.comment && (
                <p className="m-0 mt-1 rounded-xl bg-[var(--app-bg)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)]">
                  {entry.comment}
                </p>
              )}
              <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">
                {formatDatetime(entry.created_at)} · {author}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ── Detail drawer ───────────────────────────────────── */
function DetailDrawer({
  item,
  open,
  onClose,
}: {
  item: PropertyItem | null
  open: boolean
  onClose: () => void
}) {
  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ['property-history', item?.guid],
    queryFn: () => propertyService.getHistory(item!.guid),
    enabled: open && Boolean(item?.guid),
    staleTime: 60_000,
  })

  if (!item) return null

  const status = normalizeStatus(item.status)
  const categoryTitle = item.property_categories_id_data?.title || null

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[28px] bg-white outline-none">
          <Drawer.Title className="sr-only">{item.name}</Drawer.Title>
          <Drawer.Description className="sr-only">Детали имущества</Drawer.Description>

          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
            {/* Photo */}
            {item.photo ? (
              <div className="mb-4 h-44 w-full overflow-hidden rounded-2xl bg-gray-100">
                <img src={item.photo} alt={item.name || ''} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="mb-4 flex h-32 items-center justify-center rounded-2xl bg-[var(--app-bg)]">
                <Icon icon="mdi:package-variant-closed" width={44} className="text-[var(--text-muted)] opacity-30" />
              </div>
            )}

            {/* Name + status */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="m-0 text-[18px] font-extrabold text-[var(--text-main)] leading-snug">
                {item.name || 'Без названия'}
              </h2>
              <div className="shrink-0"><StatusBadge status={status} /></div>
            </div>
            {categoryTitle && (
              <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">{categoryTitle}</p>
            )}

            {/* Info rows */}
            <div className="mt-4 rounded-2xl border border-[var(--line)] divide-y divide-[var(--line)]">
              {[
                { label: 'Серийный номер', value: item.serial_number || '—' },
                { label: 'Стоимость',      value: formatCost(item.cost) },
                { label: 'Дата покупки',   value: formatDate(item.purchase_date) },
                { label: 'Гарантия до',    value: formatDate(item.warranty_until) },
                { label: 'Дата выдачи',    value: formatDate(item.assigned_date) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
                  <span className="text-[13px] font-semibold text-[var(--text-main)]">{value}</span>
                </div>
              ))}
            </div>

            {/* Description */}
            {item.description && (
              <div className="mt-3 rounded-2xl bg-[var(--app-bg)] px-4 py-3">
                <p className="m-0 text-[12px] font-semibold text-[var(--text-muted)] mb-1">Описание</p>
                <p className="m-0 text-[13px] text-[var(--text-secondary)]">{item.description}</p>
              </div>
            )}

            {/* History */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">История движения</p>
                {!isHistoryLoading && (
                  <span className="rounded-full bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
                    {history.length}
                  </span>
                )}
              </div>
              {isHistoryLoading ? (
                <div className="flex justify-center py-6">
                  <Icon icon="mdi:loading" width={24} className="animate-spin text-[var(--text-muted)]" />
                </div>
              ) : (
                <HistoryTimeline history={history} />
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/* ── Property card ───────────────────────────────────── */
function PropertyCard({ item, onOpen }: { item: PropertyItem; onOpen: () => void }) {
  const status = normalizeStatus(item.status)
  const categoryTitle = item.property_categories_id_data?.title

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-2xl border border-[var(--line)] bg-white overflow-hidden active:scale-[0.98] transition-transform"
    >
      {/* Photo strip */}
      {item.photo ? (
        <div className="h-28 w-full overflow-hidden bg-gray-100">
          <img src={item.photo} alt={item.name || ''} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center bg-[var(--app-bg)]">
          <Icon icon="mdi:package-variant-closed" width={32} className="text-[var(--text-muted)] opacity-30" />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="m-0 text-[13px] font-bold text-[var(--text-main)] leading-snug line-clamp-2 flex-1">
            {item.name || 'Без названия'}
          </p>
          <StatusBadge status={status} />
        </div>
        {categoryTitle && (
          <span className="mt-2 inline-block rounded-lg bg-[var(--app-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">
            {categoryTitle}
          </span>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[14px] font-extrabold text-[var(--text-main)]">
            {formatCost(item.cost)}
          </span>
          <Icon icon="mdi:chevron-right" width={16} className="text-[var(--text-muted)]" />
        </div>
      </div>
    </button>
  )
}

/* ── Page ────────────────────────────────────────────── */
export function PropertyPage() {
  const { session, profile } = useAuth()
  const [selectedItem, setSelectedItem] = useState<PropertyItem | null>(null)

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) || '',
    [profile, session],
  )

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['my-property', employeeGuid],
    queryFn: () => propertyService.getMyItems(employeeGuid),
    enabled: Boolean(employeeGuid),
    staleTime: 2 * 60 * 1000,
  })


  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5">

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-white border border-[var(--line)] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-white px-6 py-12 text-center">
          <Icon icon="mdi:package-variant-closed" width={44} className="text-[var(--text-muted)] opacity-30" />
          <p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">
            Имущество не закреплено
          </p>
          <p className="m-0 text-[12px] text-[var(--text-muted)] opacity-70">
            Имущество, закреплённое за вами, появится здесь
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <PropertyCard
              key={item.guid}
              item={item}
              onOpen={() => setSelectedItem(item)}
            />
          ))}
        </div>
      )}

      <DetailDrawer
        item={selectedItem}
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  )
}
