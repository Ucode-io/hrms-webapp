import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import {
  documentsService,
  getDocumentType,
  getDocumentName,
  type DocumentFolder,
  type EmployeeDocument,
  type DocumentType,
} from '../api/documentsService'
import { FilePreviewDrawer } from '../components/FilePreviewDrawer'

/* ── Type config ─────────────────────────────────────── */
const TYPE_CONFIG: Record<
  DocumentType,
  { icon: string; iconColor: string; badgeText: string; badgeBg: string; badgeText2: string }
> = {
  pdf: {
    icon: 'mdi:file-pdf-box',
    iconColor: '#ef4444',
    badgeText: 'PDF',
    badgeBg: '#ef4444',
    badgeText2: '#fff',
  },
  image: {
    icon: 'mdi:image',
    iconColor: '#3b82f6',
    badgeText: 'IMG',
    badgeBg: '#3b82f6',
    badgeText2: '#fff',
  },
  docx: {
    icon: 'mdi:file-word',
    iconColor: '#6366f1',
    badgeText: 'DOC',
    badgeBg: '#6366f1',
    badgeText2: '#fff',
  },
  other: {
    icon: 'mdi:file-outline',
    iconColor: '#94a3b8',
    badgeText: 'FILE',
    badgeBg: '#94a3b8',
    badgeText2: '#fff',
  },
}

/**
 * Заливка плитки файла — прозрачная подмешка его же тона. Раньше рядом лежала
 * пара светлых стопов градиента; в тёмной теме они оставались пастельными
 * (ремап утилит в index.css до градиентных стопов не достаёт), и плитка
 * светилась белым. Теперь тон один и тема учитывается сама.
 */
const toneFill = (color: string): string =>
  `linear-gradient(to bottom right, color-mix(in srgb, ${color} 20%, transparent), color-mix(in srgb, ${color} 10%, transparent))`

/* ── Skeleton card ───────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-[var(--surface)] overflow-hidden shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
      <div className="h-[88px] bg-[var(--surface-sunken)] animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded-full bg-[var(--surface-sunken)] animate-pulse w-4/5" />
        <div className="h-3 rounded-full bg-[var(--surface-sunken)] animate-pulse w-3/5" />
        <div className="h-8 rounded-xl bg-[var(--surface-sunken)] animate-pulse mt-3" />
      </div>
    </div>
  )
}

/* ── Document card ───────────────────────────────────── */
function DocCard({ doc, accentColor }: { doc: EmployeeDocument; accentColor: string }) {
  const type = getDocumentType(doc.type)
  const cfg = TYPE_CONFIG[type]
  const name = getDocumentName(doc)
  const folderTitle = doc.document_folders_id_data?.title || null
  const file = typeof doc.file === 'string' ? doc.file : ''
  const [isPreviewOpen, setPreviewOpen] = useState(false)

  return (
    <>
    <button
      type="button"
      onClick={() => { if (file) setPreviewOpen(true) }}
      className="w-full text-left rounded-2xl bg-[var(--surface)] overflow-hidden shadow-[0_1px_8px_rgba(0,0,0,0.07)] active:scale-[0.97] transition-transform"
    >
      {/* Preview area */}
      {type === 'image' && doc.file ? (
        <div className="h-28 w-full overflow-hidden relative">
          <img src={doc.file} alt={name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <span
            className="absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wide"
            style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText2 }}
          >
            {cfg.badgeText}
          </span>
        </div>
      ) : (
        <div className="h-[88px] w-full flex items-center justify-center relative" style={{ background: toneFill(cfg.iconColor) }}>
          <Icon icon={cfg.icon} width={44} style={{ color: cfg.iconColor }} />
          <span
            className="absolute top-2.5 right-2.5 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wide"
            style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText2 }}
          >
            {cfg.badgeText}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="px-3 pt-2.5 pb-3">
        <p className="m-0 text-[12.5px] font-bold text-[var(--text-main)] leading-snug line-clamp-2">
          {name}
        </p>

        {folderTitle && (
          <div className="mt-1.5 flex items-center gap-1">
            <Icon icon="mdi:folder-outline" width={11} className="text-[var(--text-muted)] shrink-0" />
            <span className="text-[11px] text-[var(--text-muted)] truncate">{folderTitle}</span>
          </div>
        )}

        {/* Open button */}
        <div
          className="mt-2.5 w-full h-8 rounded-xl flex items-center justify-center gap-1.5 text-[12px] font-semibold text-white"
          style={{ backgroundColor: accentColor }}
        >
          <Icon icon="mdi:eye-outline" width={14} />
          Открыть
        </div>
      </div>
    </button>
    <FilePreviewDrawer
      open={isPreviewOpen}
      onClose={() => setPreviewOpen(false)}
      fileUrl={file}
      fileName={name}
    />
    </>
  )
}

/* ── List row (for folder detail view) ──────────────── */
function DocRow({ doc, accentColor }: { doc: EmployeeDocument; accentColor: string }) {
  const type = getDocumentType(doc.type)
  const cfg = TYPE_CONFIG[type]
  const name = getDocumentName(doc)
  const file = typeof doc.file === 'string' ? doc.file : ''
  const [isPreviewOpen, setPreviewOpen] = useState(false)

  return (
    <>
    <button
      type="button"
      onClick={() => { if (file) setPreviewOpen(true) }}
      className="w-full flex items-center gap-3 bg-[var(--surface)] rounded-2xl px-3.5 py-3 shadow-[0_1px_6px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform text-left"
    >
      {/* Icon */}
      <div
        className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"
        style={{ background: toneFill(cfg.iconColor) }}
      >
        <Icon icon={cfg.icon} width={24} style={{ color: cfg.iconColor }} />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-semibold text-[var(--text-main)] leading-snug truncate">{name}</p>
        <span
          className="mt-0.5 inline-block rounded px-1.5 py-0 text-[10px] font-black tracking-wide"
          style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText2 }}
        >
          {cfg.badgeText}
        </span>
      </div>

      {/* Open icon */}
      <div
        className="shrink-0 h-8 w-8 rounded-xl flex items-center justify-center text-white"
        style={{ backgroundColor: accentColor }}
      >
        <Icon icon="mdi:eye-outline" width={16} />
      </div>
    </button>
    <FilePreviewDrawer
      open={isPreviewOpen}
      onClose={() => setPreviewOpen(false)}
      fileUrl={file}
      fileName={name}
    />
    </>
  )
}

