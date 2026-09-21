import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useT, type TKey } from '../i18n'

interface MiniApp {
  label: TKey
  icon: string
  bg: string
  fg: string
  to: string
}

// Порядок задан вручную и означает частоту, а не алфавит: первая тройка —
// то, за чем открывают приложение каждый день.
const MINI_APPS: MiniApp[] = [
  { label: 'page.tasks', icon: 'mdi:checkbox-marked-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/tasks' },
  { label: 'page.time', icon: 'mdi:clock-outline', bg: 'rgba(217,119,6,0.14)', fg: '#f0b34d', to: '/time' },
  { label: 'page.calendar', icon: 'mdi:calendar-blank-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/calendar' },
  { label: 'page.company', icon: 'mdi:office-building-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/company' },
  { label: 'page.contacts', icon: 'mdi:account-box-multiple-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/contacts' },
  { label: 'page.orgStructure', icon: 'mdi:sitemap-outline', bg: 'rgba(139,92,246,0.14)', fg: '#a78bfa', to: '/org-structure' },
  { label: 'page.knowledge', icon: 'mdi:book-open-page-variant-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/knowledge' },
  { label: 'page.payroll', icon: 'mdi:wallet-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/payroll' },
  { label: 'page.documents', icon: 'mdi:file-document-outline', bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff', to: '/documents' },
  { label: 'page.kpi', icon: 'mdi:target-arrow', bg: 'rgba(139,92,246,0.14)', fg: '#a78bfa', to: '/kpi' },
  { label: 'page.surveys', icon: 'mdi:clipboard-text-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/surveys' },
  { label: 'page.trainings', icon: 'mdi:school-outline', bg: 'rgba(217,119,6,0.14)', fg: '#f0b34d', to: '/trainings' },
  { label: 'page.property', icon: 'mdi:package-variant-closed', bg: 'rgba(225,29,72,0.14)', fg: '#fb7185', to: '/property' },
  { label: 'page.tasksCalendar', icon: 'mdi:calendar-check-outline', bg: 'rgba(16,185,129,0.14)', fg: '#34d399', to: '/tasks-calendar' },
  { label: 'page.reports', icon: 'mdi:chart-bar', bg: 'rgba(139,92,246,0.14)', fg: '#a78bfa', to: '/reports' },
]

export function MiniApps() {
  const navigate = useNavigate()
  const t = useT()

  return (
    <section className="animate-fade-in-up flex flex-col gap-3">
      <p className="m-0 text-[13px] font-bold text-[var(--text-muted)] uppercase tracking-wide">
        {t('miniApps.title')}
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
              {t(app.label)}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
