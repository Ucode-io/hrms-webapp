import { useNavigate } from 'react-router-dom'
import { CalendarOffIcon, ClockIcon, WalletIcon, FileTextIcon } from './Icons'

const actions = [
  { label: 'Отпуск',       desc: 'Подать заявку',   Icon: CalendarOffIcon, bg: 'bg-[var(--accent-light)]', color: 'text-[var(--accent)]',  path: '/absence' },
  { label: 'Учёт времени', desc: 'Отметиться',       Icon: ClockIcon,       bg: 'bg-amber-50',              color: 'text-amber-600',        path: '/time'    },
  { label: 'Зарплата',     desc: 'Расчётный лист',   Icon: WalletIcon,      bg: 'bg-emerald-50',            color: 'text-emerald-600',      path: '/payroll' },
  { label: 'Справки',      desc: 'Запросить',        Icon: FileTextIcon,    bg: 'bg-violet-50',             color: 'text-violet-600',       path: '/more'    },
]

export function QuickActions() {
  const navigate = useNavigate()

  return (
    <section className="animate-fade-in-up animate-delay-1">
      <p className="m-0 text-[17px] font-extrabold text-[var(--text-main)] tracking-tight">
        Быстрые действия
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {actions.map((qa) => (
          <button
            key={qa.label}
            type="button"
            onClick={() => navigate(qa.path)}
            className="flex flex-col gap-2 p-4 rounded-[20px] border border-[var(--line)] bg-white cursor-pointer text-left transition-transform duration-150 shadow-sm active:scale-[0.97]"
          >
            <div className={`w-[42px] h-[42px] rounded-xl flex items-center justify-center ${qa.bg} ${qa.color}`}>
              <qa.Icon size={22} />
            </div>
            <p className="m-0 text-sm font-bold text-[var(--text-main)] leading-tight">{qa.label}</p>
            <p className="m-0 text-[11px] text-[var(--text-muted)] leading-tight">{qa.desc}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
