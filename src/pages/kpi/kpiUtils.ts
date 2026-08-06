import type {
  KpiAggregationType,
  KpiPeriodType,
  KpiTableGroup,
  KpiTableItem,
} from '../../api/reportsService'

export type KpiNode = {
  id: string
  parentId: string | null
  position: string
  title: string
  description: string
  source: string
  valueSymbol: string
  valueSymbolPosition: 'prefix' | 'suffix'
  periodType: KpiPeriodType
  aggregationType: KpiAggregationType
  startDate: string
  endDate: string
  planTotal: number
  actualTotal: number
  percentTotal: number
  hasChildren: boolean
  rewardAmount: number | null
  employeeIds: string[]
  children: KpiNode[]
}

export type KpiGroup = {
  position: string
  items: KpiNode[]
}

export const KPI_PERIOD_TABS: Array<{ key: KpiPeriodType; short: string; label: string }> = [
  { key: 'yearly', short: 'Год', label: 'Год' },
  { key: 'quarterly', short: 'Кв', label: 'Квартал' },
  { key: 'monthly', short: 'Мес', label: 'Месяц' },
  { key: 'weekly', short: 'Нед', label: 'Неделя' },
]

const pad = (value: number): string => String(value).padStart(2, '0')

const toIsoDate = (value: Date): string =>
  `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`

