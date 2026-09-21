import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useT, tr, formatDateLocal } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { trainingsService, type MyTraining } from '../api/trainingsService'

const formatDate = (value: string | null): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatDateLocal(parsed, {
    day: '2-digit',
    month: 'long',
  })
}

const formatPeriod = (training: MyTraining): string => {
  const start = formatDate(training.starts_at)
  const end = formatDate(training.ends_at)
  if (start && end) return `${start} — ${end}`
  if (start) return tr('training.from', { date: start })
  if (end) return tr('training.to', { date: end })
  return ''
}

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: string }
> = {
  submitted: {
    label: tr('training.hwReview'),
    className: 'bg-[var(--accent-light)] text-[var(--accent)]',
    icon: 'mdi:clock-outline',
  },
  accepted: {
    label: tr('training.hwAccepted'),
    className: 'bg-green-50 text-green-600',
    icon: 'mdi:check-circle-outline',
  },
  rejected: {
    label: tr('training.hwRejected'),
    className: 'bg-red-50 text-red-600',
    icon: 'mdi:close-circle-outline',
  },
}

/**
 * Статус тренинга по датам и домашке — в макете он есть, в данных отдельным
 * полем нет. Порядок проверок = порядок важности: незакрытое ДЗ («что с меня
 * требуют») важнее того, идёт тренинг или уже прошёл.
 */
const getLifecycleBadge = (
  training: MyTraining,
): { label: string; className: string; icon: string } | null => {
  if (training.homework_required) {
    const statusMeta = training.submission_status ? STATUS_META[training.submission_status] : null
    return (
      statusMeta || {
        label: tr('training.hwNeeded'),
        className: 'bg-amber-50 text-amber-600',
        icon: 'mdi:file-upload-outline',
      }
    )
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = training.starts_at ? new Date(training.starts_at) : null
  const end = training.ends_at ? new Date(training.ends_at) : start
  if (end && !Number.isNaN(end.getTime()) && end < today) {
    return { label: tr('training.finished'), className: 'bg-green-50 text-green-600', icon: 'mdi:check' }
  }
  if (start && !Number.isNaN(start.getTime()) && start > today) {
    return { label: tr('training.soon'), className: 'bg-[var(--accent-light)] text-[var(--accent)]', icon: 'mdi:calendar-clock' }
  }
  if (start) {
    return { label: tr('training.ongoing'), className: 'bg-violet-50 text-violet-600', icon: 'mdi:play-circle-outline' }
  }
  return null
}

export function TrainingsPage() {
  const t = useT()

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
    const badge = getLifecycleBadge(training)
    const period = formatPeriod(training)

    return (
      <button
        key={training.guid}
        type="button"
        onClick={() => navigate(`/trainings/${training.guid}`)}
        className="flex w-full items-center gap-3 rounded-2xl bg-[var(--surface)] p-4 text-left shadow-sm transition active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          <Icon icon="mdi:school-outline" width={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14px] font-bold text-[var(--text-main)] leading-snug">
            {training.title || t('tasks.noName')}
          </p>
          <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)] leading-snug">
            {[period, training.location, t('training.materialsCount', { count: training.materials_count })]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {badge && (
            <span
              className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}
            >
              <Icon icon={badge.icon} width={13} />
              {badge.label}
            </span>
          )}
        </div>
        <Icon icon="mdi:chevron-right" width={20} className="shrink-0 text-[var(--text-muted)]" />
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
          {t('training.loadFailed')}
        </div>
      ) : trainings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon icon="mdi:school-outline" width={40} className="text-gray-300" />
          <p className="text-sm text-gray-500">{t('training.empty')}</p>
        </div>
      ) : (
        <section className="space-y-2.5">{trainings.map(renderCard)}</section>
      )}
    </div>
  )
}
