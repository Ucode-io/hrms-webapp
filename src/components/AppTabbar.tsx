import { useNavigate, useLocation } from 'react-router-dom'
import {
  HomeIcon, CalendarOffIcon, ClockIcon, WalletIcon, EllipsisIcon,
} from './Icons'

const tabs = [
  { path: '/home',    label: 'Главная',  Icon: HomeIcon },
  { path: '/absence', label: 'Отпуск',   Icon: CalendarOffIcon },
  { path: '/time',    label: 'Время',    Icon: ClockIcon },
  { path: '/payroll', label: 'Зарплата', Icon: WalletIcon },
  { path: '/more',    label: 'Ещё',      Icon: EllipsisIcon },
]

export function AppTabbar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--line)]/60 bg-white/90 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch">
        {tabs.map(({ path, label, Icon }) => {
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
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
