import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'

interface MiniApp {
  label: string
  icon: string
  bg: string
  fg: string
  to: string
}

const MINI_APPS: MiniApp[] = [
  { label: 'Компания', icon: 'mdi:office-building-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/company' },
  { label: 'Задачи', icon: 'mdi:checkbox-marked-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/tasks' },
  { label: 'Время', icon: 'mdi:clock-outline', bg: 'rgba(217,119,6,0.14)', fg: '#f0b34d', to: '/time' },
  { label: 'Зарплата', icon: 'mdi:wallet-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/payroll' },
  { label: 'Отчёты', icon: 'mdi:chart-bar', bg: 'rgba(139,92,246,0.14)', fg: '#a78bfa', to: '/reports' },
  { label: 'Календарь', icon: 'mdi:calendar-blank-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/calendar' },
  { label: 'Календарь задач', icon: 'mdi:calendar-check-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/tasks-calendar' },
  { label: 'Документы', icon: 'mdi:file-document-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/documents' },
  { label: 'KPI', icon: 'mdi:target-arrow', bg: 'rgba(139,92,246,0.14)', fg: '#a78bfa', to: '/kpi' },
  { label: 'Опросы', icon: 'mdi:clipboard-text-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/surveys' },
  { label: 'Тренинги', icon: 'mdi:school-outline', bg: 'rgba(217,119,6,0.14)', fg: '#f0b34d', to: '/trainings' },
  { label: 'База знаний', icon: 'mdi:book-open-page-variant-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/knowledge' },
  { label: 'Имущество', icon: 'mdi:package-variant-closed', bg: 'rgba(225,29,72,0.14)', fg: '#fb7185', to: '/property' },
]

export function MiniApps() {
  const navigate = useNavigate()

  return (
    <section className="animate-fade-in-up flex flex-col gap-3">
      <p className="m-0 text-[13px] font-bold text-[var(--text-muted)] uppercase tracking-wide">
        Мини-приложения
      </p>
      <div className="grid grid-cols-3 gap-x-2 gap-y-3.5">
        {MINI_APPS.map((app) => (
          <button
            key={app.to}
            type="button"
            onClick={() => navigate(app.to)}
            className="flex flex-col items-center gap-1.5 border-0 bg-transparent cursor-pointer active:scale-95 transition-transform"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: app.bg, color: app.fg }}
            >
              <Icon icon={app.icon} width={24} />
            </div>
            <span className="text-[12px] font-semibold text-[var(--text-main)] text-center leading-tight">
              {app.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
