import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { surveysService, type MySurvey } from '../api/surveysService'

const formatDate = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function SurveysPage() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session]
  )

  const { data: surveys = [], isLoading, isError } = useQuery({
    queryKey: ['my-surveys', employeeGuid],
    queryFn: () => surveysService.getMySurveys(employeeGuid),
    enabled: Boolean(employeeGuid),
  })

  // Непройденные наверх: список плоский (как в макете), порядок и делает
  // приоритет очевидным без отдельных заголовков секций.
  const ordered = useMemo(
    () => [...surveys].sort((a, b) => Number(a.completed) - Number(b.completed)),
    [surveys],
  )

  const renderCard = (survey: MySurvey) => (
    <button
      key={survey.guid}
      type="button"
      onClick={() => {
        if (!survey.completed) navigate(`/surveys/${survey.guid}`)
      }}
      disabled={survey.completed}
      className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-70"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          survey.completed ? 'bg-green-50 text-green-600' : 'bg-[var(--accent-light)] text-[var(--accent)]'
        }`}
      >
        <Icon
          icon={survey.completed ? 'mdi:check-circle-outline' : 'mdi:clipboard-text-outline'}
          width={22}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14px] font-bold text-[var(--text-main)]">
          {survey.title || 'Без названия'}
        </p>
        <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">
          {survey.completed
            ? `Пройден ${formatDate(survey.completed_at)}`
            : 'Нажмите, чтобы пройти'}
        </p>
      </div>
      {/* Статус вынесен в бейдж (как в макете): по нему список читается
          с одного взгляда, не вчитываясь в подписи. */}
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
          survey.completed
            ? 'bg-green-50 text-green-600'
            : 'bg-[var(--accent-light)] text-[var(--accent)]'
        }`}
      >
        {survey.completed ? 'Пройден' : 'Новый'}
      </span>
    </button>
  )

  return (
    <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-1 min-h-0 flex-col gap-3.5">
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[74px] animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Не удалось загрузить опросы. Попробуйте позже.
        </div>
      ) : surveys.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon icon="mdi:clipboard-check-outline" width={40} className="text-gray-300" />
          <p className="text-sm text-gray-500">Вам пока не назначены опросы</p>
        </div>
      ) : (
        <section className="space-y-2.5">{ordered.map(renderCard)}</section>
      )}
    </div>
  )
}
