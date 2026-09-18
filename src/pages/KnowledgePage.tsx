import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import {
  buildArticleTree,
  knowledgeService,
  type KbArticleNode,
  type KbArticleSummary,
} from '../api/knowledgeService'

/**
 * База знаний — список статей (только чтение).
 *
 * В вебе слева всегда висит дерево, на телефоне для него нет места, поэтому
 * дерево здесь и есть экран: разделы раскрываются по шеврону, тап по строке
 * открывает статью. Поиск ищет по всему дереву и показывает результаты плоским
 * списком с путём до статьи — иначе найденную вложенную статью не опознать.
 */

const countDescendants = (node: KbArticleNode): number =>
  node.children.reduce((total, child) => total + 1 + countDescendants(child), 0)

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onOpen,
}: {
  node: KbArticleNode
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}) {
  const isOpen = expanded.has(node.id)
  const hasChildren = node.children.length > 0

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-xl transition active:bg-[var(--app-bg)]"
        style={{ paddingLeft: depth * 14 }}
      >
        {/* Раскрытие отдельной кнопкой: тап по строке должен открывать статью,
            а не разворачивать ветку — иначе до текста не добраться одним касанием. */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] active:bg-gray-100"
          >
            <Icon
              icon="mdi:chevron-right"
              width={18}
              className={`transition-transform ${isOpen ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="h-8 w-8 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onOpen(node.id)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent py-2.5 pr-1 text-left"
        >
          <span className="shrink-0 text-[17px] leading-none">{node.icon}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text-main)]">
            {node.title}
          </span>
          {hasChildren ? (
            <span className="shrink-0 rounded-full bg-[var(--app-bg)] px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--text-muted)]">
              {countDescendants(node)}
            </span>
          ) : null}
          <Icon icon="mdi:chevron-right" width={16} className="shrink-0 text-gray-300" />
        </button>
      </div>

      {isOpen
        ? node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))
        : null}
    </>
  )
}

export function KnowledgePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: articles = [], isPending, isError, refetch } = useQuery({
    queryKey: ['knowledge-articles'],
    queryFn: () => knowledgeService.listArticles(),
  })

  const tree = useMemo(() => buildArticleTree(articles), [articles])

  const byId = useMemo(
    () => new Map(articles.map((article) => [article.id, article])),
    [articles],
  )

  /** Путь до статьи строкой — показываем его в результатах поиска. */
  const pathOf = (article: KbArticleSummary): string => {
    const parts: string[] = []
    const seen = new Set<string>()
    let current = article.parentArticleId ? byId.get(article.parentArticleId) : undefined
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      parts.unshift(current.title)
      current = current.parentArticleId ? byId.get(current.parentArticleId) : undefined
    }
    return parts.join(' / ')
  }

  const found = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return []
    return articles.filter((article) => article.title.toLowerCase().includes(query))
  }, [articles, search])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openArticle = (id: string) => navigate(`/knowledge/${id}`)

  return (
    <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-1 min-h-0 flex-col gap-3.5">
      <div className="relative">
        <Icon
          icon="mdi:magnify"
          width={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по статьям..."
          className="h-11 w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] pl-10 pr-10 text-[13.5px] text-[var(--text-main)] shadow-[0_1px_4px_rgba(0,0,0,0.05)] outline-none transition-shadow focus:shadow-[0_1px_8px_rgba(0,0,0,0.1)]"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Очистить поиск"
            className="absolute right-3 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--text-muted)]"
          >
            <Icon icon="mdi:close" width={12} className="text-white" />
          </button>
        ) : null}
      </div>

      {isPending ? (
        // Скелет повторяет форму строки дерева (шеврон · иконка · заголовок),
        // чтобы список не «переезжал», когда данные приедут.
        <>
          <section className="rounded-2xl border border-gray-100 bg-[var(--surface)] p-1.5 shadow-sm">
            {[0, 1, 0, 1, 0, 0].map((depth, index) => (
              <div
                key={index}
                className="flex items-center gap-2 py-2.5 pr-1"
                style={{ paddingLeft: depth * 14 + 8 }}
              >
                <div className="h-5 w-5 shrink-0 animate-pulse rounded-md bg-gray-200/70" />
                <div className="h-5 w-5 shrink-0 animate-pulse rounded-md bg-gray-200/80" />
                <div
                  className="h-3.5 animate-pulse rounded-full bg-gray-200/60"
                  style={{ width: `${58 - depth * 12 + (index % 3) * 8}%` }}
                />
              </div>
            ))}
          </section>
          <p className="m-0 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)]">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
            Загружаем базу знаний…
          </p>
        </>
      ) : isError ? (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-4">
          <div className="flex items-start gap-2.5">
            <Icon
              icon="mdi:alert-circle-outline"
              width={20}
              className="mt-0.5 shrink-0 text-[var(--error-text)]"
            />
            <div className="flex-1">
              <p className="m-0 text-[13.5px] font-bold text-[var(--error-text)]">
                Не удалось загрузить базу знаний
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--error-line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-bold text-[var(--error-text)] active:scale-95"
              >
                <Icon icon="mdi:refresh" width={13} />
                Повторить
              </button>
            </div>
          </div>
        </div>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--surface)] p-8 text-center shadow-sm">
          <Icon icon="mdi:book-open-page-variant-outline" width={40} className="text-gray-300" />
          <p className="m-0 text-sm text-gray-500">В базе знаний пока нет статей</p>
        </div>
      ) : search ? (
        found.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--surface)] p-8 text-center shadow-sm">
            <Icon icon="mdi:magnify" width={40} className="text-gray-300" />
            <p className="m-0 text-sm text-gray-500">Ничего не найдено</p>
          </div>
        ) : (
          <section className="space-y-2">
            <p className="m-0 px-1 text-[11.5px] font-semibold text-[var(--text-muted)]">
              Найдено: {found.length}
            </p>
            {found.map((article) => {
              const path = pathOf(article)
              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => openArticle(article.id)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-gray-100 bg-[var(--surface)] p-3.5 text-left shadow-sm transition active:scale-[0.99]"
                >
                  <span className="shrink-0 text-[20px] leading-none">{article.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-[var(--text-main)]">
                      {article.title}
                    </span>
                    {path ? (
                      <span className="block truncate text-[12px] text-[var(--text-muted)]">
                        {path}
                      </span>
                    ) : null}
                  </span>
                  <Icon icon="mdi:chevron-right" width={20} className="shrink-0 text-gray-300" />
                </button>
              )
            })}
          </section>
        )
      ) : (
        <section className="rounded-2xl border border-gray-100 bg-[var(--surface)] p-1.5 shadow-sm">
          {tree.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onOpen={openArticle}
            />
          ))}
        </section>
      )}
    </div>
  )
}
