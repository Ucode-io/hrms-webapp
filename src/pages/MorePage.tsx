import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { LogOutIcon } from '../components/Icons'

interface ServiceCard {
  label: string
  desc: string
  icon: string
  onClick?: () => void
}

export function MorePage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { company } = useCompany()
  const [searchValue, setSearchValue] = useState('')

  const services: ServiceCard[] = [
    {
      label: 'Профиль',
      desc: 'Личные данные и контакты',
      icon: 'mdi:account-outline',
      onClick: () => navigate('/profile'),
    },
    {
      label: 'Спорт',
      desc: 'Посещение спорта',
      icon: 'mdi:dumbbell',
      onClick: () => navigate('/sport'),
    },
    {
      label: 'Орг структура',
      desc: 'Отделы и сотрудники',
      icon: 'mdi:office-building-outline',
      onClick: () => navigate('/org-structure'),
    },
  ]

  const normalizedSearch = searchValue.trim().toLowerCase()
  const filteredServices = useMemo(
    () => services.filter((item) => {
      if (!normalizedSearch) return true
      const haystack = `${item.label} ${item.desc}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    }),
    [normalizedSearch, services],
  )

  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-3.5">
        <div className="relative">
          <Icon icon="mdi:magnify" width={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Название модуля"
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--app-bg)] pl-9 pr-3 text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </section>

      {filteredServices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white px-4 py-10 text-center text-sm text-[var(--text-muted)]">
          Модули не найдены
        </div>
      ) : (
        <section className="grid grid-cols-3 gap-2">
          {filteredServices.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="rounded-2xl border border-[var(--line)] bg-white min-h-[144px] p-3 text-left cursor-pointer transition-transform active:scale-[0.98]"
            >
              <div
                className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-white shadow-sm"
                style={{ background: `linear-gradient(145deg, ${company.mainColor}, ${company.mainColor}CC)` }}
              >
                <Icon icon={item.icon} width={24} />
              </div>
              <p className="m-0 mt-3 text-[13px] font-bold text-[var(--text-main)] leading-tight">
                {item.label}
              </p>
              <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)] leading-tight">
                {item.desc}
              </p>
            </button>
          ))}
        </section>
      )}

      <button
        type="button"
        onClick={logout}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white text-left cursor-pointer transition-colors duration-100 active:bg-gray-50"
      >
        <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-red-50 text-red-500">
          <LogOutIcon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[15px] font-semibold leading-tight text-red-500">
            Выйти из аккаунта
          </p>
          <p className="m-0 mt-0.5 text-xs text-[var(--text-muted)]">Завершить сессию</p>
        </div>
      </button>
    </div>
  )
}
