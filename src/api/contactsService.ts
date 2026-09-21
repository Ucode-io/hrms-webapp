import { tr } from '../i18n'
// Справочник коллег — только чтение.
//
// Источник тот же, что у списка сотрудников в админке: коллекция `user_base`,
// живые (`status: ['active']`), связи развёрнуты ради должности и отдела.
// Фильтра по компании здесь нет намеренно — его подставляет интерцептор
// `adminRequest`, и это же не даёт мини-аппу увидеть чужую компанию.
//
// `role_id` из админки (VITE_EMPLOYEE_ROLE_ID) не переносим: там он нужен,
// чтобы отделить сотрудников от кандидатов и клиентов в общей таблице, а в
// мини-аппе выборка и так сужена компанией, и переменной этой в проекте нет.

import adminRequest from './adminRequest'

export interface ContactItem {
  guid: string
  first_name?: string | null
  second_name?: string | null
  middle_name?: string | null
  phone?: string | null
  work_phone?: string | null
  email?: string | null
  personal_email?: string | null
  photo?: string | null
  positions_id_data?: { title?: string } | null
  departments_id_data?: { title?: string } | null
  locations_id_data?: { title?: string } | null
}

/**
 * Потолок выборки.
 *
 * ponytail: одна страница на 500 человек и поиск на клиенте — мгновенный, без
 * дебаунса и без запроса на каждую букву. Упрётся в потолок (компания больше
 * 500) — переключить на серверный `search`, он у ucode есть и в админке уже
 * используется (`employee.service.ts:fetchEmployeesList`).
 */
const LIST_LIMIT = 500

function encodeData(data: Record<string, unknown>): string {
  return encodeURIComponent(JSON.stringify(data))
}

function extractList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[]
  const obj = res && typeof res === 'object' ? (res as Record<string, unknown>) : {}
  if (Array.isArray(obj.response)) return obj.response as T[]
  if (Array.isArray(obj.data)) return obj.data as T[]
  return []
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** «Фамилия Имя» — как в списке админки; пустое имя падает на прочерк. */
export function contactName(contact: ContactItem): string {
  const full = [contact.second_name, contact.first_name, contact.middle_name]
    .map(text)
    .filter(Boolean)
    .join(' ')
  return full || tr('fallback.noName')
}

export function contactInitials(contact: ContactItem): string {
  const initials = `${text(contact.second_name).charAt(0)}${text(contact.first_name).charAt(0)}`
  return initials.toUpperCase() || 'HR'
}

/** Рабочий телефон важнее личного: справочник коллег, а не записная книжка. */
export function contactPhone(contact: ContactItem): string {
  return text(contact.work_phone) || text(contact.phone)
}

export function contactEmail(contact: ContactItem): string {
  return text(contact.email) || text(contact.personal_email)
}

/** Строка, по которой ищем: имя, должность, отдел и телефон разом. */
export function contactHaystack(contact: ContactItem): string {
  return [
    contactName(contact),
    text(contact.positions_id_data?.title),
    text(contact.departments_id_data?.title),
    contactPhone(contact),
    contactEmail(contact),
  ]
    .join(' ')
    .toLowerCase()
}

const contactsService = {
  getAll: async (): Promise<ContactItem[]> => {
    const res = await adminRequest.get('/v2/items/user_base', {
      params: {
        with_relations: true,
        data: encodeData({ status: ['active'], limit: LIST_LIMIT, offset: 0 }),
      },
    })

    return extractList<ContactItem>(res).sort((a, b) =>
      contactName(a).localeCompare(contactName(b), 'ru'),
    )
  },
}

export default contactsService
