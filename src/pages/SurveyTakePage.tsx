import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'

import { Model } from 'survey-core'
import { Survey } from 'survey-react-ui'
import 'survey-core/survey-core.css'
import 'survey-core/i18n/russian'

import { useAuth } from '../context/AuthContext'
import { parseSurveyBody, surveysService } from '../api/surveysService'
import { surveyTheme } from '../config/surveyTheme'

export function SurveyTakePage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const surveysId = id || ''
  const queryClient = useQueryClient()
  const { session, profile } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session]
  )

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['survey-take', employeeGuid, surveysId],
    queryFn: () => surveysService.getForTaking(employeeGuid, surveysId),
    enabled: Boolean(employeeGuid && surveysId),
    retry: false,
  })

  const model = useMemo(() => {
    if (!data || data.already_completed) return null

    const json = parseSurveyBody(data.survey.body)
    // Drop the builder's logo/advanced cover — the page renders its own
    // app-styled title block above the survey instead.
    delete json.logo
    delete json.logoPosition
    json.headerView = 'basic'

    const surveyModel = new Model(json)
    surveyModel.locale = 'ru'
    surveyModel.applyTheme(surveyTheme)
    // The survey shows its builder title itself (styled via surveyTheme); the
    // page constrains/centers the column, and SurveyJS completion page is
    // replaced by our own "done" screen.
    surveyModel.widthMode = 'responsive'
    surveyModel.showCompletedPage = false

    surveyModel.onComplete.add((sender) => {
      void (async () => {
        setIsSubmitting(true)
        setSubmitError('')
        try {
          await surveysService.submit(employeeGuid, surveysId, sender.data || {})
          setIsDone(true)
          await queryClient.invalidateQueries({ queryKey: ['my-surveys'] })
        } catch (error) {
          console.error('Failed to submit survey:', error)
          setSubmitError('Не удалось отправить ответы. Попробуйте еще раз.')
          // Return the survey to an editable state so the user can retry.
          sender.clear(false, false)
        } finally {
          setIsSubmitting(false)
        }
      })()
    })

    return surveyModel
  }, [data, employeeGuid, queryClient, surveysId])

  return (
    <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-1 min-h-0 flex-col gap-3.5">
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Опрос недоступен: возможно, он не назначен вам или уже не активен.
        </div>
      ) : isDone ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon icon="mdi:check-circle" width={48} className="text-green-500" />
          <p className="text-base font-semibold text-gray-900">Спасибо!</p>
          <p className="text-sm text-gray-500">Ваши ответы отправлены.</p>
          <button
            type="button"
            onClick={() => navigate('/surveys')}
            className="mt-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
          >
            К списку опросов
          </button>
        </div>
      ) : data?.already_completed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
          <Icon icon="mdi:check-circle-outline" width={48} className="text-green-500" />
          <p className="text-base font-semibold text-gray-900">Опрос уже пройден</p>
          <p className="text-sm text-gray-500">Повторное прохождение недоступно.</p>
          <button
            type="button"
            onClick={() => navigate('/surveys')}
            className="mt-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
          >
            К списку опросов
          </button>
        </div>
      ) : model ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white shadow-sm">
          {submitError && (
            <div className="mx-4 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {submitError}
            </div>
          )}
          {isSubmitting && (
            <div className="mx-4 mt-4 rounded-xl bg-[var(--accent-light)] px-4 py-3 text-sm text-[var(--accent)]">
              Отправляем ответы...
            </div>
          )}
          <Survey model={model} />
        </div>
      ) : null}
    </div>
  )
}
