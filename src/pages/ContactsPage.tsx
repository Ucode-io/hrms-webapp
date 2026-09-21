import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useT } from '../i18n'
import contactsService, {
  contactEmail,
  contactHaystack,
  contactInitials,
  contactName,
  contactPhone,
  type ContactItem,
} from '../api/contactsService'

/**
 * Звонок и письмо — обычными ссылками `tel:`/`mailto:`, их и Telegram, и
 * системный браузер отдают нужному приложению сами. Своего диалера тут не надо.
 */
function ContactAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] no-underline transition-transform active:scale-95"
    >
      <Icon icon={icon} width={18} />
    </a>
  )
}

function ContactRow({ contact }: { contact: ContactItem }) {
  const t = useT()

  const name = contactName(contact)
  const phone = contactPhone(contact)
  const email = contactEmail(contact)
  const photo = typeof contact.photo === 'string' ? contact.photo.trim() : ''
  const subtitle = [contact.positions_id_data?.title, contact.departments_id_data?.title]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-muted)] text-[13px] font-extrabold text-[var(--text-main)]">
        {photo ? (
          <img src={photo} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span>{contactInitials(contact)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14px] font-bold text-[var(--text-main)]">{name}</p>
        {subtitle && (
          <p className="m-0 mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{subtitle}</p>
        )}
        {phone && (
          <p className="m-0 mt-0.5 text-[12px] font-semibold text-[var(--text-muted)]">{phone}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {phone && <ContactAction href={`tel:${phone}`} icon="mdi:phone" label={t('contacts.call', { name })} />}
        {email && <ContactAction href={`mailto:${email}`} icon="mdi:email-outline" label={t('contacts.write', { name })} />}
      </div>
    </div>
  )
}

export function ContactsPage() {
  const t = useT()

  const [query, setQuery] = useState('')

  const { data: contacts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts'],
    queryFn: contactsService.getAll,
    staleTime: 10 * 60 * 1000,
  })

  // Индекс строится один раз на выборку, а не на каждый символ поиска.
  const indexed = useMemo(
    () => contacts.map((contact) => ({ contact, haystack: contactHaystack(contact) })),
    [contacts],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return indexed
    return indexed.filter((item) => item.haystack.includes(needle))
  }, [indexed, query])

  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5">
      <div className="relative">
        <Icon
          icon="mdi:magnify"
          width={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('contacts.searchPlaceholder')}
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-2.5 pl-10 pr-3.5 text-[14px] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-[74px] animate-pulse rounded-2xl border border-[var(--line)] bg-[var(--surface)]"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] px-4 py-3">
          <p className="m-0 text-[13px] font-semibold text-[var(--error-text)]">
            {t('contacts.loadFailed')}
          </p>
          <button
            type="button"
            onClick={() => {
              void refetch()
            }}
            className="mt-2 rounded-lg bg-[var(--error-text)] px-2.5 py-1.5 text-[12px] font-bold text-white"
          >
            {t('events.repeat')}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-12 text-center">
          <Icon icon="mdi:account-search-outline" width={44} className="text-[var(--text-muted)] opacity-30" />
          <p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">
            {query.trim() ? t('contacts.notFound') : t('contacts.empty')}
          </p>
        </div>
      ) : (
        <>
          <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            {t('contacts.counter', { shown: visible.length, total: contacts.length })}
          </p>
          <div className="flex flex-col gap-2.5">
            {visible.map(({ contact }) => (
              <ContactRow key={contact.guid} contact={contact} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
