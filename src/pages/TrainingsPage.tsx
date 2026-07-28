import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { trainingsService, type MyTraining } from '../api/trainingsService'

const formatDate = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  })
}

const formatPeriod = (training: MyTraining): string => {
  const start = formatDate(training.starts_at)
  const end = formatDate(training.ends_at)
  if (start && end) return `${start} — ${end}`
  if (start) return `с ${start}`
  if (end) return `до ${end}`
  return ''
}

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: string }
> = {
  submitted: {
    label: 'ДЗ на проверке',
    className: 'bg-[var(--accent-light)] text-[var(--accent)]',
    icon: 'mdi:clock-outline',
  },
  accepted: {
    label: 'ДЗ принято',
    className: 'bg-green-50 text-green-600',
    icon: 'mdi:check-circle-outline',
  },
  rejected: {
    label: 'ДЗ отклонено',
    className: 'bg-red-50 text-red-600',
    icon: 'mdi:close-circle-outline',
  },
}

export function TrainingsPage() {
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

  const { data: trainings = [], isLoading, isError } = useQuery({
    queryKey: ['my-trainings', employeeGuid],
    queryFn: () => trainingsService.getMyTrainings(employeeGuid),
    enabled: Boolean(employeeGuid),
  })

  const renderCard = (training: MyTraining) => {
    const statusMeta = training.submission_status
      ? STATUS_META[training.submission_status]
      : null
    const period = formatPeriod(training)

    return (
      <button
        key={training.guid}
        type="button"
        onClick={() => navigate(`/trainings/${training.guid}`)}
        className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Icon icon="mdi:school-outline" width={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-gray-900">
            {training.title || 'Без названия'}
          </p>
          <p className="truncate text-[13px] text-gray-500">
            {[period, training.location, `${training.materials_count} материал(ов)`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {training.homework_required && (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${
                statusMeta ? statusMeta.className : 'bg-amber-50 text-amber-600'
              }`}
            >
              <Icon icon={statusMeta ? statusMeta.icon : 'mdi:file-upload-outline'} width={14} />
              {statusMeta ? statusMeta.label : 'Нужно сдать ДЗ'}
            </span>
          )}
        </div>
        <Icon icon="mdi:chevron-right" width={22} className="shrink-0 text-gray-300" />
      </button>
    )
  }

  return (
    <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-1 min-h-0 flex-col gap-3.5">
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-[84px] animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Не удалось загрузить тренинги. Попробуйте позже.
        </div>
      ) : trainings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon icon="mdi:school-outline" width={40} className="text-gray-300" />
          <p className="text-sm text-gray-500">Вам пока не назначены тренинги</p>
        </div>
      ) : (
        <section className="space-y-2.5">{trainings.map(renderCard)}</section>
      )}
    </div>
  )
}