/* ── Folder chip ─────────────────────────────────────── */
function FolderChip({
  label,
  count,
  active,
  accentColor,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  accentColor: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 h-9 rounded-full px-4 text-[12.5px] font-bold border transition-all active:scale-[0.95] ${
        active ? 'text-white border-transparent' : 'bg-[var(--surface)] border-[var(--line)] text-[var(--text-secondary)]'
      }`}
      style={active ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
    >
      {label}
      <span
        className={`inline-flex items-center justify-center h-5 min-w-[20px] rounded-full text-[10px] font-black px-1 ${
          active ? 'bg-white/25 text-white' : 'bg-[var(--app-bg)] text-[var(--text-muted)]'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

/* ── Page ────────────────────────────────────────────── */
export function DocumentsPage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()
  const accentColor = company.mainColor || '#3b6cf5'

  const [activeFolderId, setActiveFolderId] = useState<string | 'all'>('all')
  const [search, setSearch] = useState('')

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) || '',
    [profile, session],
  )

  const { data: docsData, isLoading } = useQuery({
    queryKey: ['my-documents', employeeGuid],
    queryFn: () => documentsService.getDocumentsByEmployee(employeeGuid),
    enabled: Boolean(employeeGuid),
    staleTime: 2 * 60 * 1000,
  })

  const documents = docsData?.documents ?? []

  /* Folders derived from docs */
  const folders = useMemo<DocumentFolder[]>(() => {
    const map = new Map<string, DocumentFolder>()
    for (const doc of documents) {
      const fId = doc.document_folders_id
      const fData = doc.document_folders_id_data
      if (fId && fData && !map.has(fId)) {
        map.set(fId, { guid: fId, title: fData.title || 'Папка' })
      }
    }
    return [...map.values()]
  }, [documents])

  const folderCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const doc of documents) {
      if (doc.document_folders_id) m[doc.document_folders_id] = (m[doc.document_folders_id] || 0) + 1
    }
    return m
  }, [documents])

  const filtered = useMemo(() => {
    let list = documents
    if (activeFolderId !== 'all') list = list.filter((d) => d.document_folders_id === activeFolderId)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((d) => getDocumentName(d).toLowerCase().includes(q))
    return list
  }, [documents, activeFolderId, search])

  /* Use list layout when searching or folder is selected (fits better for narrow text) */
  const useListLayout = Boolean(search || activeFolderId !== 'all')

  return (
    <div className="animate-fade-in-up flex flex-col gap-4">

      {/* ── Search bar ────────────────────────────────── */}
      <div className="relative">
        <Icon
          icon="mdi:magnify"
          width={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActiveFolderId('all') }}
          placeholder="Поиск по названию..."
          className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] pl-10 pr-10 text-[13.5px] text-[var(--text-main)] outline-none shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition-shadow focus:shadow-[0_1px_8px_rgba(0,0,0,0.1)]"
          style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[var(--text-muted)] flex items-center justify-center"
          >
            <Icon icon="mdi:close" width={12} className="text-white" />
          </button>
        )}
      </div>


      {/* ── Folder chips ──────────────────────────────── */}
      {folders.length > 0 && !search && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-0.5">
          <FolderChip
            label="Все"
            count={documents.length}
            active={activeFolderId === 'all'}
            accentColor={accentColor}
            onClick={() => setActiveFolderId('all')}
          />
          {folders.map((folder) => (
            <FolderChip
              key={folder.guid}
              label={folder.title || 'Папка'}
              count={folderCount[folder.guid] || 0}
              active={activeFolderId === folder.guid}
              accentColor={accentColor}
              onClick={() => setActiveFolderId(folder.guid)}
            />
          ))}
        </div>
      )}

      {/* ── Content ───────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-[var(--surface)] px-6 py-14 text-center shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
          <div className="h-16 w-16 rounded-2xl bg-[var(--app-bg)] flex items-center justify-center">
            <Icon icon="mdi:file-search-outline" width={32} className="text-[var(--text-muted)] opacity-50" />
          </div>
          <div>
            <p className="m-0 text-[14px] font-bold text-[var(--text-main)]">
              {search ? 'Ничего не найдено' : 'Документов пока нет'}
            </p>
            <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)] leading-relaxed">
              {search
                ? `По запросу «${search}» ничего не нашлось`
                : 'Документы, загруженные HR, появятся здесь'}
            </p>
          </div>
        </div>
      ) : useListLayout ? (
        /* List layout — when searching or folder is active */
        <div className="flex flex-col gap-2">
          {search && (
            <p className="m-0 text-[12px] text-[var(--text-muted)] px-1">
              Найдено: <span className="font-semibold text-[var(--text-secondary)]">{filtered.length}</span>
            </p>
          )}
          {filtered.map((doc) => (
            <DocRow key={doc.guid} doc={doc} accentColor={accentColor} />
          ))}
        </div>
      ) : (
        /* Grid layout — default */
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((doc) => (
            <DocCard key={doc.guid} doc={doc} accentColor={accentColor} />
          ))}
        </div>
      )}

    </div>
  )
}
