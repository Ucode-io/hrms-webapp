import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { orgStructureService } from '../api/orgStructureService'
import { resolveCompaniesId } from '../api/adminRequest'
import { useAuth } from '../context/AuthContext'

const UNASSIGNED_POSITION_KEY = '__unassigned_position__'
const NODE_WIDTH = 248
const NODE_HEIGHT = 132
const HORIZONTAL_GAP = 64
const VERTICAL_GAP = 110
const STACK_GAP = 24
const STACK_INDENT = 36
const ROOT_GAP = 80
const COLOR_PALETTE = [
  {
    border: '#3B82F6',
    background: '#EFF6FF',
    avatar: '#315BDA',
  },
  {
    border: '#8B5CF6',
    background: '#F5F3FF',
    avatar: '#7C3AED',
  },
  {
    border: '#0E7490',
    background: '#ECFEFF',
    avatar: '#2E8B85',
  },
  {
    border: '#43A047',
    background: '#F0FDF4',
    avatar: '#43A047',
  },
]

type EmployeeTreeNode = {
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

type OrgGraphNodeData = {
  id: string
  fullName: string
  positionTitle: string
  departmentTitle: string
  email: string
  phone: string
  photo: string
  initials: string
  isSelected: boolean
  borderColor: string
  backgroundColor: string
  avatarColor: string
}

type GraphLayout = {
  nodes: Node<OrgGraphNodeData>[]
  edges: Edge[]
}

type Point = {
  x: number
  y: number
}

type OrgEdgeData = {
  sharedBusY?: number
}

const withAlpha = (hex: string, alphaHex: string): string => {
  const clean = hex.startsWith('#') ? hex : '#3b6cf5'
  return `${clean}${alphaHex}`
}

const getPaletteByLevel = (level: number) => {
  const index = Math.max(0, (level - 1) % COLOR_PALETTE.length)
  return COLOR_PALETTE[index]
}

const normalizeTitleForRank = (raw: string): string => {
  const map: Record<string, string> = {
    А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
    а: 'a', в: 'b', с: 'c', е: 'e', н: 'h', к: 'k', м: 'm', о: 'o', р: 'p', т: 't', х: 'x', у: 'y',
  }
  const source = raw.trim().toUpperCase()
  let result = ''
  for (const char of source) result += map[char] ?? char
  return result
}

const getPositionTitleRank = (rawTitle: string): number => {
  const title = normalizeTitleForRank(rawTitle)
  if (!title) return 999
  if (/^CEO\b/.test(title) || /\bCHIEF EXECUTIVE\b/.test(title)) return 1
  if (/^C[A-Z]O\b/.test(title)) return 2
  if (/\bVP\b/.test(title) || /\bVICE PRESIDENT\b/.test(title)) return 3
  if (/\bHEAD OF\b/.test(title)) return 4
  if (/\bDIRECTOR\b/.test(title)) return 5
  if (/\bTEAM LEAD\b/.test(title) || /\bTECH LEAD\b/.test(title)) return 6
  if (/\bMANAGER\b/.test(title)) return 7
  if (/\bSENIOR\b/.test(title)) return 8
  if (/\bMIDDLE\b/.test(title)) return 9
  if (/\bJUNIOR\b/.test(title) || /\bINTERN\b/.test(title) || /\bTRAINEE\b/.test(title)) return 10
  return 50
}

const OrgGraphNodeCard = ({ data }: NodeProps<Node<OrgGraphNodeData>>) => (
  <div
    className="group relative overflow-visible rounded-[22px] border-2 bg-white px-4 py-3 shadow-sm"
    style={{
      width: NODE_WIDTH,
      minHeight: NODE_HEIGHT,
      borderColor: data.borderColor,
      backgroundColor: data.backgroundColor,
      boxShadow: data.isSelected ? `0 0 0 2px ${withAlpha(data.borderColor, '22')}` : undefined,
    }}
    title={data.fullName}
  >
    <Handle id="target-top" type="target" position={Position.Top} className="!h-0 !w-0 !border-0 !bg-transparent" />
    <Handle id="target-left" type="target" position={Position.Left} className="!h-0 !w-0 !border-0 !bg-transparent" />

    <div className="flex items-start gap-3">
      <div
        className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[16px] font-extrabold"
        style={{ background: data.avatarColor, color: '#ffffff' }}
      >
        {data.photo ? (
          <img src={data.photo} alt={data.fullName} className="h-full w-full rounded-full object-cover" />
        ) : (
          data.initials
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[22px] leading-[1.05] font-black tracking-tight text-[var(--text-main)] truncate">
          {data.fullName}
        </p>
        <p className="m-0 mt-1 text-[14px] font-medium text-[var(--text-secondary)] truncate">
          {[data.positionTitle, data.departmentTitle].filter(Boolean).join(' • ')}
        </p>
      </div>
    </div>

    <Handle id="source-bottom" type="source" position={Position.Bottom} className="!h-0 !w-0 !border-0 !bg-transparent" />
    <Handle id="source-left" type="source" position={Position.Left} className="!h-0 !w-0 !border-0 !bg-transparent" />
  </div>
)

const nodeTypes: NodeTypes = {
  orgNode: OrgGraphNodeCard,
}

const buildRoundedPath = (rawPoints: Point[], radius = 12): string => {
  const points = rawPoints.filter((point, index, array) => {
    const prev = array[index - 1]
    return !prev || Math.abs(prev.x - point.x) > 0.5 || Math.abs(prev.y - point.y) > 0.5
  })

  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  let path = `M ${points[0].x} ${points[0].y}`

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const prevDistance = Math.hypot(current.x - prev.x, current.y - prev.y)
    const nextDistance = Math.hypot(next.x - current.x, next.y - current.y)
    const cornerRadius = Math.min(radius, prevDistance / 2, nextDistance / 2)

    const before = {
      x: current.x - ((current.x - prev.x) / prevDistance) * cornerRadius,
      y: current.y - ((current.y - prev.y) / prevDistance) * cornerRadius,
    }
    const after = {
      x: current.x + ((next.x - current.x) / nextDistance) * cornerRadius,
      y: current.y + ((next.y - current.y) / nextDistance) * cornerRadius,
    }

    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`
  }

  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
}

const OrgChartEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps) => {
  const isInnerStack = sourcePosition === Position.Left && targetPosition === Position.Left
  const isTargetLeft = targetPosition === Position.Left

  let points: Point[]

  if (isInnerStack) {
    const elbowX = Math.min(sourceX, targetX) - 28
    points = [
      { x: sourceX, y: sourceY },
      { x: elbowX, y: sourceY },
      { x: elbowX, y: targetY },
      { x: targetX, y: targetY },
    ]
  } else {
    const sharedBusY =
      data && typeof data === 'object' && 'sharedBusY' in data && typeof (data as OrgEdgeData).sharedBusY === 'number'
        ? (data as OrgEdgeData).sharedBusY
        : null
    const verticalGap = Math.max(42, Math.min(86, Math.abs(targetY - sourceY) * 0.34))
    const busY = sharedBusY ?? sourceY + verticalGap

    if (isTargetLeft) {
      const sideX = targetX - 28
      points = [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: busY },
        { x: sideX, y: busY },
        { x: sideX, y: targetY },
        { x: targetX, y: targetY },
      ]
    } else {
      points = [
        { x: sourceX, y: sourceY },
        { x: sourceX, y: busY },
        { x: targetX, y: busY },
        { x: targetX, y: targetY },
      ]
    }
  }

  return (
    <BaseEdge
      id={id}
      path={buildRoundedPath(points, 10)}
      style={{
        stroke: '#CBD5E1',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...style,
      }}
    />
  )
}

const edgeTypes: EdgeTypes = {
  org: OrgChartEdge,
}

const buildGraphLayout = ({
  employeeNodes,
  selectedNodeId,
}: {
  employeeNodes: EmployeeTreeNode[]
  selectedNodeId: string
}): GraphLayout => {
  if (employeeNodes.length === 0) return { nodes: [], edges: [] }

  const nodeById = new Map(employeeNodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, string[]>()
  for (const node of employeeNodes) {
    if (!node.parentId || !nodeById.has(node.parentId)) continue
    const bucket = childrenByParent.get(node.parentId) || []
    bucket.push(node.id)
    childrenByParent.set(node.parentId, bucket)
  }

  const roots = employeeNodes
    .filter((node) => !node.parentId || !nodeById.has(node.parentId))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
    .map((node) => node.id)

  const childGroupsMemo = new Map<string, string[][]>()
  const getChildGroups = (nodeId: string): string[][] => {
    if (childGroupsMemo.has(nodeId)) return childGroupsMemo.get(nodeId) as string[][]

    const childIds = childrenByParent.get(nodeId) || []
    if (childIds.length === 0) {
      childGroupsMemo.set(nodeId, [])
      return []
    }

    const groupsMap = new Map<string, string[]>()
    for (const childId of childIds) {
      const child = nodeById.get(childId)
      const key = child?.positionId || UNASSIGNED_POSITION_KEY
      const bucket = groupsMap.get(key) || []
      bucket.push(childId)
      groupsMap.set(key, bucket)
    }

    const groups = Array.from(groupsMap.entries()).map(([groupKey, ids]) => {
      ids.sort((a, b) => {
        const left = nodeById.get(a)?.fullName || ''
        const right = nodeById.get(b)?.fullName || ''
        return left.localeCompare(right, 'ru')
      })

      const title = nodeById.get(ids[0])?.positionTitle || ''
      const rank = getPositionTitleRank(title)
      const level = nodeById.get(ids[0])?.hierarchyLevel || 1
      return { groupKey, ids, rank, level, title }
    })

    groups.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      if (a.level !== b.level) return a.level - b.level
      const byTitle = a.title.localeCompare(b.title, 'ru')
      if (byTitle !== 0) return byTitle
      return a.groupKey.localeCompare(b.groupKey, 'ru')
    })

    const values = groups.map((group) => group.ids)
    childGroupsMemo.set(nodeId, values)
    return values
  }

  const widthMemo = new Map<string, number>()
  const heightMemo = new Map<string, number>()
  const childGroupsTotalHeightMemo = new Map<string, number>()

  const getSubtreeWidth = (nodeId: string): number => {
    if (widthMemo.has(nodeId)) return widthMemo.get(nodeId) as number

    const groups = getChildGroups(nodeId)
    if (groups.length === 0) {
      widthMemo.set(nodeId, NODE_WIDTH)
      return NODE_WIDTH
    }

    const groupWidths = groups.map((group) => {
      const maxWidth = group.reduce((max, childId) => Math.max(max, getSubtreeWidth(childId)), NODE_WIDTH)
      return group.length > 1 ? maxWidth + STACK_INDENT : maxWidth
    })

    const totalGroupsWidth =
      groupWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, groupWidths.length - 1) * HORIZONTAL_GAP

    const width = Math.max(NODE_WIDTH, totalGroupsWidth)
    widthMemo.set(nodeId, width)
    return width
  }

  const getChildGroupsTotalHeight = (nodeId: string): number => {
    if (childGroupsTotalHeightMemo.has(nodeId)) return childGroupsTotalHeightMemo.get(nodeId) as number

    const groups = getChildGroups(nodeId)
    if (groups.length === 0) {
      childGroupsTotalHeightMemo.set(nodeId, 0)
      return 0
    }

    const groupHeights = groups.map((group) => {
      if (group.length === 1) return getSubtreeHeight(group[0])

      const stackHeight = group.length * NODE_HEIGHT + Math.max(0, group.length - 1) * STACK_GAP
      let subtreesHeight = 0
      for (const childId of group) {
        const childSubtreeHeight = getChildGroupsTotalHeight(childId)
        if (childSubtreeHeight > 0) subtreesHeight += VERTICAL_GAP + childSubtreeHeight
      }
      return stackHeight + subtreesHeight
    })

    const total = Math.max(...groupHeights, 0)
    childGroupsTotalHeightMemo.set(nodeId, total)
    return total
  }

  const getSubtreeHeight = (nodeId: string): number => {
    if (heightMemo.has(nodeId)) return heightMemo.get(nodeId) as number
    const childHeight = getChildGroupsTotalHeight(nodeId)
    const height = childHeight === 0 ? NODE_HEIGHT : NODE_HEIGHT + VERTICAL_GAP + childHeight
    heightMemo.set(nodeId, height)
    return height
  }

  const positionById = new Map<string, { x: number; y: number }>()

  const placeChildGroups = (
    parentNodeId: string,
    parentLeftX: number,
    parentNodeWidth: number,
    topY: number,
  ): number => {
    const groups = getChildGroups(parentNodeId)
    if (groups.length === 0) return topY

    const groupWidths = groups.map((group) => {
      const maxWidth = group.reduce((max, childId) => Math.max(max, getSubtreeWidth(childId)), NODE_WIDTH)
      return group.length > 1 ? maxWidth + STACK_INDENT : maxWidth
    })
    const totalGroupsWidth =
      groupWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, groupWidths.length - 1) * HORIZONTAL_GAP

    let groupLeftX = parentLeftX + (parentNodeWidth - totalGroupsWidth) / 2
    let maxBottom = topY

    groups.forEach((group, groupIndex) => {
      const groupWidth = groupWidths[groupIndex]

      if (group.length === 1) {
        const childId = group[0]
        const childWidth = getSubtreeWidth(childId)
        const childLeftX = groupLeftX + (groupWidth - childWidth) / 2
        placeNode(childId, childLeftX, topY)
        maxBottom = Math.max(maxBottom, topY + getSubtreeHeight(childId))
      } else {
        const innerLeftX = groupLeftX + STACK_INDENT
        const innerWidth = groupWidth - STACK_INDENT
        let y = topY

        for (const childId of group) {
          positionById.set(childId, { x: innerLeftX + (innerWidth - NODE_WIDTH) / 2, y })
          y += NODE_HEIGHT + STACK_GAP
        }
        y -= STACK_GAP

        for (const childId of group) {
          if (getChildGroupsTotalHeight(childId) === 0) continue
          y += VERTICAL_GAP
          y = placeChildGroups(childId, innerLeftX, innerWidth, y)
        }

        maxBottom = Math.max(maxBottom, y)
      }

      groupLeftX += groupWidth + HORIZONTAL_GAP
    })

    return maxBottom
  }

  const placeNode = (nodeId: string, leftX: number, topY: number) => {
    const subtreeWidth = getSubtreeWidth(nodeId)
    const nodeX = leftX + (subtreeWidth - NODE_WIDTH) / 2
    positionById.set(nodeId, { x: nodeX, y: topY })

    if (getChildGroups(nodeId).length === 0) return
    const childStartY = topY + NODE_HEIGHT + VERTICAL_GAP
    placeChildGroups(nodeId, leftX, subtreeWidth, childStartY)
  }

  const totalRootsWidth =
    roots.reduce((sum, rootId) => sum + getSubtreeWidth(rootId), 0) +
    Math.max(0, roots.length - 1) * ROOT_GAP
  let rootLeftX = 40
  if (roots.length > 0 && totalRootsWidth < 1200) rootLeftX += (1200 - totalRootsWidth) / 2

  for (const rootId of roots) {
    const rootWidth = getSubtreeWidth(rootId)
    placeNode(rootId, rootLeftX, 40)
    rootLeftX += rootWidth + ROOT_GAP
  }

  for (const parentNodeId of employeeNodes.map((node) => node.id)) {
    const parentNode = nodeById.get(parentNodeId)
    const parentPosition = positionById.get(parentNodeId)
    if (!parentNode || parentNode.hierarchyLevel !== 1 || !parentPosition) continue

    const primaryChildId = getChildGroups(parentNodeId)
      .find((group) => group.length === 1 && getChildGroups(group[0]).length > 0)?.[0]
    const childPosition = primaryChildId ? positionById.get(primaryChildId) : null
    if (!childPosition) continue

    const delta = (childPosition.x + NODE_WIDTH / 2) - (parentPosition.x + NODE_WIDTH / 2)
    if (Math.abs(delta) > 80) continue

    const nudge = Math.max(-48, Math.min(48, delta))
    positionById.set(parentNodeId, { ...parentPosition, x: parentPosition.x + nudge })
  }

  const nodes: Node<OrgGraphNodeData>[] = employeeNodes.map((node) => {
    const palette = getPaletteByLevel(node.hierarchyLevel)
    return {
      id: node.id,
      type: 'orgNode',
      position: positionById.get(node.id) || { x: 0, y: 0 },
      data: {
        id: node.id,
        fullName: node.fullName,
        positionTitle: node.positionTitle,
        departmentTitle: node.departmentTitle,
        email: node.email,
        phone: node.phone,
        photo: node.photo,
        initials: node.initials,
        isSelected: selectedNodeId === node.id,
        borderColor: palette.border,
        backgroundColor: palette.background,
        avatarColor: palette.avatar,
      },
      draggable: false,
      selectable: true,
    }
  })

  const childGroupMetaByNodeId = new Map<
    string,
    {
      isVerticalStack: boolean
      isFirstInGroup: boolean
      previousInGroupId: string | null
    }
  >()
  for (const [, childIds] of childrenByParent.entries()) {
    const groupsMap = new Map<string, string[]>()
    for (const childId of childIds) {
      const childNode = nodeById.get(childId)
      const groupKey =
        childNode && typeof childNode.positionId === 'string' && childNode.positionId.trim()
          ? childNode.positionId.trim()
          : UNASSIGNED_POSITION_KEY

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, [])
      }
      groupsMap.get(groupKey)?.push(childId)
    }

    for (const ids of groupsMap.values()) {
      ids.sort((leftId, rightId) => {
        const leftTitle = nodeById.get(leftId)?.fullName || ''
        const rightTitle = nodeById.get(rightId)?.fullName || ''
        return leftTitle.localeCompare(rightTitle, 'ru')
      })

      const isVerticalStack = ids.length > 1
      for (let index = 0; index < ids.length; index += 1) {
        childGroupMetaByNodeId.set(ids[index], {
          isVerticalStack,
          isFirstInGroup: index === 0,
          previousInGroupId: index > 0 ? ids[index - 1] : null,
        })
      }
    }
  }

  const sharedBusYByParentId = new Map<string, number>()
  for (const [parentId, childIds] of childrenByParent.entries()) {
    const parentPosition = positionById.get(parentId)
    if (!parentPosition || childIds.length === 0) {
      continue
    }

    const directChildIds = childIds.filter((childId) => {
      const groupMeta = childGroupMetaByNodeId.get(childId)
      return !(groupMeta?.isVerticalStack && !groupMeta.isFirstInGroup && groupMeta.previousInGroupId)
    })
    if (directChildIds.length === 0) {
      continue
    }

    const sourceY = parentPosition.y + NODE_HEIGHT
    const minTargetY = directChildIds.reduce((minY, childId) => {
      const childPosition = positionById.get(childId)
      if (!childPosition) return minY
      return Math.min(minY, childPosition.y)
    }, Number.POSITIVE_INFINITY)

    if (!Number.isFinite(minTargetY)) {
      continue
    }

    const verticalGap = Math.max(42, Math.min(86, Math.abs(minTargetY - sourceY) * 0.34))
    sharedBusYByParentId.set(parentId, sourceY + verticalGap)
  }

  const edges: Edge[] = employeeNodes
    .filter((node) => node.parentId && nodeById.has(node.parentId))
    .map((node) => {
      const groupMeta = childGroupMetaByNodeId.get(node.id)
      const parentId = String(node.parentId)
      const stackedLinkSourceId =
        groupMeta?.isVerticalStack && !groupMeta.isFirstInGroup && groupMeta.previousInGroupId
          ? groupMeta.previousInGroupId
          : null
      const source = stackedLinkSourceId || parentId
      const target = node.id
      const isInnerStackEdge = Boolean(stackedLinkSourceId)
      const isVerticalStackEdge = Boolean(groupMeta?.isVerticalStack)

      let sourceHandle = 'source-bottom'
      let targetHandle = 'target-top'
      if (isInnerStackEdge) {
        sourceHandle = 'source-left'
        targetHandle = 'target-left'
      } else if (isVerticalStackEdge) {
        sourceHandle = 'source-bottom'
        targetHandle = 'target-left'
      }

      const sharedBusY = !isInnerStackEdge ? sharedBusYByParentId.get(parentId) : undefined

      return {
        id: `edge:${source}:${target}`,
        source,
        target,
        sourceHandle,
        targetHandle,
        type: 'org',
        animated: false,
        style: {
          stroke: '#CBD5E1',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        zIndex: 0,
        data: sharedBusY !== undefined ? ({ sharedBusY } satisfies OrgEdgeData) : undefined,
      }
    })

  return { nodes, edges }
}

export function OrgStructurePage() {
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const { session, profile } = useAuth()
  const companyId = useMemo(
    () => resolveCompaniesId(profile, session?.user_data, session?.user),
    [profile, session],
  )

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['org-structure-mobile', companyId],
    queryFn: async () => {
      return orgStructureService.getOrgStructureSnapshot(companyId || undefined)
    },
  })

  const employeeTreeNodes = data?.nodes || []

  const graph = useMemo(
    () => buildGraphLayout({ employeeNodes: employeeTreeNodes, selectedNodeId }),
    [employeeTreeNodes, selectedNodeId],
  )
  const selectedEmployee = useMemo(
    () => employeeTreeNodes.find((node) => node.id === selectedNodeId) || null,
    [employeeTreeNodes, selectedNodeId],
  )

  const onNodeClick = useMemo<NodeMouseHandler<Node<OrgGraphNodeData>>>(
    () => (_event, node) => setSelectedNodeId(String(node.id)),
    [],
  )

  if (isLoading) {
    return (
      <div className="animate-fade-in-up h-[calc(100svh-132px)] w-full flex items-center justify-center">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[var(--accent)]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-fade-in-up h-[calc(100svh-132px)] w-full flex items-center justify-center px-4 text-sm text-[var(--error-text)]">
        Не удалось загрузить оргструктуру
      </div>
    )
  }

  if (!employeeTreeNodes.length) {
    return (
      <div className="animate-fade-in-up h-[calc(100svh-132px)] w-full flex items-center justify-center px-4">
        <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-center">
          <p className="m-0 text-[15px] font-semibold text-[var(--text-main)]">Нет данных для отображения</p>
          <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">Оргструктура для выбранной компании не найдена.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up relative h-[calc(100svh-132px)] w-full overflow-hidden bg-[var(--app-bg)]">
      <button
        type="button"
        onClick={() => setSelectedNodeId('')}
        className="absolute right-2 top-2 z-10 rounded-md border border-[var(--line)] bg-white/90 px-2 py-1 text-[11px] font-semibold text-[var(--accent)] backdrop-blur-sm"
      >
        Сбросить
      </button>

      <ReactFlow<Node<OrgGraphNodeData>, Edge>
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background gap={16} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>

      <Drawer.Root open={Boolean(selectedEmployee)} onOpenChange={(open) => {
        if (!open) setSelectedNodeId('')
      }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] bg-white outline-none">
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-[4px] w-10 rounded-full bg-gray-300" />
            </div>
            {selectedEmployee ? (
              <div className="px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-[20px] font-extrabold text-white"
                    style={{ background: getPaletteByLevel(selectedEmployee.hierarchyLevel).avatar }}
                  >
                    {selectedEmployee.photo ? (
                      <img src={selectedEmployee.photo} alt={selectedEmployee.fullName} className="h-full w-full object-cover" />
                    ) : (
                      selectedEmployee.initials
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Drawer.Title className="m-0 truncate text-[19px] font-extrabold text-[var(--text-main)]">
                      {selectedEmployee.fullName}
                    </Drawer.Title>
                    <p className="m-0 mt-1 text-[13px] font-semibold text-[var(--text-secondary)]">
                      {selectedEmployee.positionTitle}
                    </p>
                    <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">
                      {selectedEmployee.departmentTitle}
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 rounded-2xl bg-[var(--app-bg)] p-3">
                  <div className="flex justify-between gap-4 text-[13px]">
                    <span className="text-[var(--text-muted)]">Email</span>
                    <span className="truncate font-semibold text-[var(--text-main)]">{selectedEmployee.email || 'Не указан'}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-[13px]">
                    <span className="text-[var(--text-muted)]">Телефон</span>
                    <span className="truncate font-semibold text-[var(--text-main)]">{selectedEmployee.phone || 'Не указан'}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
