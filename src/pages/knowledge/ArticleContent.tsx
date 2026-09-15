import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import type { KbArticleSummary, KbBlock, KbInline, KbTextStyles } from '../../api/knowledgeService'
import { FilePreviewButton } from '../../components/FilePreviewDrawer'

/**
 * Отрисовка тела статьи базы знаний.
 *
 * Статья хранится документом BlockNote — массивом блоков, а не HTML. Это удобно:
 * рендерим блоки в React-узлы сами и не вставляем чужую разметку через
 * dangerouslySetInnerHTML, для которого на мобилке всё равно нет санитайзера.
 * Незнакомый тип блока не роняет экран — от него берётся текст.
 */

/** Цвета BlockNote приходят именами палитры редактора, а не CSS-значениями. */
const TEXT_COLORS: Record<string, string> = {
  gray: '#7d7d7d',
  brown: '#9f6b53',
  red: '#e03e3e',
  orange: '#d9730d',
  yellow: '#dfab01',
  green: '#4d6461',
  blue: '#0b6e99',
  purple: '#6940a5',
  pink: '#ad1a72',
}

const BACKGROUND_COLORS: Record<string, string> = {
  gray: '#ebeced',
  brown: '#e9e5e3',
  red: '#fbe4e4',
  orange: '#faebdd',
  yellow: '#fbf3db',
  green: '#ddedea',
  blue: '#ddebf1',
  purple: '#eae4f2',
  pink: '#f4dfeb',
}

const inlineStyle = (styles?: KbTextStyles): CSSProperties | undefined => {
  if (!styles) return undefined
  const css: CSSProperties = {}
  if (styles.textColor && styles.textColor !== 'default') {
    css.color = TEXT_COLORS[styles.textColor] || styles.textColor
  }
  if (styles.backgroundColor && styles.backgroundColor !== 'default') {
    css.background = BACKGROUND_COLORS[styles.backgroundColor] || styles.backgroundColor
  }
  return Object.keys(css).length > 0 ? css : undefined
}

const styleClass = (styles?: KbTextStyles): string => {
  if (!styles) return ''
  const parts: string[] = []
  if (styles.bold) parts.push('font-bold')
  if (styles.italic) parts.push('italic')
  if (styles.underline) parts.push('underline')
  if (styles.strike) parts.push('line-through')
  if (styles.code) {
    parts.push('rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.9em] text-rose-600')
  }
  return parts.join(' ')
}

const asInline = (content: unknown): KbInline[] =>
  Array.isArray(content) ? (content as KbInline[]) : []

