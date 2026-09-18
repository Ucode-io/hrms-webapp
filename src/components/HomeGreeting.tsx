import { useAuth } from '../context/AuthContext'

function formatTodayLabel(): string {
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date()).toUpperCase()
}

export function HomeGreeting() {
  const { profile } = useAuth()
  const firstName = typeof profile?.first_name === 'string' ? profile.first_name : ''

  return (
    <div className="animate-fade-in-up">
      <p className="m-0 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
        {formatTodayLabel()}
      </p>
      <h1 className="m-0 mt-1 text-[22px] font-extrabold text-[var(--text-main)] tracking-tight">
        Здравствуйте{firstName ? `, ${firstName}` : ''}
      </h1>
    </div>
  )
}
