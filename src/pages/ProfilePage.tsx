import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useT, type TKey } from '../i18n'
import { useAuth, getDisplayName, getInitials } from '../context/AuthContext'
import { LogoutConfirmDrawer } from '../components/LogoutConfirmDrawer'

function getRelationTitle(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const source = value as Record<string, unknown>
  return typeof source.title === 'string' ? source.title : ''
}

interface MenuItem {
  label: TKey
  icon: string
  tint: string
  fg: string
  to: string
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'page.myData', icon: 'mdi:account-outline', tint: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/profile/my-data' },
  { label: 'page.kiosk', icon: 'mdi:crop-free', tint: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/kiosk-mode' },
  { label: 'page.languageTheme', icon: 'mdi:web', tint: 'rgba(139,92,246,0.14)', fg: '#a78bfa', to: '/language-theme' },
  { label: 'page.tracking', icon: 'mdi:target-variant', tint: 'rgba(217,119,6,0.14)', fg: '#f0b34d', to: '/tracking-settings' },
  { label: 'profile.changePassword', icon: 'mdi:lock-outline', tint: 'rgba(239,68,68,0.14)', fg: '#f87171', to: '/change-password' },
  { label: 'page.privacy', icon: 'mdi:file-document-outline', tint: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/privacy-policy' },
  { label: 'page.support', icon: 'mdi:chat-outline', tint: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/support' },
]

export function ProfilePage() {
  const t = useT()

  const { profile } = useAuth()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const displayName = getDisplayName(profile)
  const position = getRelationTitle(profile?.roles_id_data)
  const avatar =
    (typeof profile?.photo === 'string' && profile.photo.trim()) ||
    (typeof profile?.avatar === 'string' && profile.avatar.trim()) || ''

  return (
    <div className="flex flex-col gap-3 animate-fade-in-up pb-6">
      <section className="flex flex-col items-center gap-3 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-6 py-7">
        <div className="w-20 h-20 rounded-full overflow-hidden border border-[var(--line)] bg-[var(--surface-muted)] flex items-center justify-center text-[var(--text-main)] font-extrabold text-2xl">
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span>{getInitials(profile)}</span>
          )}
        </div>
        <div className="text-center">
          <p className="m-0 text-[17px] font-extrabold text-[var(--text-main)]">{displayName}</p>
          {position && (
            <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">{position}</p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.to}
            type="button"
            onClick={() => navigate(item.to)}
            className="flex items-center gap-3 w-full px-4 py-3.5 border-0 border-b border-[var(--line)] last:border-0 bg-transparent text-left cursor-pointer active:bg-[var(--surface-muted)] transition-colors"
          >
            <div
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
              style={{ background: item.tint, color: item.fg }}
            >
              <Icon icon={item.icon} width={18} />
            </div>
            <span className="flex-1 text-[14px] font-semibold text-[var(--text-main)]">{t(item.label)}</span>
            <Icon icon="mdi:chevron-right" width={18} className="text-[var(--text-muted)]" />
          </button>
        ))}
      </section>

      <button
        type="button"
        onClick={() => setShowLogoutConfirm(true)}
        className="inline-flex items-center justify-center gap-2 h-12 rounded-2xl border border-red-200 bg-[var(--surface)] text-red-600 text-[14px] font-bold cursor-pointer transition-all active:scale-[0.985] active:bg-red-50"
      >
        <Icon icon="mdi:logout" width={16} />
        {t('profile.logout')}
      </button>

      <LogoutConfirmDrawer open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm} />
    </div>
  )
}
