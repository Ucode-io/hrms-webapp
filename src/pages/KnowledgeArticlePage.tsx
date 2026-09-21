import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useT, formatDateLocal } from '../i18n'
import {
  articleAncestors,
  articleChildren,
  knowledgeService,
} from '../api/knowledgeService'
import { ArticleContent } from './knowledge/ArticleContent'

/**
 * Статья базы знаний — только чтение.
 *
 * Список статей грузится вместе с телом: он уже закэширован экраном базы знаний
 * и нужен здесь для хлебных крошек, подстатей и разрешения ссылок `pageLink`
 * внутри текста (в блоке лежит только id).
 */

const formatDate = (value: string): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDateLocal(parsed, { day: 'numeric', month: 'long', year: 'numeric' })
}

export function KnowledgeArticlePage() {
  const t = useT()

  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const articleId = id || ''

  const articleQuery = useQuery({
    queryKey: ['knowledge-article', articleId],
    queryFn: () => knowledgeService.getArticle(articleId),
    enabled: Boolean(articleId),
    retry: false,
  })

  // Тот же ключ, что на экране списка: возврат назад и переходы между статьями
  // не дёргают сеть заново.
  const articlesQuery = useQuery({
    queryKey: ['knowledge-articles'],
    queryFn: () => knowledgeService.listArticles(),
  })
  const articles = useMemo(() => articlesQuery.data ?? [], [articlesQuery.data])
  // Открытие статьи по прямой ссылке — единственный случай, когда списка ещё
  // нет: крошки и подстатьи из него строятся, и без заглушки они выскакивали бы
  // поверх уже прочитанного текста, сдвигая его.
  const treeLoading = articlesQuery.isPending

  const article = articleQuery.data
  const ancestors = useMemo(
    () => articleAncestors(articles, articleId).slice(0, -1),
    [articles, articleId],
  )
  const children = useMemo(() => articleChildren(articles, articleId), [articles, articleId])
  const byId = useMemo(() => new Map(articles.map((item) => [item.id, item])), [articles])

  const openArticle = (nextId: string) => navigate(`/knowledge/${nextId}`)

  // Переход по ссылке на подстатью роутер делает без сброса прокрутки, поэтому
  // новая статья открывалась бы с середины — там, где кончилась предыдущая.
  useEffect(() => {
    const scroller = document.querySelector('.k-page')
    scroller?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
  }, [articleId])

  if (articleQuery.isPending) {
    // Скелет повторяет раскладку статьи (крошки → карточка-шапка → карточка
    // текста): тело статьи грузится отдельным запросом и на медленной сети
    // ожидание заметное — пустой белый экран читался бы как ошибка.
    return (
      <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <div className="h-4 w-2/5 animate-pulse rounded-full bg-gray-200/70" />

        <div className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-gray-200/80" />
          <div className="mt-3 h-6 w-3/5 animate-pulse rounded-lg bg-gray-200/80" />
          <div className="mt-2.5 h-3 w-1/3 animate-pulse rounded-full bg-gray-200/60" />
        </div>

        <div className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
          <div className="h-5 w-2/5 animate-pulse rounded-lg bg-gray-200/80" />
          <div className="mt-3 space-y-2.5">
            {['100%', '92%', '84%'].map((width, index) => (
              <div
                key={index}
                className="h-3.5 animate-pulse rounded-full bg-gray-200/60"
                style={{ width }}
              />
            ))}
          </div>
          <div className="mt-5 h-5 w-1/3 animate-pulse rounded-lg bg-gray-200/80" />
          <div className="mt-3 space-y-2.5">
            {['96%', '100%', '70%', '88%'].map((width, index) => (
              <div
                key={index}
                className="h-3.5 animate-pulse rounded-full bg-gray-200/60"
                style={{ width }}
              />
            ))}
          </div>
        </div>

        <p className="m-0 flex items-center justify-center gap-1.5 py-1 text-[12px] font-semibold text-[var(--text-muted)]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--accent)]/25 border-t-[var(--accent)]" />
          {t('knowledge.loadingArticle')}
        </p>
      </div>
    )
  }

  if (articleQuery.isError || !article) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-2 rounded-2xl bg-[var(--surface)] p-8 text-center shadow-sm">
        <Icon icon="mdi:file-remove-outline" width={40} className="text-gray-300" />
        <p className="m-0 text-sm text-gray-500">{t('knowledge.articleMissing')}</p>
        <button
          type="button"
          onClick={() => navigate('/knowledge')}
          className="mt-1 cursor-pointer rounded-xl border-0 bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white active:scale-95"
        >
          {t('knowledge.toArticles')}
        </button>
      </div>
    )
  }

  const updatedAt = formatDate(article.updatedAt)

  return (
    <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-col gap-3">
      {/* Хлебные крошки: на телефоне это единственный способ понять, где ты
          находишься в дереве, — постоянной панели с деревом здесь нет. */}
      {treeLoading ? (
        <div className="h-4 w-2/5 animate-pulse rounded-full bg-gray-200/70" />
      ) : ancestors.length > 0 ? (
        <div className="scrollbar-hide -mx-4 flex items-center gap-1 overflow-x-auto px-4">
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => openArticle(ancestor.id)}
                // Заголовок не усекаем: обрезанная крошка «Udevs Система → …»
                // ничего не сообщает о том, куда она ведёт. Длинный путь вместо
                // этого листается вбок вместе со всей полосой.
                className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border-0 bg-transparent px-1 py-0.5 text-[12px] font-semibold text-[var(--text-muted)] active:bg-gray-100"
              >
                <span className="text-[13px] leading-none">{ancestor.icon}</span>
                <span>{ancestor.title}</span>
              </button>
              <Icon icon="mdi:chevron-right" width={13} className="shrink-0 text-gray-300" />
            </span>
          ))}
        </div>
      ) : null}

      <header className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
        <p className="m-0 text-[34px] leading-none">{article.icon}</p>
        <h1 className="m-0 mt-2 text-[22px] font-extrabold leading-snug text-[var(--text-main)]">
          {article.title}
        </h1>
        {updatedAt ? (
          <p className="m-0 mt-1.5 flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
            <Icon icon="mdi:clock-outline" width={13} />
            {t('knowledge.updatedAt', { date: updatedAt })}
          </p>
        ) : null}
      </header>

      <article className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
        <ArticleContent
          blocks={article.content}
          onOpenArticle={openArticle}
          resolveArticle={(targetId) => byId.get(targetId)}
        />
      </article>

      {treeLoading ? (
        <section className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
          <div className="mb-3 h-3 w-24 animate-pulse rounded-full bg-gray-200/70" />
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        </section>
      ) : children.length > 0 ? (
        <section className="rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
          <h2 className="m-0 mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {t('knowledge.children', { count: children.length })}
          </h2>
          <div className="space-y-2">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => openArticle(child.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-gray-100 p-3 text-left transition active:scale-[0.99]"
              >
                <span className="shrink-0 text-[18px] leading-none">{child.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-main)]">
                  {child.title}
                </span>
                <Icon icon="mdi:chevron-right" width={18} className="shrink-0 text-gray-300" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
