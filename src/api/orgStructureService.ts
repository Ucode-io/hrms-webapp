import adminRequest from './adminRequest'

const DEPARTMENTS_SLUG = 'departments'
const USERS_SLUG = 'user_base'
const POSITIONS_SLUG = 'positions'
const EMPLOYEE_ROLE_ID = import.meta.env.VITE_EMPLOYEE_ROLE_ID || '52e5168d-660b-4339-9ec4-9c02ae226345'

export interface OrgDepartment {
  guid: string
  title: string
  parentDepartmentId: string | null
  leaderGuid: string
  leaderName: string
}

export interface OrgEmployee {
  guid: string
  fullName: string
  firstName: string
  secondName: string
  middleName: string
  email: string
  phone: string
  positionId: string
  positionTitle: string
  departmentId: string
  departmentTitle: string
  photo: string
}

export interface OrgPosition {
  guid: string
  title: string
  parentPositionId: string | null
}

type RawDepartment = Record<string, unknown>
type RawEmployee = Record<string, unknown>
type RawPosition = Record<string, unknown>

const encodeData = (data: Record<string, unknown>): string => encodeURIComponent(JSON.stringify(data))

const extractList = <T>(res: unknown): T[] => {
  if (Array.isArray(res)) return res as T[]
  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const resolveLeaderName = (source: RawDepartment): string => {
  const relation = toRecord(source.user_base_id_data)
  if (!relation) return 'Не назначен'

  const firstName = toText(relation.first_name)
  const secondName = toText(relation.second_name)
  const middleName = toText(relation.middle_name)
  const fullName = [secondName, firstName, middleName].filter(Boolean).join(' ').trim()
  return fullName || 'Не назначен'
}

const normalizeDepartment = (raw: RawDepartment): OrgDepartment | null => {
  const guid = toText(raw.guid)
  const title = toText(raw.title)
  if (!guid || !title) return null

  const parentRaw = toText(raw.departments_id)
  return {
    guid,
    title,
    parentDepartmentId: parentRaw || null,
    leaderGuid: toText(raw.user_base_id),
    leaderName: resolveLeaderName(raw),
  }
}

const resolveEmployeeFullName = (raw: RawEmployee): string => {
  const firstName = toText(raw.first_name)
  const secondName = toText(raw.second_name)
  const middleName = toText(raw.middle_name)
  const fullName = [secondName, firstName, middleName].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  const login = toText(raw.login)
  if (login) return login
  const email = toText(raw.email)
  if (email) return email
  return 'Сотрудник'
}

const normalizeEmployee = (raw: RawEmployee): OrgEmployee | null => {
  const guid = toText(raw.guid)
  if (!guid) return null

  const deptRelation = toRecord(raw.departments_id_data)
  const departmentTitle = toText(deptRelation?.title)
  const firstName = toText(raw.first_name)
  const secondName = toText(raw.second_name)
  const middleName = toText(raw.middle_name)
  const positionId = toText(raw.positions_id)

  return {
    guid,
    fullName: resolveEmployeeFullName(raw),
    firstName,
    secondName,
    middleName,
    email: toText(raw.email),
    phone: toText(raw.phone),
    positionId,
    positionTitle: toText(toRecord(raw.positions_id_data)?.title) || 'Без должности',
    departmentId: toText(raw.departments_id),
    departmentTitle: departmentTitle || 'Без департамента',
    photo: toText(raw.photo) || toText(raw.avatar),
  }
}

const normalizePosition = (raw: RawPosition): OrgPosition | null => {
  const guid = toText(raw.guid)
  const title = toText(raw.title)
  if (!guid || !title) return null
  const parentPositionId = toText(raw.positions_id)
  return {
    guid,
    title,
    parentPositionId: parentPositionId || null,
  }
}

const fetchAllBySlug = async <T extends Record<string, unknown>>(
  slug: string,
  queryData: Record<string, unknown> = {},
): Promise<T[]> => {
  const limit = 200
  let offset = 0
  const maxPages = 50
  const list: T[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const res = await adminRequest.get(`/v2/items/${slug}`, {
      params: {
        with_relations: true,
        data: encodeData({ limit, offset, ...queryData }),
      },
    })

    const chunk = extractList<T>(res)
    if (chunk.length === 0) break
    list.push(...chunk)
    offset += chunk.length
    if (chunk.length < limit) break
  }

  return list
}

export const orgStructureService = {
  getDepartments: async (): Promise<OrgDepartment[]> => {
    const raw = await fetchAllBySlug<RawDepartment>(DEPARTMENTS_SLUG)
    const mapped = raw.map(normalizeDepartment).filter(Boolean) as OrgDepartment[]

    const byId = new Set(mapped.map((item) => item.guid))
    return mapped
      .map((item) => ({
        ...item,
        parentDepartmentId: item.parentDepartmentId && byId.has(item.parentDepartmentId)
          ? item.parentDepartmentId
          : null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  },

  getEmployees: async (): Promise<OrgEmployee[]> => {
    const raw = await fetchAllBySlug<RawEmployee>(
      USERS_SLUG,
      EMPLOYEE_ROLE_ID ? { role_id: EMPLOYEE_ROLE_ID } : {},
    )
    const mapped = raw.map(normalizeEmployee).filter(Boolean) as OrgEmployee[]
    return mapped.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
  },

  getPositions: async (): Promise<OrgPosition[]> => {
    const raw = await fetchAllBySlug<RawPosition>(POSITIONS_SLUG)
    const mapped = raw.map(normalizePosition).filter(Boolean) as OrgPosition[]
    const byId = new Set(mapped.map((item) => item.guid))

    return mapped
      .map((item) => ({
        ...item,
        parentPositionId: item.parentPositionId && byId.has(item.parentPositionId)
          ? item.parentPositionId
          : null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  },
}