function InlineContent({ content }: { content: unknown }) {
  const parts = asInline(content)
  if (parts.length === 0) return null

  return (
    <>
      {parts.map((part, index) => {
        if (part && part.type === 'link') {
          return (
            <a
              key={index}
              href={part.href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-[var(--accent)] underline underline-offset-2"
            >
              <InlineContent content={part.content} />
            </a>
          )
        }
        if (part && part.type === 'text') {
          const className = styleClass(part.styles)
          const style = inlineStyle(part.styles)
          if (!className && !style) return <Fragment key={index}>{part.text}</Fragment>
          return (
            <span key={index} className={className} style={style}>
              {part.text}
            </span>
          )
        }
        return null
      })}
    </>
  )
}

/** Есть ли в блоке хоть какой-то текст — пустые абзацы не занимают место. */
const hasText = (content: unknown): boolean =>
  asInline(content).some((part) =>
    part.type === 'link' ? hasText(part.content) : Boolean(part.text?.trim()),
  )

const plainText = (content: unknown): string =>
  asInline(content)
    .map((part) => (part.type === 'link' ? plainText(part.content) : part.text || ''))
    .join('')

const propString = (block: KbBlock, key: string): string => {
  const value = block.props?.[key]
  return typeof value === 'string' ? value : ''
}

const HEADING_CLASS: Record<number, string> = {
  1: 'mt-5 mb-1.5 text-[20px] font-extrabold leading-snug text-[var(--text-main)]',
  2: 'mt-4 mb-1.5 text-[17px] font-bold leading-snug text-[var(--text-main)]',
  3: 'mt-3.5 mb-1 text-[15px] font-bold leading-snug text-[var(--text-main)]',
}

function ListMarker({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <span
      className={`mt-[1px] shrink-0 text-[13.5px] font-semibold text-[var(--text-secondary)] ${
        // Номера бывают двузначными — им нужна колонка пошире, чем точке.
        wide ? 'w-5 text-right' : 'w-3'
      }`}
    >
      {children}
    </span>
  )
}

interface BlockProps {
  block: KbBlock
  /** Номер для нумерованного списка — считается на уровне родителя. */
  index?: number
  onOpenArticle: (articleId: string) => void
  resolveArticle: (articleId: string) => KbArticleSummary | undefined
}

function BlockView({ block, index, onOpenArticle, resolveArticle }: BlockProps) {
  const children = Array.isArray(block.children) ? block.children : []
  const nested =
    children.length > 0 ? (
      <div className="ml-4 mt-1">
        <BlockList
          blocks={children}
          onOpenArticle={onOpenArticle}
          resolveArticle={resolveArticle}
        />
      </div>
    ) : null

  switch (block.type) {
    case 'heading': {
      const rawLevel = Number(block.props?.level)
      const level = rawLevel >= 1 && rawLevel <= 3 ? rawLevel : 1
      return (
        <>
          <p className={HEADING_CLASS[level]}>
            <InlineContent content={block.content} />
          </p>
          {nested}
        </>
      )
    }

    case 'bulletListItem':
      return (
        <>
          <div className="flex gap-2">
            <ListMarker>•</ListMarker>
            <p className="m-0 flex-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">
              <InlineContent content={block.content} />
            </p>
          </div>
          {nested}
        </>
      )

    case 'numberedListItem':
      return (
        <>
          <div className="flex gap-2">
            <ListMarker wide>{(index ?? 0) + 1}.</ListMarker>
            <p className="m-0 flex-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">
              <InlineContent content={block.content} />
            </p>
          </div>
          {nested}
        </>
      )

    case 'checkListItem': {
      const checked = Boolean(block.props?.checked)
      return (
        <>
          <div className="flex gap-2">
            <Icon
              icon={checked ? 'mdi:checkbox-marked' : 'mdi:checkbox-blank-outline'}
              width={16}
              className={`mt-[3px] shrink-0 ${checked ? 'text-emerald-500' : 'text-gray-300'}`}
            />
            <p
              className={`m-0 flex-1 text-[14px] leading-relaxed ${
                checked
                  ? 'text-[var(--text-muted)] line-through'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <InlineContent content={block.content} />
            </p>
          </div>
          {nested}
        </>
      )
    }

    case 'quote':
    case 'blockquote':
      return (
        <>
          <blockquote className="my-1 border-l-[3px] border-[var(--accent)] pl-3">
            <p className="m-0 text-[14px] italic leading-relaxed text-[var(--text-secondary)]">
              <InlineContent content={block.content} />
            </p>
          </blockquote>
          {nested}
        </>
      )

    case 'codeBlock':
    case 'code':
      return (
        <>
          <pre className="scrollbar-hide my-1 overflow-x-auto rounded-xl bg-[#0f172a] px-3.5 py-3">
            <code className="font-mono text-[12.5px] leading-relaxed text-[#e2e8f0]">
              {plainText(block.content)}
            </code>
          </pre>
          {nested}
        </>
      )

    case 'image': {
      const url = propString(block, 'url')
      if (!url) return null
      const caption = propString(block, 'caption')
      return (
        <figure className="my-1.5">
          <img
            src={url}
            alt={caption || ''}
            loading="lazy"
            className="w-full rounded-2xl border border-[var(--line)] object-contain"
          />
          {caption ? (
            <figcaption className="mt-1 text-center text-[11.5px] text-[var(--text-muted)]">
              {caption}
            </figcaption>
          ) : null}
        </figure>
      )
    }

    case 'video': {
      const url = propString(block, 'url')
      if (!url) return null
      return (
        <video src={url} controls className="my-1.5 w-full rounded-2xl border border-[var(--line)]" />
      )
    }

    case 'audio': {
      const url = propString(block, 'url')
      if (!url) return null
      return <audio src={url} controls className="my-1.5 w-full" />
    }

    case 'file': {
      const url = propString(block, 'url')
      if (!url) return null
      const name = propString(block, 'name') || propString(block, 'caption') || 'Файл'
      return (
        <div className="my-1 flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white p-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
            <Icon icon="mdi:paperclip" width={18} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-main)]">
            {name}
          </span>
          <FilePreviewButton fileUrl={url} fileName={name} />
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Скачать файл"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-300 no-underline"
          >
            <Icon icon="mdi:download" width={18} />
          </a>
        </div>
      )
    }

    case 'table':
      return <TableBlock block={block} />

    case 'pageLink': {
      // Блок хранит только id подстатьи — заголовок и иконку берём из списка,
      // как это делает web-редактор.
      const articleId = propString(block, 'articleId')
      const target = articleId ? resolveArticle(articleId) : undefined
      if (!target) {
        return (
          <p className="my-1 text-[13px] italic text-[var(--text-muted)]">Подстатья удалена</p>
        )
      }
      return (
        <button
          type="button"
          onClick={() => onOpenArticle(target.id)}
          className="my-1 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--line)] bg-white p-3 text-left transition active:scale-[0.99]"
        >
          <span className="text-[18px] leading-none">{target.icon}</span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-main)]">
            {target.title}
          </span>
          <Icon icon="mdi:chevron-right" width={18} className="shrink-0 text-gray-300" />
        </button>
      )
    }

    case 'divider':
    case 'horizontalRule':
      return <hr className="my-3 border-0 border-t border-[var(--line)]" />

    case 'paragraph':
    default: {
      // Пустой абзац в BlockNote — это отбивка между блоками, а не пустая строка
      // текста: сохраняем интервал, но не рисуем «пустой» элемент.
      if (!hasText(block.content)) {
        return children.length > 0 ? <>{nested}</> : <div className="h-2" />
      }
      return (
        <>
          <p className="m-0 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            <InlineContent content={block.content} />
          </p>
          {nested}
        </>
      )
    }
  }
}

function TableBlock({ block }: { block: KbBlock }) {
  const content = block.content as { rows?: Array<{ cells?: unknown[] }> } | undefined
  const rows = Array.isArray(content?.rows) ? content.rows : []
  if (rows.length === 0) return null

  return (
    // Широкая таблица скроллится внутри себя — страница не должна ездить вбок.
    <div className="scrollbar-hide my-1.5 overflow-x-auto rounded-xl border border-[var(--line)]">
      <table className="w-full border-collapse bg-white">
        <tbody>
          {rows.map((row, rowIndex) => {
            const cells = Array.isArray(row?.cells) ? row.cells : []
            return (
              <tr key={rowIndex}>
                {cells.map((cell, cellIndex) => {
                  // Ячейка бывает и массивом inline-содержимого, и объектом с
                  // `content` — зависит от версии редактора, в котором её создали.
                  const cellContent = Array.isArray(cell)
                    ? cell
                    : ((cell as { content?: unknown })?.content ?? [])
                  return (
                    <td
                      key={cellIndex}
                      className={`border border-[var(--line)] px-2.5 py-2 align-top text-[13px] leading-snug ${
                        rowIndex === 0
                          ? 'bg-[var(--app-bg)] font-bold text-[var(--text-main)]'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      <InlineContent content={cellContent} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Порядковые номера пунктов нумерованного списка. Счёт идёт по подряд идущим
 * пунктам: любой другой блок между ними начинает нумерацию заново — так же
 * ведёт себя редактор.
 */
const numberList = (blocks: KbBlock[]): number[] =>
  blocks.reduce<number[]>((numbers, block, index) => {
    const previous = index > 0 ? numbers[index - 1] : -1
    const isItem = block?.type === 'numberedListItem'
    const continues = isItem && blocks[index - 1]?.type === 'numberedListItem'
    numbers.push(isItem ? (continues ? previous + 1 : 0) : -1)
    return numbers
  }, [])

function BlockList({
  blocks,
  onOpenArticle,
  resolveArticle,
}: {
  blocks: KbBlock[]
  onOpenArticle: (articleId: string) => void
  resolveArticle: (articleId: string) => KbArticleSummary | undefined
}) {
  const numbers = numberList(blocks)

  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block, index) => (
        <BlockView
          key={block.id || index}
          block={block}
          index={numbers[index] >= 0 ? numbers[index] : undefined}
          onOpenArticle={onOpenArticle}
          resolveArticle={resolveArticle}
        />
      ))}
    </div>
  )
}

export function ArticleContent({
  blocks,
  onOpenArticle,
  resolveArticle,
}: {
  blocks: KbBlock[]
  onOpenArticle: (articleId: string) => void
  resolveArticle: (articleId: string) => KbArticleSummary | undefined
}) {
  if (blocks.length === 0) {
    return <p className="m-0 text-[13px] text-[var(--text-muted)]">Статья пока пустая.</p>
  }
  return (
    <BlockList blocks={blocks} onOpenArticle={onOpenArticle} resolveArticle={resolveArticle} />
  )
}
