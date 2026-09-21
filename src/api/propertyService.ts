import { type TKey } from '../i18n'
import adminRequest from './adminRequest'

export interface PropertyCategory {
  guid: string
  title?: string | null
}

export type PropertyStatus = 'in_stock' | 'assigned' | 'repair' | 'written_off'

export const PROPERTY_STATUS_CONFIG: Record<PropertyStatus, { label: TKey; color: string; dot: string }> = {
  in_stock:    { label: 'property.inStock',   color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  assigned:    { label: 'property.assigned',  color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  repair:      { label: 'property.repair',    color: 'bg-amber-50 text-amber-700',    dot: 'bg-amber-500' },
  written_off: { label: 'property.writtenOff', color: 'bg-rose-50 text-rose-700',      dot: 'bg-rose-500' },
}

export interface PropertyItem {
  guid: string
  name?: string | null
  serial_number?: string | null
  cost?: number | null
  photo?: string | null
  purchase_date?: string | null
  warranty_until?: string | null
  description?: string | null
  status?: string[] | string | null
  user_base_id?: string | null
  assigned_date?: string | null
  property_categories_id?: string | null
  property_categories_id_data?: PropertyCategory | null
}

export interface PropertyHistoryItem {
  guid: string
  from_status?: string[] | string | null
  to_status?: string[] | string | null
  movement_date?: string | null
  comment?: string | null
  created_at?: string | null
  user_base_id_2_data?: { first_name?: string; second_name?: string } | null
}

function encodeData(data: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(data))
}

function extractList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

export function normalizeStatus(raw: string[] | string | null | undefined): PropertyStatus {
  const v = Array.isArray(raw) ? raw[0] : raw
  const valid: PropertyStatus[] = ['in_stock', 'assigned', 'repair', 'written_off']
  return valid.includes(v as PropertyStatus) ? (v as PropertyStatus) : 'in_stock'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

export function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} ${time}`
}

export const propertyService = {
  getMyItems: async (userBaseId: string): Promise<PropertyItem[]> => {
    const res = await adminRequest.get('/v2/items/properties', {
      params: {
        with_relations: true,
        data: encodeData({ user_base_id: userBaseId, status: ['assigned'], limit: 100, offset: 0 }),
      },
    })
    return extractList<PropertyItem>(res)
  },

  getHistory: async (propertiesId: string): Promise<PropertyHistoryItem[]> => {
    const res = await adminRequest.get('/v2/items/property_histories', {
      params: {
        with_relations: true,
        data: encodeData({ properties_id: propertiesId, limit: 100, offset: 0 }),
      },
    })
    return extractList<PropertyHistoryItem>(res).sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || '')
    )
  },
}
