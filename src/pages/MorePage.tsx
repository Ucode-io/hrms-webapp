import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { ChevronRightIcon, SettingsIcon, InfoIcon, LogOutIcon } from '../components/Icons'

interface MenuItem {
  label: string
  desc: string
  Icon: React.FC<{ size?: number }>
  iconBg: string
  iconColor: string
  danger?: boolean
  onClick?: () => void
}

export function MorePage() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const items: MenuItem[] = [
    {
      label: 'Профиль',
      desc: 'Личные данные и контакты',
      Icon: ({ size }) => <Icon icon="mdi:account-outline" width={size} />,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      onClick: () => navigate('/profile'),
    },
    {
      label: 'Настройки',
      desc: 'Язык, уведомления',
      Icon: SettingsIcon,
      iconBg: 'bg-[var(--accent-light)]',
      iconColor: 'text-[var(--accent)]',
    },
    {
      label: 'О приложении',
      desc: 'Версия, лицензии',
      Icon: InfoIcon,
      iconBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
    },
    {
      label: 'Выйти из аккаунта',
      desc: 'Завершить сессию',
      Icon: LogOutIcon,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      danger: true,
      onClick: logout,
    },
  ]

  return (
    <div className="animate-fade-in-up flex flex-col gap-0.5 rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--line)]">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className="flex items-center gap-3.5 px-4 py-3.5 bg-white border-0 w-full text-left cursor-pointer transition-colors duration-100 active:bg-gray-50"
        >
          <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${item.iconBg} ${item.iconColor}`}>
            <item.Icon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`m-0 text-[15px] font-semibold leading-tight ${item.danger ? 'text-red-500' : 'text-[var(--text-main)]'}`}>
              {item.label}
            </p>
            <p className="m-0 mt-0.5 text-xs text-[var(--text-muted)]">{item.desc}</p>
          </div>
          <ChevronRightIcon size={18} className="text-[var(--text-muted)] shrink-0" />
        </button>
      ))}
    </div>
  )
}
