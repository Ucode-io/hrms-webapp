import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ru } from './ru'
import { uz } from './uz'
import { en } from './en'

// ponytail: свой словарь вместо i18next — нужен ровно `t()` и переключатель,
// а не backend-плагины, namespace-loader и детектор языка на 40 КБ.
export type Lang = 'ru' | 'en' | 'uz'
export type TKey = keyof typeof ru

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'uz', label: "O'zbekcha" },
]

// Ключ тот же, что писала страница «Язык и тема» до перевода, — у тех, кто уже
// выбрал язык, выбор переживёт обновление.
export const LANGUAGE_STORAGE_KEY = 'interface_language'

// Русский — эталон: uz/en заполняются под него, недостающий ключ падает в ru,
// а не в пустоту. Partial намеренно: незаконченный перевод не должен ломать сборку.
const DICTS: Record<Lang, Partial<Record<TKey, string>>> = { ru, uz, en }

/** Локаль для Intl: даты и числа должны ехать за языком интерфейса. */
export function localeOf(lang: Lang): string {
  return lang === 'en' ? 'en-US' : lang === 'uz' ? 'uz-UZ' : 'ru-RU'
}

/**
 * Узбекские названия — списком, а не через Intl.
 *
 * В вебвью Telegram (и в части Android-прошивок) локали `uz` просто нет, и
 * Intl молча отдаёт английские «March / Monday» — календарь оказывался на
 * английском при выбранном узбекском. Для ru/en Intl остаётся: эти локали
 * есть везде.
 */
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]
const UZ_MONTHS_SHORT = [
  'yan', 'fev', 'mar', 'apr', 'may', 'iyn',
  'iyl', 'avg', 'sen', 'okt', 'noy', 'dek',
]
// С понедельника — как расставлены сетки календарей в приложении.
const UZ_WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']
const UZ_WEEKDAYS_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

export function monthNames(lang: Lang): string[] {
  if (lang === 'uz') return UZ_MONTHS
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { month: 'long' })
  return Array.from({ length: 12 }, (_, m) => capitalize(fmt.format(new Date(2021, m, 1))))
}

export function weekdayNames(lang: Lang, style: 'short' | 'long' = 'short'): string[] {
  if (lang === 'uz') return style === 'long' ? UZ_WEEKDAYS : UZ_WEEKDAYS_SHORT
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: style })
  // 2021-03-01 — понедельник.
  return Array.from({ length: 7 }, (_, i) =>
    capitalize(fmt.format(new Date(2021, 2, 1 + i)).replace('.', '')))
}

type DateOpts = Intl.DateTimeFormatOptions

/**
 * Единая точка форматирования дат: ru/en уходят в Intl, uz собирается из
 * списков выше. Все экраны зовут её вместо `toLocaleDateString` — иначе
 * достаточно одного забытого `'ru-RU'`, чтобы дата осталась непереведённой.
 */
export function formatDateLocal(value: Date, opts: DateOpts, lang: Lang = currentLang): string {
  if (lang !== 'uz') return value.toLocaleDateString(localeOf(lang), opts)

  const pad = (n: number) => String(n).padStart(2, '0')
  const parts: string[] = []

  if (opts.weekday) {
    const weekday = weekdayNames('uz', opts.weekday === 'long' ? 'long' : 'short')[(value.getDay() + 6) % 7]
    parts.push(opts.day || opts.month || opts.year ? `${weekday},` : weekday)
  }
  if (opts.day) parts.push(opts.day === '2-digit' ? pad(value.getDate()) : String(value.getDate()))
  if (opts.month === 'numeric' || opts.month === '2-digit') {
    // Числовая дата — одним куском `dd.mm.yyyy`, как её пишут в Узбекистане.
    const numeric = [pad(value.getMonth() + 1), opts.year ? String(value.getFullYear()) : '']
      .filter(Boolean)
    return [opts.day ? pad(value.getDate()) : '', ...numeric].filter(Boolean).join('.')
  }
  if (opts.month) parts.push((opts.month === 'short' ? UZ_MONTHS_SHORT : UZ_MONTHS)[value.getMonth()])
  if (opts.year) parts.push(String(value.getFullYear()))

  return parts.join(' ')
}

/** Дата со временем: `дата, чч:мм` — то же правило про uz, что и выше. */
export function formatDateTimeLocal(value: Date, opts: DateOpts, lang: Lang = currentLang): string {
  if (lang !== 'uz') return value.toLocaleString(localeOf(lang), opts)
  const { hour: _h, minute: _m, second: _s, ...dateOpts } = opts
  return `${formatDateLocal(value, dateOpts, lang)}, ${formatTimeLocal(value, lang)}`
}

/** Время `чч:мм`: у Intl тут ломаться нечему, но точка входа одна. */
export function formatTimeLocal(value: Date, lang: Lang = currentLang): string {
  return value.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Числа: разделитель разрядов у ru и uz одинаковый, en отличается. */
export function formatNumberLocal(value: number, opts?: Intl.NumberFormatOptions, lang: Lang = currentLang): string {
  return new Intl.NumberFormat(lang === 'uz' ? 'ru-RU' : localeOf(lang), opts).format(value)
}

export function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'ru' || stored === 'en' || stored === 'uz') return stored
  } catch {}
  return 'ru'
}

export type Vars = Record<string, string | number>

// Язык вне React: сервисы и утилиты (ярлыки статусов, форматирование сумм)
// зовут `tr()` прямо в рендере, и провайдер держит эту переменную в согласии
// со своим состоянием. Отдельного подписчика не нужно: смена языка
// перерисовывает всё дерево, а значит и каждый такой вызов.
let currentLang: Lang = 'ru'

export function getLang(): Lang {
  return currentLang
}

/** `t()` для не-React кода. В компонентах используйте useT — он реактивен. */
export function tr(key: TKey, vars?: Vars): string {
  return translate(currentLang, key, vars)
}

export function translate(lang: Lang, key: TKey, vars?: Vars): string {
  const text = DICTS[lang][key] ?? ru[key] ?? String(key)
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match)
}

type Ctx = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TKey, vars?: Vars) => string
}

const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    currentLang = loadLang()
    return currentLang
  })

  const value = useMemo<Ctx>(() => ({
    lang,
    setLang: (next) => {
      currentLang = next
      setLangState(next)
      try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch {}
      document.documentElement.lang = next
    },
    t: (key, vars) => translate(lang, key, vars),
  }), [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n вне I18nProvider')
  return ctx
}

/** Короткая форма для файлов, которым нужен только перевод. */
export function useT() {
  return useI18n().t
}
