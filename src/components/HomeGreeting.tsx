import { useAuth } from '../context/AuthContext'
import { useI18n, formatDateLocal, type Lang } from '../i18n'

function formatTodayLabel(lang: Lang): string {
  return formatDateLocal(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }, lang).toUpperCase()
}

export function HomeGreeting() {
  const { profile } = useAuth()
  const { lang, t } = useI18n()
  const firstName = typeof profile?.first_name === 'string' ? profile.first_name : ''

  return (
    <div className="animate-fade-in-up">
      <p className="m-0 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
        {formatTodayLabel(lang)}
      </p>
      <h1 className="m-0 mt-1 text-[22px] font-extrabold text-[var(--text-main)] tracking-tight">
        {firstName ? t('home.greetingNamed', { name: firstName }) : t('home.greeting')}
      </h1>
    </div>
  )
}
