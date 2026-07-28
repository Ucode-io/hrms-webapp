import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'

import { useAuth } from '../context/AuthContext'
import { uploadFile } from '../api/dashboardService'
import {
  trainingsService,
  type TrainingMaterial,
} from '../api/trainingsService'

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

const formatFileSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

const MATERIAL_ICONS: Record<TrainingMaterial['material_type'], string> = {
  file: 'mdi:file-document-outline',
  link: 'mdi:link-variant',
  video: 'mdi:play-circle-outline',
}

export function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const trainingsId = id || ''
  const queryClient = useQueryClient()
  const { session, profile } = useAuth()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isResubmitting, setIsResubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    },
    []
  )

  const employeeGuid = useMemo(
    () =>
      (typeof profile?.guid === 'string' && profile.guid) ||
      (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
      (typeof session?.user?.guid === 'string' && session.user.guid) ||
      '',
    [profile, session]
  )

  const { data, isLoading, isError } = useQuery({
    queryKey: ['training-take', employeeGuid, trainingsId],
    queryFn: () => trainingsService.getForTaking(employeeGuid, trainingsId),
    enabled: Boolean(employeeGuid && trainingsId),
    retry: false,
  })

  const training = data?.training
  const materials = data?.materials || []
  const submission = data?.submission || null

  const periodLabel = useMemo(() => {
    const start = formatDate(training?.starts_at || null)
    const end = formatDate(training?.ends_at || null)
    if (start && end) return `${start} — ${end}`
    if (start) return `с ${start}`
    if (end) return `до ${end}`
    return ''
  }, [training?.starts_at, training?.ends_at])

  const handleSubmit = async () => {
    if (!selectedFile) {
      setSubmitError('Выберите файл с домашним заданием.')
      return
    }

    setIsSubmitting(true)
    setSubmitError('')
    try {
      const fileUrl = await uploadFile(selectedFile)
      if (!fileUrl) throw new Error('Upload returned no URL')

      await trainingsService.submitHomework(employeeGuid, trainingsId, {
        file_url: fileUrl,
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        comment: comment.trim() || undefined,
      })

      setSelectedFile(null)
      setComment('')
      setIsResubmitting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['training-take'] }),
        queryClient.invalidateQueries({ queryKey: ['my-trainings'] }),
      ])

      setShowSuccess(true)
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => setShowSuccess(false), 4000)
    } catch (error) {
      console.error('Failed to submit homework:', error)
      setSubmitError('Не удалось отправить домашнее задание. Попробуйте еще раз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderUploadForm = () => (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-4 text-left transition active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-[var(--accent)]">
          <Icon icon={selectedFile ? 'mdi:file-check-outline' : 'mdi:file-upload-outline'} width={22} />
        </div>
        <div className="min-w-0 flex-1">
          {selectedFile ? (
            <>
              <p className="truncate text-[14px] font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-[12px] text-gray-500">
                {formatFileSize(selectedFile.size)} · нажмите, чтобы заменить
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-medium text-gray-700">Выбрать файл</p>
              <p className="text-[12px] text-gray-500">Любой формат, включая ZIP-архив</p>
            </>
          )}
        </div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null
          setSelectedFile(file)
          setSubmitError('')
        }}
      />

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Комментарий к работе (необязательно)"
        rows={2}
        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[14px] text-gray-800 placeholder:text-gray-400 focus:border-[var(--accent)] focus:outline-none"
      />

      {submitError && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{submitError}</div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white transition active:scale-[0.99] disabled:opacity-60"
      >
        {isSubmitting ? 'Отправляем...' : 'Отправить домашнее задание'}
      </button>
    </div>
  )

  const renderSubmissionCard = () => {
    if (!submission) return null

    const isAccepted = submission.status === 'accepted'
    const isRejected = submission.status === 'rejected'

    return (
      <div
        className={`space-y-2 rounded-xl p-4 ${
          isAccepted ? 'bg-green-50' : isRejected ? 'bg-red-50' : 'bg-[var(--accent-light)]'
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon
            icon={
              isAccepted
                ? 'mdi:check-circle'
                : isRejected
                  ? 'mdi:close-circle'
                  : 'mdi:clock-outline'
            }
            width={20}
            className={isAccepted ? 'text-green-600' : isRejected ? 'text-red-500' : 'text-[var(--accent)]'}
          />
          <p
            className={`text-[14px] font-semibold ${
              isAccepted ? 'text-green-700' : isRejected ? 'text-red-600' : 'text-[var(--accent)]'
            }`}
          >
            {isAccepted
              ? 'Домашнее задание принято'
              : isRejected
                ? 'Домашнее задание отклонено'
                : 'Домашнее задание на проверке'}
          </p>
        </div>

        <a
          href={submission.file_url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2"
        >
          <Icon icon="mdi:paperclip" width={16} className="shrink-0 text-gray-500" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-gray-700">
            {submission.file_name || 'Файл'}
          </span>
          {submission.file_size ? (
            <span className="shrink-0 text-[12px] text-gray-400">
              {formatFileSize(submission.file_size)}
            </span>
          ) : null}
        </a>

        <p className="text-[12px] text-gray-500">
          Отправлено {formatDate(submission.submitted_at)}
        </p>

        {isRejected && submission.review_comment && (
          <p className="rounded-lg bg-white/70 px-3 py-2 text-[13px] text-red-600">
            Комментарий проверяющего: {submission.review_comment}
          </p>
        )}

        {!isAccepted && !isResubmitting && (
          <button
            type="button"
            onClick={() => setIsResubmitting(true)}
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.99] ${
              isRejected ? 'bg-red-500' : 'bg-[var(--accent)]'
            }`}
          >
            Отправить заново
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up mx-auto flex w-full max-w-[760px] flex-1 min-h-0 flex-col gap-3.5">
      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : isError || !training ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          Тренинг недоступен: возможно, он не назначен вам или уже не активен.
        </div>
      ) : (
        <>
          {/* Info */}
          <div className="space-y-2 rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Icon icon="mdi:school-outline" width={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-[17px] font-semibold text-gray-900">
                  {training.title || 'Без названия'}
                </h1>
                {periodLabel && <p className="text-[13px] text-gray-500">{periodLabel}</p>}
              </div>
            </div>
            {(training.trainer_name || training.location) && (
              <div className="space-y-1.5 border-t border-gray-100 pt-2">
                {training.trainer_name && (
                  <p className="flex items-center gap-2 text-[13px] text-gray-600">
                    <Icon icon="mdi:account-tie-outline" width={16} className="shrink-0 text-gray-400" />
                    Тренер: {training.trainer_name}
                  </p>
                )}
                {training.location && (
                  <p className="flex items-center gap-2 text-[13px] text-gray-600">
                    <Icon icon="mdi:map-marker-outline" width={16} className="shrink-0 text-gray-400" />
                    {training.location}
                  </p>
                )}
              </div>
            )}
            {training.description && (
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-gray-600">
                {training.description}
              </p>
            )}
          </div>

          {/* Materials */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-gray-400">
              Материалы ({materials.length})
            </h2>
            {materials.length === 0 ? (
              <p className="text-sm text-gray-400">Материалы не добавлены.</p>
            ) : (
              <div className="space-y-2">
                {materials.map((material) => (
                  <a
                    key={material.guid}
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition active:scale-[0.99]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
                      <Icon icon={MATERIAL_ICONS[material.material_type]} width={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-gray-900">
                        {material.title || material.file_name || material.url}
                      </p>
                      {material.file_size ? (
                        <p className="text-[12px] text-gray-400">
                          {formatFileSize(material.file_size)}
                        </p>
                      ) : null}
                    </div>
                    <Icon
                      icon={material.material_type === 'file' ? 'mdi:download' : 'mdi:open-in-new'}
                      width={18}
                      className="shrink-0 text-gray-300"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Homework */}
          {training.homework_required && (
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-400">
                  Домашнее задание
                </h2>
                {training.homework_deadline && (
                  <span className="text-[12px] text-gray-400">
                    до {formatDate(training.homework_deadline)}
                  </span>
                )}
              </div>

              {showSuccess && (
                <div className="animate-fade-in-up mb-3 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3">
                  <Icon icon="mdi:check-circle" width={20} className="shrink-0 text-green-600" />
                  <p className="text-[14px] font-medium text-green-700">
                    Домашнее задание отправлено!
                  </p>
                </div>
              )}

              {submission && !isResubmitting ? renderSubmissionCard() : renderUploadForm()}
            </div>
          )}
        </>
      )}
    </div>
  )
}
