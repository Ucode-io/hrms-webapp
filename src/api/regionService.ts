import adminRequest from './adminRequest'
import { asLang, type Lang } from '../i18n'

/**
 * Регион сотрудника: часы и язык места, где он работает.
 *
 * Регион висит на филиале, а не на человеке (ADR-0006), поэтому цепочка идёт
 * `user_base → locations_id → regions_id`. Развернуть её одним запросом
 * нельзя: `with_relations` разворачивает ровно один уровень, второй прыжок —
 * отдельный GET.
 *
 * Филиала у сотрудника может не быть — он не обязателен, и в проде пустых
 * `locations_id` больше половины. Такой человек судится по часам компании
 * (known-gaps.md §3); её `timezone` миграция уже перевела в IANA.
 */

/** Последний запасной циферблат: ровно им штамповались все отметки до регионов. */
export const DEFAULT_TIME_ZONE = 'Asia/Tashkent'

export interface EmployeeRegion {
  /** IANA-имя. Настенные часы сотрудника — ADR-0005. */
  timezone: string
  /** Язык региона: предположение о месте, последнее звено цепочки выбора. */
  language: Lang | null
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** Одна запись из `/v2/items/<table>/<guid>`: ucode заворачивает её по-разному. */
const unwrapItem = (raw: unknown): Record<string, unknown> | null => {
  const root = toRecord(raw)
  if (!root) return null
  return (
    toRecord(root.response)
    ?? toRecord(toRecord(root.data)?.response)
    ?? toRecord(root.data)
    ?? root
  )
}

const readString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

/**
 * Часовой пояс одной строкой.
 *
 * У `regions.timezone` тип SINGLE_LINE, а у `companies.timezone` — массив:
 * «одна зона» списком не выражается, но колонку компании не трогали. Берём
 * первый элемент — ровно его и брал бы `Intl.DateTimeFormat`.
 *
 * Колонка свободная: в неё через ucode можно завести что угодно, а не-IANA имя
 * роняет `Intl` прямо на рендере (ADR-0005 п.2). Поэтому здесь же и проверяем —
 * мусор становится пустой строкой, и дальше отрабатывает цепочка фолбэков.
 */
const readTimeZone = (value: unknown): string => {
  const timezone = Array.isArray(value) ? readString(value[0]) : readString(value)
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: timezone })
    return timezone
  } catch {
    return ''
  }
}

/** Язык связанной строки `languages`: в её слаге лежит код языка (`ru`/`az`/`zh`). */
const readLanguage = (row: Record<string, unknown> | null): Lang | null =>
  asLang(toRecord(row?.languages_id_data)?.slug)

const getItem = async (table: string, guid: string) => {
  if (!guid) return null
  const res = await adminRequest.get(`/v2/items/${table}/${guid}`, {
    params: { with_relations: true },
  })
  return unwrapItem(res)
}

/**
 * Часы и язык для профиля. Сетевых запросов максимум два, и оба — точечные
 * GET-ы по guid: филиал уже развёрнут в самом профиле.
 */
export async function getEmployeeRegion(
  profile: Record<string, unknown> | null | undefined,
): Promise<EmployeeRegion> {
  const branch = toRecord(profile?.locations_id_data)
  const regionId = readString(branch?.regions_id)

  if (regionId) {
    const region = await getItem('regions', regionId)
    const timezone = readTimeZone(region?.timezone)
    if (timezone) return { timezone, language: readLanguage(region) }
  }

  const companiesId = readString(profile?.companies_id)
  if (companiesId) {
    const company = await getItem('companies', companiesId)
    const timezone = readTimeZone(company?.timezone)
    if (timezone) return { timezone, language: readLanguage(company) }
  }

  return { timezone: DEFAULT_TIME_ZONE, language: null }
}
