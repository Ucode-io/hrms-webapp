import { useCompany } from '../context/CompanyContext'
import { useNavigate } from 'react-router-dom'
import { useAuth, getDisplayName, getInitials } from '../context/AuthContext'
import { Icon } from '@iconify/react'
import { BellIcon } from './Icons'
import { useT } from '../i18n'

export function AppHeader() {
  const { company } = useCompany()
  const { profile, newsFeed } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const notificationCount = Math.min(newsFeed.length, 9)
  const displayName = getDisplayName(profile)
  const avatar =
    (typeof profile?.photo === 'string' && profile.photo.trim()) ||
    (typeof profile?.avatar === 'string' && profile.avatar.trim()) || ''

  return (
    <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--line)] bg-[var(--surface)]/85 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          aria-hidden="true"
          className="w-10 h-10 shrink-0 rounded-2xl bg-[var(--accent-light)] border border-[var(--accent-soft)] flex items-center justify-center overflow-hidden font-extrabold text-[13px] text-[var(--accent)]"
        >
          {company.logo ? (
            <img src={company.logo} alt={company.name} className="w-full h-full object-contain" />
          ) : (
            <span>{company.name.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="m-0 text-base font-extrabold text-[var(--text-main)] leading-tight tracking-tight truncate">
            {company.name}
          </p>
          <p className="m-0 text-[11px] font-medium text-[var(--text-muted)] leading-tight truncate">
            {t('header.portal')}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* AI-помощник живёт здесь, а не плавающей кнопкой над таббаром —
            та перекрывала «+» на половине страниц. */}
        <button
          type="button"
          onClick={() => navigate('/news')}
          aria-label={t('header.news')}
          className="relative flex items-center justify-center w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-main)] cursor-pointer transition-transform active:scale-95"
        >
          <BellIcon size={17} />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1.5 min-w-[15px] h-[15px] px-1 text-[9px] font-bold leading-[15px] text-center rounded-full bg-red-500 text-white shadow-[0_0_0_2px_var(--surface)]">
              {notificationCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/copilot')}
          aria-label={t('header.copilot')}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-main)] cursor-pointer transition-transform active:scale-95"
        >
          <Icon icon="mdi:auto-awesome" width={17} className="text-[var(--text-main)]" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-2xl border-0 flex items-center justify-center overflow-hidden font-extrabold text-sm text-white cursor-pointer transition-transform active:scale-95 shadow-md"
          style={{ background: `linear-gradient(135deg, var(--gradient-start), var(--gradient-end))` }}
        >
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span>{getInitials(profile)}</span>
          )}
        </button>
      </div>
    </header>
  )
}