const parseIsoDate = (iso: string): Date | null => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const parsed = new Date(`${iso}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getWeekStart = (value: Date): Date => {
  const day = value.getDay()
  const mondayShift = day === 0 ? -6 : 1 - day
  const start = new Date(value)
  start.setDate(value.getDate() + mondayShift)
  return start
}

const getQuarterStart = (value: Date): Date =>
  new Date(value.getFullYear(), Math.floor(value.getMonth() / 3) * 3, 1)

export const getPeriodRange = (cursorDate: Date, mode: KpiPeriodType): { from: string; to: string } => {
  if (mode === 'yearly') {
    return {
      from: toIsoDate(new Date(cursorDate.getFullYear(), 0, 1)),
      to: toIsoDate(new Date(cursorDate.getFullYear(), 11, 31)),
    }
  }
  if (mode === 'quarterly') {
    const start = getQuarterStart(cursorDate)
    const end = new Date(start.getFullYear(), start.getMonth() + 3, 0)
    return { from: toIsoDate(start), to: toIsoDate(end) }
  }
  if (mode === 'monthly') {
    const start = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1)
    const end = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0)
    return { from: toIsoDate(start), to: toIsoDate(end) }
  }
  const start = getWeekStart(cursorDate)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { from: toIsoDate(start), to: toIsoDate(end) }
}

export const formatPeriodLabel = (cursorDate: Date, mode: KpiPeriodType): string => {
  if (mode === 'yearly') return `${cursorDate.getFullYear()}`
  if (mode === 'quarterly') return `${Math.floor(cursorDate.getMonth() / 3) + 1}-й квартал ${cursorDate.getFullYear()}`
  if (mode === 'monthly') {
    const formatted = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(cursorDate)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }
  const start = getWeekStart(cursorDate)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return `${pad(start.getDate())}.${pad(start.getMonth() + 1)} – ${pad(end.getDate())}.${pad(end.getMonth() + 1)}`
}

export const movePeriod = (cursorDate: Date, mode: KpiPeriodType, direction: 'prev' | 'next'): Date => {
  const next = new Date(cursorDate)
  if (mode === 'yearly') next.setFullYear(next.getFullYear() + (direction === 'next' ? 1 : -1))
  else if (mode === 'quarterly') next.setMonth(next.getMonth() + (direction === 'next' ? 3 : -3))
  else if (mode === 'monthly') next.setMonth(next.getMonth() + (direction === 'next' ? 1 : -1))
  else next.setDate(next.getDate() + (direction === 'next' ? 7 : -7))
  return next
}

const normalizePeriodType = (value: unknown): KpiPeriodType => {
  if (value === 'yearly' || value === 'quarterly' || value === 'monthly' || value === 'weekly' || value === 'daily') {
    return value
  }
  return 'monthly'
}

const normalizeAggregationType = (value: unknown): KpiAggregationType => {
  if (value === 'sum' || value === 'min' || value === 'max' || value === 'avg') return value
  return 'sum'
}

/** Mirrors the backend's `aggregateActuals` (kpi-common.js) so an optimistic
 * fact edit on mobile shows the same parent total the next refetch would. */
export const aggregateActuals = (values: number[], aggregationType: KpiAggregationType): number => {
  if (values.length === 0) return 0
  switch (aggregationType) {
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
    case 'avg':
      return values.reduce((sum, value) => sum + value, 0) / values.length
    case 'sum':
    default:
      return values.reduce((sum, value) => sum + value, 0)
  }
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export const calcPercent = (actual: number, plan: number): number => {
  if (!Number.isFinite(actual) || !Number.isFinite(plan) || plan <= 0) return 0
  return Math.round((actual / plan) * 100)
}

export const formatNumber = (value: number): string => {
  const rounded = Math.round(value * 100) / 100
  if (Number.isInteger(rounded)) return new Intl.NumberFormat('ru-RU').format(rounded)
  return rounded.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
}

export const formatValueWithSymbol = (value: number, symbol: string, position: 'prefix' | 'suffix'): string => {
  const base = formatNumber(value)
  const normalized = symbol.trim()
  if (!normalized) return base
  return position === 'prefix' ? `${normalized} ${base}` : `${base} ${normalized}`
}

export const formatCompactPeriodLabel = (periodType: KpiPeriodType, startDateIso: string, endDateIso: string): string => {
  const start = parseIsoDate(startDateIso)
  const end = parseIsoDate(endDateIso)
  if (!start || !end) return '—'
  if (periodType === 'yearly') return String(start.getFullYear())
  if (periodType === 'quarterly') return `${Math.floor(start.getMonth() / 3) + 1} кв. ${start.getFullYear()}`
  if (periodType === 'monthly') {
    const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(start)
    return monthShort.charAt(0).toUpperCase() + monthShort.slice(1)
  }
  if (periodType === 'weekly') return `${pad(start.getDate())}.${pad(start.getMonth() + 1)} – ${pad(end.getDate())}.${pad(end.getMonth() + 1)}`
  return `${pad(start.getDate())}.${pad(start.getMonth() + 1)}`
}

export const getTypeLabel = (periodType: KpiPeriodType): string => {
  if (periodType === 'yearly') return 'Год'
  if (periodType === 'quarterly') return 'Квартал'
  if (periodType === 'monthly') return 'Месяц'
  if (periodType === 'weekly') return 'Неделя'
  return 'День'
}

export const getTypeChipClass = (periodType: KpiPeriodType): string => {
  if (periodType === 'yearly') return 'bg-violet-50 text-violet-700'
  if (periodType === 'quarterly') return 'bg-emerald-50 text-emerald-700'
  if (periodType === 'monthly') return 'bg-blue-50 text-blue-700'
  if (periodType === 'weekly') return 'bg-amber-50 text-amber-700'
  return 'bg-rose-50 text-rose-700'
}

export const getPercentTone = (
  percent: number,
): { text: string; bar: string; soft: string; ring: string } => {
  if (percent >= 100) return { text: 'text-emerald-700', bar: 'bg-emerald-500', soft: 'bg-emerald-50', ring: '#10b981' }
  if (percent >= 70) return { text: 'text-blue-700', bar: 'bg-blue-500', soft: 'bg-blue-50', ring: '#3b82f6' }
  if (percent >= 40) return { text: 'text-amber-700', bar: 'bg-amber-500', soft: 'bg-amber-50', ring: '#f59e0b' }
  return { text: 'text-rose-700', bar: 'bg-rose-500', soft: 'bg-rose-50', ring: '#f43f5e' }
}

export const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export const normalizeNode = (raw: KpiTableItem): KpiNode => {
  const children = Array.isArray(raw.children) ? raw.children.map(normalizeNode) : []
  const periodType = normalizePeriodType(raw.period_type)
  const planTotal = toNumber(raw.plan_total)
  const actualTotal = toNumber(raw.actual_total)
  const percentTotal = Number.isFinite(toNumber(raw.percent_total))
    ? toNumber(raw.percent_total)
    : calcPercent(actualTotal, planTotal)

  return {
    id: raw.guid,
    parentId: typeof raw.parent_id === 'string' ? raw.parent_id : null,
    position: typeof raw.position === 'string' && raw.position.trim() ? raw.position : 'Без должности',
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Без названия',
    description: typeof raw.description === 'string' ? raw.description : '',
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source : 'Вручную',
    valueSymbol: typeof raw.value_symbol === 'string' ? raw.value_symbol : '',
    valueSymbolPosition: raw.value_symbol_position === 'prefix' ? 'prefix' : 'suffix',
    periodType,
    aggregationType: normalizeAggregationType(raw.aggregation_type),
    startDate: typeof raw.start_date === 'string' ? raw.start_date : '',
    endDate: typeof raw.end_date === 'string' ? raw.end_date : '',
    planTotal,
    actualTotal,
    percentTotal,
    hasChildren: Boolean(raw.has_children) || children.length > 0,
    rewardAmount: typeof raw.reward_amount === 'number' ? raw.reward_amount : null,
    employeeIds: Array.isArray(raw.employee_ids)
      ? raw.employee_ids.filter((id): id is string => typeof id === 'string')
      : [],
    children,
  }
}

export const normalizeGroups = (response: { groups?: KpiTableGroup[]; items?: KpiTableItem[] }): KpiGroup[] => {
  // Top-level cards must be roots only: a server that still lists a child
  // among the roots (it matched the table's own date/position filters) would
  // otherwise render that KPI twice — once nested, once as its own card.
  const isRoot = (item: KpiTableItem) => item.parent_id == null

  const rawGroups = Array.isArray(response.groups) ? response.groups : []
  if (rawGroups.length > 0) {
    return rawGroups.map((group) => ({
      position: typeof group.position === 'string' && group.position.trim() ? group.position : 'Без должности',
      items: Array.isArray(group.items) ? group.items.filter(isRoot).map(normalizeNode) : [],
    }))
  }
  const items = Array.isArray(response.items) ? response.items.filter(isRoot).map(normalizeNode) : []
  return [{ position: 'KPI', items }]
}

const updateNodeActual = (node: KpiNode, targetId: string, nextActual: number): KpiNode => {
  if (!node.hasChildren || node.children.length === 0) {
    if (node.id !== targetId) return node
    const percent = calcPercent(nextActual, node.planTotal)
    return { ...node, actualTotal: nextActual, percentTotal: percent }
  }

  const nextChildren = node.children.map((child) => updateNodeActual(child, targetId, nextActual))
  const nextActualTotal = aggregateActuals(
    nextChildren.map((child) => child.actualTotal),
    node.aggregationType,
  )
  return {
    ...node,
    children: nextChildren,
    actualTotal: nextActualTotal,
    percentTotal: calcPercent(nextActualTotal, node.planTotal),
  }
}

export const updateGroupsActual = (groups: KpiGroup[], targetId: string, nextActual: number): KpiGroup[] =>
  groups.map((group) => ({
    ...group,
    items: group.items.map((item) => updateNodeActual(item, targetId, nextActual)),
  }))

export const tryParseActualValue = (raw: string): number | null => {
  if (!raw.trim()) return null
  const normalized = raw.replace(/\s+/g, '').replace(',', '.')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

export const getPositionIdFromSource = (source: unknown): string => {
  if (!source || typeof source !== 'object') return ''
  const record = source as Record<string, unknown>

  const directCandidates = [
    record.positions_id,
    record.position_id,
    record.employee_positions_id,
    record.positionsId,
    record.positionId,
  ]

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }

  const relationCandidates = [record.position, record.positions, record.positions_id_data]
  for (const relation of relationCandidates) {
    if (relation && typeof relation === 'object') {
      const guid = (relation as Record<string, unknown>).guid
      if (typeof guid === 'string' && guid.trim()) return guid
    }
  }

  return ''
}

export const countNodes = (nodes: KpiNode[]): number =>
  nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)

export const countNodesByType = (nodes: KpiNode[], type: KpiPeriodType): number =>
  nodes.reduce(
    (sum, node) => sum + (node.periodType === type ? 1 : 0) + countNodesByType(node.children, type),
    0,
  )

export const collectLeaves = (nodes: KpiNode[]): KpiNode[] =>
  nodes.flatMap((node) => (node.children.length > 0 ? collectLeaves(node.children) : [node]))
