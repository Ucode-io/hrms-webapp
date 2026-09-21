import { tr } from '../i18n'
import adminRequest from './adminRequest'

export interface DocumentFolder {
  guid: string
  title?: string | null
  description?: string | null
  [key: string]: unknown
}

export interface EmployeeDocument {
  guid: string
  name?: string | null
  file?: string | null
  type?: string[] | string | null
  user_base_id?: string | null
  document_folders_id?: string | null
  document_folders_id_data?: { guid?: string; title?: string } | null
  created_at?: string | null
  [key: string]: unknown
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

function extractCount(res: unknown): number {
  const obj = (res && typeof res === 'object') ? (res as Record<string, unknown>) : {}
  return Number(obj.count || 0)
}

export type DocumentType = 'pdf' | 'image' | 'docx' | 'other'

export function getDocumentType(raw: string[] | string | null | undefined): DocumentType {
  const value = (Array.isArray(raw) ? raw[0] : raw || '').toLowerCase()
  if (value.includes('pdf')) return 'pdf'
  if (value.includes('image') || value.includes('jpg') || value.includes('jpeg') || value.includes('png') || value.includes('photo')) return 'image'
  if (value.includes('doc') || value.includes('word')) return 'docx'
  return 'other'
}

export function getDocumentName(doc: EmployeeDocument): string {
  if (doc.name && typeof doc.name === 'string' && doc.name.trim()) return doc.name.trim()
  if (doc.file && typeof doc.file === 'string') {
    const parts = doc.file.split('/')
    const last = parts[parts.length - 1] || ''
    return last.replace(/\?.*$/, '') || tr('fallback.document')
  }
  return tr('fallback.document')
}

export const documentsService = {
  getFolders: async (): Promise<{ count: number; folders: DocumentFolder[] }> => {
    const res = await adminRequest.get('/v2/items/document_folders', {
      params: { data: encodeData({ limit: 100, offset: 0 }) },
    })
    return { count: extractCount(res), folders: extractList<DocumentFolder>(res) }
  },

  getDocumentsByEmployee: async (userBaseId: string): Promise<{ count: number; documents: EmployeeDocument[] }> => {
    const res = await adminRequest.get('/v2/items/documents', {
      params: {
        with_relations: true,
        data: encodeData({ user_base_id: userBaseId, limit: 200, offset: 0 }),
      },
    })
    return { count: extractCount(res), documents: extractList<EmployeeDocument>(res) }
  },
}
