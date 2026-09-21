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
 * Выбор сотрудника → `language_code` из Telegram → язык региона → русский
 * (ADR-0006).
 *
 * Порядок не случайный: регион знает про место, Telegram — про человека, а
 * русскоязычный программист в китайском филиале это случай, где прав Telegram.
 * Поэтому язык региона — предположение последней очереди: он отвечает, только
 * когда про самого человека не известно ничего применимого. Неподдерживаемое
 * значение в любом звене равносильно молчанию — очередь переходит дальше, а не
 * обрывается в русский.
 */
export function pickLang(sources: {
  stored?: unknown
  telegram?: unknown
  region?: unknown
}): Lang {
  return (
    asLang(sources.stored)
    ?? asLang(sources.telegram)
    ?? asLang(sources.region)
    ?? FALLBACK_LANG
  )
}
