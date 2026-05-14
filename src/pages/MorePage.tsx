import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { useAuth, getDisplayName } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'

interface ServiceCard {
  label: string
  desc: string
  icon: string
  onClick?: () => void
}

export function MorePage() {
  const navigate = useNavigate()
  const { logout, profile } = useAuth()
  const { company } = useCompany()
  const [searchValue, setSearchValue] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const displayName = getDisplayName(profile)

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
    {
      label: 'KPI',
      desc: 'Цели по должности',
      icon: 'mdi:target-arrow',
      onClick: () => navigate('/kpi'),
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
    <div className="animate-fade-in-up flex flex-col gap-3.5 flex-1 min-h-0">
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

      <div className="mt-auto flex flex-col items-center gap-2 pt-6 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-red-200 bg-white text-red-600 text-[13px] font-bold cursor-pointer transition-all active:scale-95 active:bg-red-50"
        >
          <Icon icon="mdi:logout" width={16} />
          Выйти из аккаунта
        </button>
        {displayName ? (
          <p className="m-0 text-[11px] text-[var(--text-muted)]">
            Вы вошли как <span className="font-semibold text-[var(--text-secondary)]">{displayName}</span>
          </p>
        ) : null}
      </div>

      <Drawer.Root open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] outline-none flex flex-col">
            <Drawer.Title className="sr-only">Подтверждение выхода</Drawer.Title>
            <Drawer.Description className="sr-only">
              Подтвердите, что хотите завершить сессию
            </Drawer.Description>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-[4px] bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 inline-flex items-center justify-center mb-3">
                <Icon icon="mdi:logout" width={24} className="text-red-500" />
              </div>
              <p className="m-0 text-center text-[16px] font-extrabold text-[var(--text-main)]">
                Выйти из аккаунта?
              </p>
              <p className="m-0 mt-1 text-center text-[12.5px] text-[var(--text-muted)] leading-relaxed">
                Сессия будет завершена. Для возврата потребуется снова ввести логин и пароль.
              </p>
              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 h-12 rounded-2xl border border-[var(--line)] bg-white text-[14px] font-bold text-[var(--text-secondary)] cursor-pointer active:bg-gray-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoutConfirm(false)
                    logout()
                  }}
                  className="flex-1 h-12 rounded-2xl border-0 bg-red-500 text-white text-[14px] font-extrabold cursor-pointer active:scale-[0.985]"
                >
                  Выйти
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  )
}
