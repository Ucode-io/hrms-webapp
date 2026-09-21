import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ru } from './ru'
import { uz } from './uz'
import { en } from './en'
import { zh } from './zh'
import { az } from './az'
import { kk } from './kk'
import { asLang, pickLang, type Lang } from './pickLang'

// ponytail: свой словарь вместо i18next — нужен ровно `t()` и переключатель,
// а не backend-плагины, namespace-loader и детектор языка на 40 КБ.
// Список языков и цепочка их выбора живут в `pickLang.ts` — он без React,
// и потому запускаем в проверке.
export { asLang, type Lang }
export type TKey = keyof typeof ru

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'uz', label: "O'zbekcha" },
  { value: 'zh', label: '中文' },
  { value: 'az', label: 'Azərbaycanca' },
  { value: 'kk', label: 'Қазақша' },
]

// Ключ тот же, что писала страница «Язык и тема» до перевода, — у тех, кто уже
// выбрал язык, выбор переживёт обновление.
export const LANGUAGE_STORAGE_KEY = 'interface_language'

// Русский — эталон: uz/en заполняются под него, недостающий ключ падает в ru,
// а не в пустоту. Partial намеренно: незаконченный перевод не должен ломать сборку.
const DICTS: Record<Lang, Partial<Record<TKey, string>>> = { ru, uz, en, zh, az, kk }

const LOCALES: Record<Lang, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  uz: 'uz-UZ',
  zh: 'zh-CN',
  az: 'az-AZ',
  kk: 'kk-KZ',
}

/** Локаль для Intl: даты и числа должны ехать за языком интерфейса. */
export function localeOf(lang: Lang): string {
  return LOCALES[lang] ?? 'ru-RU'
}

/**
 * Названия месяцев и дней — списком, а не через Intl.
 *
 * В вебвью Telegram (и в части Android-прошивок) локалей `uz`, `az`, `kk`
 * просто нет, и Intl молча отдаёт английские «March / Monday» — календарь
 * оказывался на английском при выбранном узбекском. Для ru/en/zh Intl
 * остаётся: эти локали есть везде.
 *
 * Недели — с понедельника, как расставлены сетки календарей в приложении.
 */
type Names = { months: string[]; monthsShort: string[]; weekdays: string[]; weekdaysShort: string[] }

const MANUAL: Partial<Record<Lang, Names>> = {
  uz: {
    months: [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
      'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
    ],
    monthsShort: [
      'yan', 'fev', 'mar', 'apr', 'may', 'iyn',
      'iyl', 'avg', 'sen', 'okt', 'noy', 'dek',
    ],
    weekdays: ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'],
    weekdaysShort: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  },
  az: {
    months: [
      'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
      'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
    ],
    monthsShort: [
      'yan', 'fev', 'mar', 'apr', 'may', 'iyn',
      'iyl', 'avq', 'sen', 'okt', 'noy', 'dek',
    ],
    weekdays: [
      'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə', 'Bazar',
    ],
    weekdaysShort: ['B.e', 'Ç.a', 'Ç', 'C.a', 'C', 'Ş', 'B'],
  },
  kk: {
    months: [
      'Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым',
      'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан',
    ],
    monthsShort: [
      'қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау',
      'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел',
    ],
    weekdays: ['Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі'],
    weekdaysShort: ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс'],
  },
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

export function monthNames(lang: Lang): string[] {
  const manual = MANUAL[lang]
  if (manual) return manual.months
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { month: 'long' })
  return Array.from({ length: 12 }, (_, m) => capitalize(fmt.format(new Date(2021, m, 1))))
}

export function weekdayNames(lang: Lang, style: 'short' | 'long' = 'short'): string[] {
  const manual = MANUAL[lang]
  if (manual) return style === 'long' ? manual.weekdays : manual.weekdaysShort
  const fmt = new Intl.DateTimeFormat(localeOf(lang), { weekday: style })
  // 2021-03-01 — понедельник.
  return Array.from({ length: 7 }, (_, i) =>
    capitalize(fmt.format(new Date(2021, 2, 1 + i)).replace('.', '')))
}

