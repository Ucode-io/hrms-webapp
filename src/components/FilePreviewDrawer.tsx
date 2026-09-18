// In-app file preview — the mini-app's counterpart to the admin's
// DocumentPreviewModal.
//
// Same idea, different budget: the admin renders .docx locally with
// docx-preview, which is not worth its weight in a Telegram mini-app, so every
// Office format goes to Microsoft's public viewer instead. That keeps this file
// dependency-free — images, video, audio and text the browser already handles,
// PDF goes in an iframe, and anything left falls back to opening the file.

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Drawer } from 'vaul'

type PreviewKind = 'image' | 'pdf' | 'office' | 'text' | 'video' | 'audio' | 'unsupported'

const OFFICE_EXT = [
  'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'xlsb', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf',
]
const TEXT_EXT = [
  'txt', 'csv', 'tsv', 'md', 'json', 'log', 'xml', 'yml', 'yaml',
  'html', 'htm', 'css', 'js', 'ts', 'sql', 'sh', 'py', 'go', 'java',
]

const getExtension = (value: string): string => {
  const clean = decodeURIComponent(value).split('?')[0].split('#')[0]
  const dot = clean.lastIndexOf('.')
  if (dot < 0) return ''
  // Trailing junk is normal here: a label like «файл.docx» would otherwise
  // resolve to the extension `docx»` and fall through to "unsupported".
  return (clean.slice(dot + 1).toLowerCase().match(/^[a-z0-9]+/) ?? [''])[0]
}

export const resolvePreviewKind = (fileUrl: string, fileName: string): PreviewKind => {
  const ext = getExtension(fileName) || getExtension(fileUrl)
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['mp4', 'webm', 'ogv', 'mov'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio'
  if (TEXT_EXT.includes(ext)) return 'text'
  // The viewer fetches the file itself, so it needs a URL it can reach.
  if (OFFICE_EXT.includes(ext)) return /^https?:\/\//i.test(fileUrl) ? 'office' : 'unsupported'
  return 'unsupported'
}

const officeViewerUrl = (fileUrl: string): string =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`

export function FilePreviewDrawer({
  open,
  onClose,
  fileUrl,
  fileName,
}: {
  open: boolean
  onClose: () => void
  fileUrl: string
  fileName: string
}) {
  const kind = resolvePreviewKind(fileUrl, fileName)
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || kind !== 'text' || !fileUrl) return
    let cancelled = false
    setIsLoading(true)
    setError('')
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.text()
      })
      .then((body) => {
        if (cancelled) return
        // ponytail: hard slice instead of virtualised scrolling — a preview on a
        // phone is for a look, not for reading 200k characters.
        setText(body.length > 200_000 ? `${body.slice(0, 200_000)}\n…` : body)
      })
      .catch(() => {
        if (!cancelled) setError('Не удалось загрузить содержимое файла.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, kind, fileUrl])

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[28px] bg-[var(--surface)] outline-none">
          <Drawer.Title className="sr-only">{fileName}</Drawer.Title>
          <Drawer.Description className="sr-only">Предпросмотр файла</Drawer.Description>

          <div className="flex shrink-0 justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-4 pb-3">
            <p className="m-0 min-w-0 flex-1 truncate text-[14px] font-bold text-[var(--text-main)]">
              {fileName}
            </p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--app-bg)] text-[var(--text-secondary)] no-underline"
              aria-label="Открыть файл"
            >
              <Icon icon="mdi:open-in-new" width={16} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--app-bg)] text-[var(--text-secondary)]"
              aria-label="Закрыть"
            >
              <Icon icon="mdi:close" width={18} />
            </button>
          </div>

          <div className="flex-1 overflow-auto bg-[var(--app-bg)] p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
            {kind === 'image' ? (
              <img src={fileUrl} alt={fileName} className="mx-auto max-h-[70dvh] rounded-2xl object-contain" />
            ) : kind === 'pdf' ? (
              // ponytail: plain iframe. Some in-app webviews render PDFs as a
              // blank frame — the "Открыть" button above is the escape hatch;
              // swap in a gview embed if that turns out to be the common case.
              <iframe src={fileUrl} title={fileName} className="h-[70dvh] w-full rounded-2xl border-0 bg-[var(--surface)]" />
            ) : kind === 'office' ? (
              <iframe
                src={officeViewerUrl(fileUrl)}
                title={fileName}
                className="h-[70dvh] w-full rounded-2xl border-0 bg-[var(--surface)]"
              />
            ) : kind === 'video' ? (
              <video src={fileUrl} controls className="w-full rounded-2xl" />
            ) : kind === 'audio' ? (
              <audio src={fileUrl} controls className="w-full" />
            ) : kind === 'text' ? (
              <div className="rounded-2xl bg-[var(--surface)] p-3">
                {isLoading && (
                  <p className="m-0 py-8 text-center text-[13px] text-[var(--text-muted)]">Загрузка…</p>
                )}
                {error && <p className="m-0 py-8 text-center text-[13px] text-rose-600">{error}</p>}
                {!isLoading && !error && (
                  <pre className="m-0 max-h-[68dvh] overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-[var(--text-main)]">
                    {text}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Icon icon="mdi:file-question-outline" width={44} className="text-[var(--text-muted)] opacity-40" />
                <p className="m-0 text-[13px] text-[var(--text-muted)]">
                  Предпросмотр для этого типа файла недоступен.
                </p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--surface)] px-4 text-[12.5px] font-semibold text-[var(--text-main)] no-underline"
                >
                  <Icon icon="mdi:open-in-new" width={14} />
                  Открыть файл
                </a>
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/**
 * Eye button that opens the preview for one file.
 *
 * Carries its own open state, so a list showing files only has to drop this in
 * next to the name — no drawer wiring per page.
 */
export function FilePreviewButton({
  fileUrl,
  fileName,
  className,
  size = 18,
}: {
  fileUrl: string
  fileName: string
  className?: string
  size?: number
}) {
  const [open, setOpen] = useState(false)
  if (!fileUrl) return null

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
        aria-label="Предпросмотр файла"
        className={
          className ??
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-[var(--accent)]'
        }
      >
        <Icon icon="mdi:eye-outline" width={size} />
      </button>
      <FilePreviewDrawer
        open={open}
        onClose={() => setOpen(false)}
        fileUrl={fileUrl}
        fileName={fileName}
      />
    </>
  )
}
