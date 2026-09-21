import { tr } from '../i18n'
import adminRequest from './adminRequest'

const REPORTS_FUNCTION_PATH = '/v2/invoke_function/udevs-hrms-reports'
const GET_ORG_STRUCTURE_METHOD = 'get_org_structure'
const UNASSIGNED_POSITION_KEY = '__unassigned_position__'

export interface OrgStructureGraphNode {
  id: string
  employeeGuid: string
  parentId: string | null
  positionId: string
  positionTitle: string
  departmentTitle: string
  email: string
  phone: string
  photo: string
  fullName: string
  initials: string
  hierarchyLevel: number
  directCount: number
  totalCount: number
}

export interface OrgStructureGraphEdge {
  source: string
  target: string
}

export interface OrgStructureSnapshot {
  nodes: OrgStructureGraphNode[]
  edges: OrgStructureGraphEdge[]
}

type OrgStructureReportNode = {
  id?: string
  parent_id?: string | null
  department_guid?: string
  hierarchy_level?: number
  direct_employees_count?: number
  total_employees_count?: number
  employeeDepartmentTitle?: string
  manager?: {
    full_name?: string | null
    email?: string | null
    phone?: string | null
    photo?: string | null
    initials?: string | null
    position_title?: string | null
  } | null
}

type OrgStructureReportEdge = {
  source?: string
  target?: string
}

type OrgStructureInvokeResult = {
  chart?: {
    nodes?: OrgStructureReportNode[]
    edges?: OrgStructureReportEdge[]
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const normalizeInvokeResult = <T>(raw: unknown): T => {
  if (isRecord(raw) && 'result' in raw) {
    return raw.result as T
  }
  if (isRecord(raw) && 'data' in raw && isRecord(raw.data) && 'result' in raw.data) {
    return (raw.data as Record<string, unknown>).result as T
  }
  if (
    isRecord(raw) &&
    'data' in raw &&
    isRecord(raw.data) &&
    'data' in raw.data &&
    isRecord((raw.data as Record<string, unknown>).data) &&
    'result' in ((raw.data as Record<string, unknown>).data as Record<string, unknown>)
  ) {
    return (((raw.data as Record<string, unknown>).data as Record<string, unknown>).result) as T
  }
  return raw as T
}

const invokeReports = async <T>(method: string, data: Record<string, unknown>): Promise<T> => {
  const response = await adminRequest.post(REPORTS_FUNCTION_PATH, {
    data: {
      method,
      data,
    },
  })
  return normalizeInvokeResult<T>(response)
}

const normalizeGraphNode = (node: OrgStructureReportNode): OrgStructureGraphNode | null => {
  const id = toText(node.id)
  if (!id) return null

  const manager = node.manager || null
  const positionId = toText(node.department_guid)
  const parentId = toText(node.parent_id) || null
  const positionTitle = toText(manager?.position_title) || tr('fallback.noPosition')
  const fullName = toText(manager?.full_name) || positionTitle
  const initials = toText(manager?.initials) || fullName.slice(0, 2).toUpperCase() || 'HR'
  const employeeGuid = id.startsWith('employee:') ? id.replace(/^employee:/, '') : ''

  return {
    id,
    employeeGuid,
    parentId,
    positionId: positionId && positionId !== UNASSIGNED_POSITION_KEY ? positionId : UNASSIGNED_POSITION_KEY,
    positionTitle,
    departmentTitle: toText(node.employeeDepartmentTitle),
    email: toText(manager?.email),
    phone: toText(manager?.phone),
    photo: toText(manager?.photo),
    fullName,
    initials,
    hierarchyLevel: Math.max(1, toNumber(node.hierarchy_level, 1)),
    directCount: Math.max(0, toNumber(node.direct_employees_count, 0)),
    totalCount: Math.max(0, toNumber(node.total_employees_count, 0)),
  }
}

const normalizeGraphEdge = (edge: OrgStructureReportEdge): OrgStructureGraphEdge | null => {
  const source = toText(edge.source)
  const target = toText(edge.target)
  if (!source || !target) return null
  return { source, target }
}

export const orgStructureService = {
  getOrgStructureSnapshot: async (companiesId?: string): Promise<OrgStructureSnapshot> => {
    const payload: Record<string, unknown> = {}
    const company = toText(companiesId)
    if (company) payload.companies_id = company

    const result = await invokeReports<OrgStructureInvokeResult>(GET_ORG_STRUCTURE_METHOD, payload)
    const rawNodes = Array.isArray(result?.chart?.nodes) ? result.chart.nodes : []
    const rawEdges = Array.isArray(result?.chart?.edges) ? result.chart.edges : []

    const nodes = rawNodes.map(normalizeGraphNode).filter(Boolean) as OrgStructureGraphNode[]
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edges = rawEdges
      .map(normalizeGraphEdge)
      .filter(Boolean)
      .filter((edge): edge is OrgStructureGraphEdge => Boolean(edge && nodeIds.has(edge.source) && nodeIds.has(edge.target)))

    return { nodes, edges }
  },
}
