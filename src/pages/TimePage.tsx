import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useT, type TKey } from '../i18n'
import { TimeRequestsTab } from './time/TimeRequestsTab'
import { TimeSheetTab } from './time/TimeSheetTab'
import { TimeScheduleTab } from './time/TimeScheduleTab'

type TimeTab = 'requests' | 'timesheet' | 'schedule'

const TABS: { key: TimeTab; label: TKey; icon: string }[] = [
  { key: 'requests', label: 'time.requests', icon: 'mdi:card-text-outline' },
  { key: 'timesheet', label: 'time.timesheet', icon: 'mdi:check-circle-outline' },
  { key: 'schedule', label: 'time.schedule', icon: 'mdi:view-grid-outline' },
]

export function TimePage() {
  const [tab, setTab] = useState<TimeTab>('requests')
  const t = useT()

  return (
    <>
      {tab === 'requests' && <TimeRequestsTab />}
      {tab === 'timesheet' && <TimeSheetTab />}
      {tab === 'schedule' && <TimeScheduleTab />}

      {/* Локальный таббар страницы — заменяет глобальный (см. AppShell) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--line)]/60 bg-[var(--surface)]/90 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {TABS.map(({ key, label, icon }) => {
            const isActive = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 border-0 bg-transparent cursor-pointer transition-all duration-200 active:scale-[0.85] active:opacity-70 ${
                  isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <Icon icon={icon} width={22} className={isActive ? 'opacity-100' : 'opacity-60'} />
                <span className={`text-[10px] leading-tight font-semibold ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {t(label)}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
