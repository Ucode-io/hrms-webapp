import adminRequest from './adminRequest'
import { asLang, asLangs, type Lang } from '../i18n'

/**
 * Регион сотрудника: часы и язык места, где он работает.
 *
 * Пояс считает hickvision (`resolve_time_zones`, ADR-0014 п. 3): филиал на
 * дату → регион филиала → пояс компании → Asia/Tashkent. Тем же методом
 * админка пересчитывает отметки на экран, поэтому своей цепочки здесь нет:
 * карточка, отставшая от записи о работе, штамповала бы в одном поясе, а
 * админка пересчитывала бы из другого.
 *
 * Язык и набор языков читаются у региона по `regions_id` из ответа, а без
 * региона — язык компании (ADR-0006).
 */

/** Последний запасной циферблат: ровно им штамповались все отметки до регионов. */
export const DEFAULT_TIME_ZONE = 'Asia/Tashkent'

export interface EmployeeRegion {
  /** IANA-имя. Настенные часы сотрудника — ADR-0005. */
  timezone: string
  /** Язык региона: предположение о месте, последнее звено цепочки выбора. */
  language: Lang | null
  /**
   * Языки, из которых сотрудник выбирает интерфейс. Пустой список — «выбирай
   * любой»: так же, как у сотрудника без региона, и так же у региона, где поле
   * не заполняли (`pickLang.ts`).
   */
  languages: Lang[]
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
 * IANA-имя, которое понимает `Intl` этого браузера. Сервер проверил имя своим
 * `Intl`, но справочники у Node и старого WebView не обязаны совпадать, а
 * незнакомое имя роняет `Intl` прямо на рендере (ADR-0005 п.2).
 */
const readTimeZone = (value: unknown): string => {
  const timezone = readString(value)
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

/** Пояс сотрудника на дату — то, чем штампуется отметка. */
export interface EmployeeTimeZone {
  timezone: string
  /** Регион, давший пояс; пусто — пояс компании или запасной. */
  regionId: string
}

/**
 * Пояс сотрудника на дату `today` — один вызов метода, без запросов за языком:
 * отметка ждёт только его (`CheckInActions`).
 *
 * Отказ метода, ответ без сотрудника и пояс, которого не знает `Intl`
 * устройства, — исключение, и отметка заблокирована: штамп по запасному
 * циферблату необратим (ADR-0005), а любой свой фолбэк разошёлся бы с тем,
 * из чего пересчитывает админка. Компанию метод не фильтрует, так что без
 * сотрудника ответ бывает только на несуществующий guid.
 *
 * ponytail: `today` — по устройству: пояса, чтобы спросить дату по нему, ещё
 * нет. Разойтись это может только в день перевода между поясами и только
 * около полуночи; `AuthContext` меняет дату в ключе, как только она сменилась.
 */
export async function getEmployeeTimeZone(userBaseId: string, today: string): Promise<EmployeeTimeZone> {
  const res = await adminRequest.post('/v2/invoke_function/udevs-hrms-hickvision', {
    data: {
      method: 'resolve_time_zones',
      data: { user_base_ids: [userBaseId], date_from: today, date_to: today },
    },
  })

  const payload = toRecord(res) ?? {}
  const zones = toRecord(toRecord(payload.result ?? payload)?.time_zones)
  if (!zones) throw new Error('Unexpected response format for resolve_time_zones')

  const interval = toRecord((zones[userBaseId] as unknown[] | undefined)?.[0])
  if (!interval) throw new Error('Employee is missing from resolve_time_zones')

  const timezone = readTimeZone(interval.timezone)
  if (!timezone) throw new Error(`Device does not know time zone "${readString(interval.timezone)}"`)

  return { timezone, regionId: readString(interval.regions_id) }
}

/**
 * Язык и набор языков: у региона, давшего пояс, а без него — язык компании
 * (ADR-0006). Отдельно от пояса: язык — догадка, и медленный GET за ним не
 * должен держать отметку.
 */
export async function getRegionLanguage(
  regionId: string,
  companiesId: string,
): Promise<Pick<EmployeeRegion, 'language' | 'languages'>> {
  if (regionId) {
    const region = await getItem('regions', regionId)
    return { language: readLanguage(region), languages: asLangs(region?.languages) }
  }

  // У компании набора нет: языки — свойство региона, а без региона
  // ограничения не существует.
  const company = await getItem('companies', companiesId)
  return { language: readLanguage(company), languages: [] }
}
