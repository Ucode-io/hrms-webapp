import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { uploadFile } from '../api/dashboardService'
import {
  sportService,
  formatSportDate,
  formatSportTime,
  getDefaultSportDateTime,
  splitSportDateTime,
  type SportAttendanceRecord,
} from '../api/sportService'
import { resolveCompaniesId } from '../api/adminRequest'

type SportForm = {
  date: string
  time: string
  video: string
}

const getCurrentMonthKey = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const getMonthKeyFromDateTime = (value: string): string => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

const formatMonthLabel = (monthKey: string): string => {
  if (!monthKey) return 'месяц'
  const parsed = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return monthKey
  return parsed.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
}

const getLastSixMonthKeys = (): string[] => {
  const result: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return result
}

export function SportPage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SportAttendanceRecord | null>(null)
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey())
  const monthPillsRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<SportForm>(() => {
    const defaults = getDefaultSportDateTime()
    return { date: defaults.date, time: defaults.time, video: '' }
  })

  const employeeGuid = useMemo(() =>
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  , [profile, session])

  const companyId = useMemo(
    () => resolveCompaniesId(profile, session?.user_data, session?.user),
    [profile, session],
  )

  const {
    data: records = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sport-attendance', employeeGuid],
    queryFn: async () => {
      if (!employeeGuid) return []
      return sportService.getByEmployee(employeeGuid)
    },
    enabled: Boolean(employeeGuid),
  })

  const availableMonths = useMemo(() => {
    const unique = new Set<string>()
    for (const record of records) {
      const monthKey = getMonthKeyFromDateTime(record.time)
      if (monthKey) unique.add(monthKey)
    }
    return Array.from(unique).sort((a, b) => b.localeCompare(a))
  }, [records])

  const filteredRecords = useMemo(() =>
    records.filter((record) => getMonthKeyFromDateTime(record.time) === selectedMonth)
  , [records, selectedMonth])

  const monthPills = useMemo(() => {
    const base = getLastSixMonthKeys()
    const missingFromData = availableMonths.filter((monthKey) => !base.includes(monthKey))
    return [...new Set([...missingFromData, ...base])].sort((a, b) => a.localeCompare(b))
  }, [availableMonths])

  useEffect(() => {
    if (monthPillsRef.current) {
      monthPillsRef.current.scrollLeft = monthPillsRef.current.scrollWidth
    }
  }, [])

  const isBusy = isSubmitting || isUploading

  const openCreate = () => {
    const defaults = getDefaultSportDateTime()
    setEditing(null)
    setForm({ date: defaults.date, time: defaults.time, video: '' })
    setFormError('')
    setShowForm(true)
  }

  const openEdit = (record: SportAttendanceRecord) => {
    const parsed = splitSportDateTime(record.time)
    setEditing(record)
    setForm({
      date: parsed.date,
      time: parsed.time,
      video: record.video || '',
    })
    setFormError('')
    setShowForm(true)
  }

  const closeForm = () => {
    if (isBusy) return
    setShowForm(false)
    setEditing(null)
    setFormError('')
  }

  const handleUploadVideo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setIsUploading(true)
      const url = await uploadFile(file)
      if (!url) {
        setFormError('Не удалось получить ссылку на видео.')
        return
      }
      setForm((prev) => ({ ...prev, video: url }))
      setFormError('')
    } catch (uploadError) {
      console.error('Sport video upload error:', uploadError)
      setFormError('Не удалось загрузить видео.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleSave = async () => {
    if (!employeeGuid) {
      setFormError('Не найден сотрудник.')
      return
    }
    if (!form.date) {
      setFormError('Укажите дату.')
      return
    }
    if (!form.time) {
      setFormError('Укажите время.')
      return
    }
    if (!form.video.trim()) {
      setFormError('Загрузите видео.')
      return
    }

    try {
      setIsSubmitting(true)
      if (editing?.guid) {
        await sportService.update({
          guid: editing.guid,
          userBaseId: employeeGuid,
          companyId,
          date: form.date,
          time: form.time,
          video: form.video.trim(),
        })
      } else {
        await sportService.create({
          userBaseId: employeeGuid,
          companyId,
          date: form.date,
          time: form.time,
          video: form.video.trim(),
        })
      }
      setSelectedMonth(form.date.slice(0, 7))
      closeForm()
      await refetch()
    } catch (saveError) {
      console.error('Sport attendance save error:', saveError)
      setFormError('Не удалось сохранить запись.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (record: SportAttendanceRecord) => {
    if (!record.guid) return
    if (!window.confirm('Удалить запись посещения спорта?')) return

    try {
      setIsSubmitting(true)
      await sportService.remove(record.guid)
      await refetch()
    } catch (deleteError) {
      console.error('Sport attendance delete error:', deleteError)
      setFormError('Не удалось удалить запись.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col gap-3.5 pb-[88px]">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon icon="mdi:dumbbell" width={18} />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Посещение спорта</p>
                <p className="m-0 mt-0.5 text-[11px] text-[var(--text-muted)]">Ваши отметки и видео-подтверждения</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            <div ref={monthPillsRef} className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {monthPills.map((monthKey) => {
                const monthDate = new Date(`${monthKey}-01T00:00:00`)
                const monthLabel = Number.isNaN(monthDate.getTime())
                  ? monthKey
                  : monthDate.toLocaleDateString('ru-RU', { month: 'short' })
                const isActive = monthKey === selectedMonth

                return (
                  <button
                    key={monthKey}
                    type="button"
                    onClick={() => setSelectedMonth(monthKey)}
                    className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border cursor-pointer transition-all active:scale-95 ${
                      isActive
                        ? 'border-transparent text-white'
                        : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text-secondary)]'
                    }`}
                    style={isActive ? { background: company.mainColor } : undefined}
                  >
                    {monthLabel}
                  </button>
                )
              })}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-[var(--accent)]" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-3 py-3 text-sm">
                Не удалось загрузить записи по спорту
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--app-bg)] px-4 py-8 text-center">
                <p className="m-0 text-sm text-[var(--text-muted)]">
                  За {formatMonthLabel(selectedMonth)} записей нет
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredRecords.map((record) => (
                  <article key={record.guid} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">
                          {formatSportDate(record.time)}
                        </p>
                        <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">
                          {formatSportTime(record.time)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {record.video ? (
                          <button
                            type="button"
                            onClick={() => window.open(record.video, '_blank', 'noopener,noreferrer')}
                            className="h-8 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold text-[var(--text-secondary)]"
                          >
                            Видео
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEdit(record)}
                          className="h-8 px-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[11px] font-semibold text-[var(--text-secondary)]"
                        >
                          Изм.
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(record)}
                          className="h-8 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-600"
                        >
                          Удал.
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-[88px] right-4 z-20 w-14 h-14 rounded-2xl border-0 text-white shadow-xl cursor-pointer flex items-center justify-center transition-transform active:scale-90"
        style={{ background: company.mainColor }}
        aria-label="Добавить посещение спорта"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* handleOnly: keep the date input tappable — vaul's full-content drag
          otherwise swallows taps so the native picker never opens. */}
      <Drawer.Root open={showForm} onOpenChange={setShowForm} handleOnly>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none max-h-[90vh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1"><Drawer.Handle className="!w-10 !h-[4px] !bg-gray-300" /></div>
            <div className="px-5 pt-2 pb-[calc(18px+env(safe-area-inset-bottom))] overflow-y-auto">
              <h3 className="m-0 text-[18px] font-extrabold text-[var(--text-main)]">
                {editing ? 'Изменить посещение спорта' : 'Добавить посещение спорта'}
              </h3>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="block mb-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Дата</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                    className="mobile-input h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-main)]"
                  />
                </label>
                <label className="block">
                  <span className="block mb-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Время</span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => setForm((prev) => ({ ...prev, time: event.target.value }))}
                    className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text-main)]"
                  />
                </label>
              </div>

              <div className="mt-3">
                <p className="m-0 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Видео</p>
                <label className="mt-1.5 block rounded-xl border border-dashed border-[var(--line)] bg-[var(--app-bg)] px-4 py-3 text-center cursor-pointer">
                  <p className="m-0 text-[13px] font-semibold text-[var(--text-main)]">
                    {isUploading ? 'Загрузка...' : form.video ? 'Заменить видео' : 'Загрузить видео'}
                  </p>
                  <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)]">MP4, MOV, AVI и другие форматы</p>
                  <input
                    type="file"
                    accept="video/*"
                    disabled={isUploading}
                    onChange={(event) => void handleUploadVideo(event)}
                    className="hidden"
                  />
                </label>
                {form.video ? (
                  <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => window.open(form.video, '_blank', 'noopener,noreferrer')}
                      className="text-[11px] font-semibold text-[var(--accent)] bg-transparent border-0 p-0"
                    >
                      Открыть текущее видео
                    </button>
                  </div>
                ) : null}
              </div>

              {formError ? (
                <div className="mt-3 rounded-xl border border-[var(--error-line)] bg-[var(--error-bg)] px-3 py-2.5 text-[12px] text-[var(--error-text)]">
                  {formError}
                </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isBusy}
                  className="h-10 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-semibold text-[var(--text-secondary)]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isBusy}
                  className="h-10 flex-1 rounded-xl border-0 text-[13px] font-bold text-white"
                  style={{ background: company.mainColor }}
                >
                  {isSubmitting ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
