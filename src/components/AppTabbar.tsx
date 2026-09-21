import { useNavigate, useLocation } from 'react-router-dom'
import {
  HomeIcon, ClockIcon, WalletIcon, EllipsisIcon,
} from './Icons'
import { useT } from '../i18n'

const tabs = [
  { path: '/home',    key: 'tab.home' as const,    Icon: HomeIcon },
  { path: '/time',    key: 'tab.time' as const,    Icon: ClockIcon },
  { path: '/payroll', key: 'tab.payroll' as const, Icon: WalletIcon },
  { path: '/more',    key: 'tab.more' as const,    Icon: EllipsisIcon },
]

export function AppTabbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const t = useT()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--line)]/60 bg-[var(--surface)]/90 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch">
        {tabs.map(({ path, key, Icon }) => {
          const isActive = pathname === path || (pathname === '/' && path === '/home')
          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 border-0 bg-transparent cursor-pointer
                transition-all duration-200 active:scale-[0.85] active:opacity-70
                ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
              `}
            >
              <Icon size={22} className={isActive ? 'opacity-100' : 'opacity-60'} />
              <span className={`text-[10px] leading-tight font-semibold ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {t(key)}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
