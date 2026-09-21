import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getDisplayName, getInitials } from '../context/AuthContext'
import { BuildingIcon, MapPinIcon, BriefcaseIcon } from './Icons'
import { useT, type TKey } from '../i18n'

function greetingKey(): TKey {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'greeting.morning'
  if (h >= 12 && h < 17) return 'greeting.day'
  if (h >= 17 && h < 22) return 'greeting.evening'
  return 'greeting.night'
}

function getRelationTitle(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const source = value as Record<string, unknown>
  return typeof source.title === 'string' ? source.title : ''
}

export function ProfileBanner({ disableNav = false }: { disableNav?: boolean }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  const displayName = getDisplayName(profile)
  const avatar =
    (typeof profile?.photo === 'string' && profile.photo.trim()) ||
    (typeof profile?.avatar === 'string' && profile.avatar.trim()) || ''

  const highlights = useMemo(() => [
    {
      label: 'banner.department' as TKey,
      value: getRelationTitle(profile?.departments_id_data) ||
        (typeof profile?.departments_id === 'string' ? profile.departments_id : '—'),
      Icon: BuildingIcon,
    },
    {
      label: 'banner.location' as TKey,
      value: getRelationTitle(profile?.locations_id_data) ||
        (typeof profile?.locations_id === 'string' ? profile.locations_id : '—'),
      Icon: MapPinIcon,
    },
    {
      label: 'banner.employment' as TKey,
      value: getRelationTitle(profile?.employment_types_id_data) ||
        (typeof profile?.employment_types_id === 'string' ? profile.employment_types_id : '—'),
      Icon: BriefcaseIcon,
    },
  ], [profile])

  return (
    /* gradient + pseudo-elements defined in index.css .profile-banner */
    <div className="profile-banner animate-fade-in-up">
      {/* Top row */}
      <button 
        type="button" 
        onClick={() => !disableNav && navigate('/profile')}
        className={`relative z-10 flex items-center gap-3.5 w-full text-left bg-transparent border-0 p-0 transition-opacity ${disableNav ? 'cursor-default' : 'cursor-pointer active:opacity-70'}`}
      >
        <div className="w-[60px] h-[60px] shrink-0 rounded-[18px] overflow-hidden bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-extrabold text-xl backdrop-blur-sm">
          {avatar ? (
            <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span>{getInitials(profile)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-white">
          <p className="m-0 text-xs font-medium opacity-80">{t(greetingKey())}</p>
          <h1 className="m-0 mt-0.5 text-xl font-black leading-tight tracking-tight">{displayName}</h1>
          <p className="m-0 mt-0.5 text-xs opacity-75 font-medium">{t('banner.subtitle')}</p>
        </div>
      </button>

      {/* Chips */}
      <div className="relative z-10 mt-3.5 grid grid-cols-3 gap-2">
        {highlights.map((item) => (
          <div
            key={item.label}
            className="rounded-xl bg-white/15 backdrop-blur-sm border border-white/12 p-2"
          >
            <item.Icon size={16} className="opacity-80 mb-1" />
            <span className="block text-[10px] opacity-70 font-medium uppercase tracking-[0.04em]">
              {t(item.label)}
            </span>
            <span className="block mt-0.5 text-[11px] leading-tight font-bold break-words">
              {item.value || '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