type DateOpts = Intl.DateTimeFormatOptions

/**
 * Единая точка форматирования дат: ru/en/zh уходят в Intl, uz/az/kk собираются
 * из списков выше. Все экраны зовут её вместо `toLocaleDateString` — иначе
 * достаточно одного забытого `'ru-RU'`, чтобы дата осталась непереведённой.
 */
export function formatDateLocal(value: Date, opts: DateOpts, lang: Lang = currentLang): string {
  const manual = MANUAL[lang]
  if (!manual) return value.toLocaleDateString(localeOf(lang), opts)

  const pad = (n: number) => String(n).padStart(2, '0')
  const parts: string[] = []

  if (opts.weekday) {
    const weekday = weekdayNames(lang, opts.weekday === 'long' ? 'long' : 'short')[(value.getDay() + 6) % 7]
    parts.push(opts.day || opts.month || opts.year ? `${weekday},` : weekday)
  }
  if (opts.day) parts.push(opts.day === '2-digit' ? pad(value.getDate()) : String(value.getDate()))
  if (opts.month === 'numeric' || opts.month === '2-digit') {
    // Числовая дата — одним куском `dd.mm.yyyy`, как её пишут в этих странах.
    const numeric = [pad(value.getMonth() + 1), opts.year ? String(value.getFullYear()) : '']
      .filter(Boolean)
    return [opts.day ? pad(value.getDate()) : '', ...numeric].filter(Boolean).join('.')
  }
  if (opts.month) {
    parts.push((opts.month === 'short' ? manual.monthsShort : manual.months)[value.getMonth()])
  }
  if (opts.year) parts.push(String(value.getFullYear()))

  return parts.join(' ')
}

/** Дата со временем: `дата, чч:мм` — то же правило про uz/az/kk, что и выше. */
export function formatDateTimeLocal(value: Date, opts: DateOpts, lang: Lang = currentLang): string {
  if (!MANUAL[lang]) return value.toLocaleString(localeOf(lang), opts)
  const { hour: _h, minute: _m, second: _s, ...dateOpts } = opts
  return `${formatDateLocal(value, dateOpts, lang)}, ${formatTimeLocal(value, lang)}`
}

/** Время `чч:мм`: у Intl тут ломаться нечему, но точка входа одна. */
export function formatTimeLocal(value: Date, lang: Lang = currentLang): string {
  return value.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Числа: у uz/az/kk разделитель разрядов тот же, что у ru — и локали может не быть. */
export function formatNumberLocal(value: number, opts?: Intl.NumberFormatOptions, lang: Lang = currentLang): string {
  return new Intl.NumberFormat(MANUAL[lang] ? 'ru-RU' : localeOf(lang), opts).format(value)
}

/** Выбор сотрудника: пережил перезапуск, потому что лежит в localStorage. */
function storedLang(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Язык клиента Telegram — знание о человеке, а не о месте. */
function telegramLang(): string | undefined {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code
}

/**
 * Язык при старте: первые два звена цепочки. Регион сюда не попадает — он
 * лежит за сетевым запросом, и его подставляет `langWithRegion` после
 * загрузки профиля.
 */
export function loadLang(): Lang {
  return pickLang({ stored: storedLang(), telegram: telegramLang() })
}

/** Та же цепочка, но с последним звеном — языком региона (см. `pickLang`). */
export function langWithRegion(regionLang: Lang | null): Lang {
  return pickLang({ stored: storedLang(), telegram: telegramLang(), region: regionLang })
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
  /**
   * `persist: false` — язык поставлен не человеком (сейчас так приходит язык
   * региона). Выбор сотрудника побеждает регион при каждом старте, поэтому
   * догадка не имеет права записаться в хранилище выбора.
   */
  setLang: (lang: Lang, persist?: boolean) => void
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
    setLang: (next, persist = true) => {
      currentLang = next
      setLangState(next)
      if (persist) {
        try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next) } catch {}
      }
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
