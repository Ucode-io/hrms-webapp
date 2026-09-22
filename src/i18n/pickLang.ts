/**
 * Цепочка выбора языка интерфейса — без React и без браузера, чтобы её можно
 * было прогнать (`pickLang.check.ts` рядом).
 */

export const LANG_CODES = ['ru', 'en', 'uz', 'zh', 'az', 'kk'] as const

export type Lang = (typeof LANG_CODES)[number]

/** Последнее слово цепочки: словарь-эталон, в него откатывается `translate()`. */
export const FALLBACK_LANG: Lang = 'ru'

/**
 * Строка — поддерживаемый язык? Берём первый сегмент: Telegram шлёт и `ru`,
 * и `zh-hans`, а в `languages.slug` лежит голый код.
 */
export function asLang(value: unknown): Lang | null {
  const code = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0]
  return (LANG_CODES as readonly string[]).includes(code) ? (code as Lang) : null
}

/**
 * Языки, из которых сотруднику разрешено выбирать: поле `languages` его
 * региона. Пустой список означает «ограничения нет», а не «нет языков» — так
 * же ведёт себя сотрудник, у которого региона нет вовсе (их в проде
 * большинство, known-gaps §3), и так же выглядит регион, где поле не
 * заполняли. Ограничение включается только там, где его завели руками.
 */
export type AllowedLangs = readonly Lang[]

/** Коды из `regions.languages`: чужое и неподдерживаемое молча отбрасываем. */
export function asLangs(value: unknown): Lang[] {
  if (!Array.isArray(value)) return []
  return value.map(asLang).filter((lang): lang is Lang => lang !== null)
}

/**
 * Выбор сотрудника → `language_code` из Telegram → язык региона → первый из
 * набора → русский (ADR-0006).
 *
 * Порядок не случайный: регион знает про место, Telegram — про человека, а
 * русскоязычный программист в китайском филиале это случай, где прав Telegram.
 * Поэтому язык региона — предположение последней очереди: он отвечает, только
 * когда про самого человека не известно ничего применимого. Неподдерживаемое
 * значение в любом звене равносильно молчанию — очередь переходит дальше, а не
 * обрывается в русский.
 *
 * Набор фильтрует всю цепочку, включая собственный выбор сотрудника: иначе на
 * странице «Язык» он видел бы пять пунктов и интерфейс на шестом, без галочки
 * хоть где-нибудь. Сам выбор при этом из хранилища не вычищается — отозванный
 * язык там безвреден, а если регион снова заговорит на нём, человек получит
 * его назад без единого клика.
 */
export function pickLang(
  sources: {
    stored?: unknown
    telegram?: unknown
    region?: unknown
  },
  allowed: AllowedLangs = [],
): Lang {
  const allow = (value: unknown): Lang | null => {
    const lang = asLang(value)
    if (!lang) return null
    return allowed.length === 0 || allowed.includes(lang) ? lang : null
  }

  return (
    allow(sources.stored)
    ?? allow(sources.telegram)
    ?? allow(sources.region)
    ?? allowed[0]
    ?? FALLBACK_LANG
  )
}
