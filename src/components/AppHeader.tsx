import { useCompany } from '../context/CompanyContext'
import { useNavigate } from 'react-router-dom'
import { useAuth, getDisplayName, getInitials } from '../context/AuthContext'
import { BellIcon } from './Icons'

export function AppHeader() {
  const { company } = useCompany()
  const { profile, newsFeed } = useAuth()
  const navigate = useNavigate()
  const notificationCount = Math.min(newsFeed.length, 9)
  const displayName = getDisplayName(profile)
  const avatar =
    (typeof profile?.photo === 'string' && profile.photo.trim()) ||
    (typeof profile?.avatar === 'string' && profile.avatar.trim()) || ''

  return (
    <header className="shrink-0 sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/60 bg-white/85 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          aria-hidden="true"
          className="w-10 h-10 shrink-0 rounded-xl bg-[var(--accent-light)] border border-[var(--accent-soft)] flex items-center justify-center overflow-hidden font-extrabold text-[13px] text-[var(--accent)]"
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
          <p className="m-0 mt-0.5 text-[11px] font-medium text-[var(--text-muted)] leading-tight">
            Employee Portal
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-label="Уведомления"
          className="relative w-10 h-10 rounded-xl bg-[var(--accent-light)] text-[var(--accent)] flex items-center justify-center border-0 cursor-pointer transition-transform active:scale-95"
        >
          <BellIcon size={20} />
          {notificationCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 text-[10px] font-bold leading-[17px] text-center rounded-full bg-red-500 text-white shadow-[0_0_0_2px_white]">
              {notificationCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="w-10 h-10 rounded-full border-0 flex items-center justify-center overflow-hidden font-extrabold text-sm text-white cursor-pointer transition-transform active:scale-95 shadow-md"
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
