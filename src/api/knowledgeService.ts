import { tr } from '../i18n'
import adminRequest from './adminRequest'

/**
 * База знаний — read-only.
 *
 * Модуль в hrms-front устроен как одно дерево статей (Notion-подобное): у каждой
 * статьи может быть родитель, тело хранится документом BlockNote. Мобильное
 * приложение только читает: список статей приходит методом шлюза (без тела —
 * оно может быть большим), тело — отдельным запросом items API по guid.
 */

const REPORTS_FUNCTION_PATH = '/v2/invoke_function/udevs-hrms-reports'
const ARTICLES_SLUG = 'knowledge_base_articles'
const LIST_METHOD = 'get_knowledge_base_articles'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')

/* ── Блоки BlockNote ───────────────────────────────────────────────────────
   Тело статьи — массив блоков редактора. Типы описаны ровно настолько, чтобы
   их отрисовать: редактора на мобилке нет, и полная схема здесь не нужна. */

export interface KbTextStyles {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  code?: boolean
  textColor?: string
  backgroundColor?: string
}

export interface KbInlineText {
  type: 'text'
  text: string
  styles?: KbTextStyles
}

export interface KbInlineLink {
  type: 'link'
  href: string
  content: KbInlineText[]
}

export type KbInline = KbInlineText | KbInlineLink

export interface KbBlock {
  id?: string
  type: string
  props?: Record<string, unknown>
  content?: KbInline[] | unknown
  children?: KbBlock[]
}

export interface KbArticleSummary {
  id: string
  parentArticleId: string | null
  title: string
  icon: string
  updatedAt: string
}

export interface KbArticle extends KbArticleSummary {
  content: KbBlock[]
  createdAt: string
}

export interface KbArticleNode extends KbArticleSummary {
  children: KbArticleNode[]
}

/**
 * Тело статьи в u-code лежит в varchar-колонке, поэтому приходит строкой с
 * JSON. Старые записи могли сохраниться уже массивом — принимаем оба варианта,
 * как это делает web-версия.
 */
const parseContent = (value: unknown): KbBlock[] => {
  if (Array.isArray(value)) return value as KbBlock[]
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed as KbBlock[]
    } catch {
      // Битое тело — показываем статью пустой, а не роняем экран.
    }
  }
  return []
}

/** Список отдаёт родителя как `parent_id`, items API — как саму колонку связи. */
const rowParentId = (row: Record<string, unknown>): string | null =>
  asString(row.parent_id) || asString(row.knowledge_base_articles_id) || null

const mapSummary = (row: Record<string, unknown>): KbArticleSummary => ({
  id: asString(row.guid),
  parentArticleId: rowParentId(row),
  title: asString(row.title) || tr('fallback.noArticleTitle'),
  icon: asString(row.icon) || '📄',
  updatedAt: asString(row.updated_at) || asString(row.created_at) || '',
})

/**
 * Шлюз заворачивает результат метода по-разному в зависимости от версии: то в
 * `result`, то в `data`, то отдаёт конверт как есть. Ищем строки статей на
 * любом из уровней, а не полагаемся на одну форму ответа.
 */
const extractRows = (raw: unknown, depth = 0): Record<string, unknown>[] => {
  if (Array.isArray(raw)) return raw.filter(isRecord)
  if (!isRecord(raw) || depth > 5) return []
  if (Array.isArray(raw.response)) return raw.response.filter(isRecord)
  for (const key of ['result', 'data', 'response'] as const) {
    const nested = extractRows(raw[key], depth + 1)
    if (nested.length > 0) return nested
  }
  return []
}

export const knowledgeService = {
  /** Плоский список статей компании; дерево собирается на клиенте. */
  listArticles: async (): Promise<KbArticleSummary[]> => {
    const raw = await adminRequest.post(REPORTS_FUNCTION_PATH, {
      data: { method: LIST_METHOD, data: {} },
    })

    // Ошибку метода шлюз отдаёт обычным 200 с `server_error` внутри: без явной
    // проверки экран показал бы «Статей нет» вместо сообщения о сбое.
    if (isRecord(raw) && typeof raw.server_error === 'string' && raw.server_error) {
      throw new Error(raw.server_error)
    }

    return extractRows(raw)
      .map(mapSummary)
      .filter((article) => Boolean(article.id))
  },

  /** Тело статьи. В списке его нет — он намеренно лёгкий. */
  getArticle: async (guid: string): Promise<KbArticle | null> => {
    if (!guid) return null
    const raw = await adminRequest.get(`/v2/items/${ARTICLES_SLUG}/${guid}`)
    const row = isRecord(raw) && isRecord(raw.response) ? raw.response : raw
    if (!isRecord(row) || !asString(row.guid)) return null
    return {
      ...mapSummary(row),
      content: parseContent(row.content),
      createdAt: asString(row.created_at),
    }
  },
}

/* ── Работа с деревом ──────────────────────────────────────────────────── */

export const buildArticleTree = (
  articles: KbArticleSummary[],
  parentId: string | null = null,
): KbArticleNode[] =>
  articles
    .filter((article) => article.parentArticleId === parentId)
    .map((article) => ({ ...article, children: buildArticleTree(articles, article.id) }))

/** Цепочка предков (корень → … → статья) — для хлебных крошек. */
export const articleAncestors = (
  articles: KbArticleSummary[],
  articleId: string,
): KbArticleSummary[] => {
  const byId = new Map(articles.map((article) => [article.id, article]))
  const chain: KbArticleSummary[] = []
  const seen = new Set<string>()
  let current = byId.get(articleId)
  // `seen` — защита от кольца в данных: без неё битая связь «родитель сам себе
  // предок» повесила бы экран статьи намертво.
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentArticleId ? byId.get(current.parentArticleId) : undefined
  }
  return chain
}

export const articleChildren = (
  articles: KbArticleSummary[],
  articleId: string,
): KbArticleSummary[] => articles.filter((article) => article.parentArticleId === articleId)
