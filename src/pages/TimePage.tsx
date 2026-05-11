import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import {
  attendanceService,
  computeDelayTimeFromCheckIn,
  formatDateRu,
  normalizeActionStatus,
  normalizeTime,
  normalizeWorkflowStatus,
  parseIsoDate,
  toIsoDate,
  type AttendanceActionStatus,
  type AttendanceRecord,
  type AttendanceWorkflowStatus,
} from '../api/attendanceService'

type AttendanceForm = {
  date: string
  checkInTime: string
  checkOutTime: string
}

function getCurrentDayKey(): string {
  return toIsoDate(new Date())
}

function getLastDayKeys(days: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    result.push(toIsoDate(date))
  }
  return result
}

function formatDayPillLabel(dayKey: string): string {
  const parsed = parseIsoDate(dayKey)
  if (!parsed) return dayKey
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function getActionStatusTag(status: AttendanceActionStatus): { label: string; className: string } {
  if (status === 'present') return { label: 'Присутствует', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (status === 'late') return { label: 'Опоздал', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  if (status === 'absent') return { label: 'Отсутствует', className: 'border-slate-200 bg-slate-100 text-slate-500' }
  return { label: '—', className: 'border-slate-200 bg-slate-100 text-slate-500' }
}

function getWorkflowStatusTag(status: AttendanceWorkflowStatus): { label: string; className: string } {
  if (status === 'requested') return { label: 'Запрошено', className: 'border-amber-200 bg-amber-50 text-amber-700' }
  if (status === 'accepted') return { label: 'Подтверждено', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (status === 'rejected') return { label: 'Отклонено', className: 'border-rose-200 bg-rose-50 text-rose-700' }
  return { label: '—', className: 'border-slate-200 bg-slate-100 text-slate-500' }
}

function resolveRecordDateKey(record: AttendanceRecord): string {
  if (typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date)) return record.date
  const createdAt = typeof record.created_at === 'string' ? record.created_at : ''
  if (!createdAt) return ''
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return ''
  return toIsoDate(parsed)
}

export function TimePage() {
  const { session, profile } = useAuth()
  const { company } = useCompany()
  const dayPillsRef = useRef<HTMLDivElement>(null)
  const [selectedDay, setSelectedDay] = useState(getCurrentDayKey())
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<AttendanceForm>(() => {
    const now = new Date()
    return {
      date: getCurrentDayKey(),
      checkInTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      checkOutTime: '',
    }
  })

  const employeeGuid = useMemo(() =>
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  , [profile, session])

  const companyId = useMemo(() => {
    const fromProfile = profile && typeof profile === 'object' ? (profile as Record<string, unknown>).companies_id : ''
    const fromSessionData = session?.user_data && typeof session.user_data === 'object' ? (session.user_data as Record<string, unknown>).companies_id : ''
    const fromSessionUser = session?.user && typeof session.user === 'object' ? (session.user as Record<string, unknown>).companies_id : ''

    if (typeof fromProfile === 'string' && fromProfile) return fromProfile
    if (typeof fromSessionData === 'string' && fromSessionData) return fromSessionData
    if (typeof fromSessionUser === 'string' && fromSessionUser) return fromSessionUser
    return ''
  }, [profile, session])

  const {
    data: records = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['attendance', employeeGuid],
    queryFn: async () => {
      if (!employeeGuid) return []
      return attendanceService.getByEmployee(employeeGuid)
    },
    enabled: Boolean(employeeGuid),
  })

  const dayPills = useMemo(() => getLastDayKeys(14), [])

  useEffect(() => {
    if (dayPillsRef.current) {
      dayPillsRef.current.scrollLeft = dayPillsRef.current.scrollWidth
    }
  }, [])

  const filteredRecords = useMemo(() =>
    records.filter((record) => resolveRecordDateKey(record) === selectedDay)
  , [records, selectedDay])

  const closeForm = () => {
    if (isSubmitting) return
    setShowForm(false)
    setFormError('')
  }

  const openCreate = () => {
    const now = new Date()
    setForm({
      date: selectedDay,
      checkInTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      checkOutTime: '',
    })
    setFormError('')
    setShowForm(true)
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

    const checkInTime = normalizeTime(form.checkInTime)
    const checkOutTime = normalizeTime(form.checkOutTime)
    if (!checkInTime && !checkOutTime) {
      setFormError('Укажите хотя бы одно время: приход или уход.')
      return
    }

    try {
      setIsSubmitting(true)
      await attendanceService.create({
        userBaseId: employeeGuid,
        companyId,
        date: form.date,
        checkInTime,
        checkOutTime,
      })
      setSelectedDay(form.date)
      closeForm()
      await refetch()
    } catch (saveError) {
      console.error('Attendance save error:', saveError)
      setFormError('Не удалось сохранить запись.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="animate-fade-in-up flex flex-col gap-3.5 pb-[88px]">
        <div ref={dayPillsRef} className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {dayPills.map((dayKey) => {
            const isActive = dayKey === selectedDay
            return (
              <button
                key={dayKey}
                type="button"
                onClick={() => setSelectedDay(dayKey)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border cursor-pointer transition-all active:scale-95 ${
                  isActive
                    ? 'border-transparent text-white'
                    : 'border-[var(--line)] bg-white text-[var(--text-secondary)]'
                }`}
                style={isActive ? { background: company.mainColor } : undefined}
              >
                {formatDayPillLabel(dayKey)}
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
            Не удалось загрузить посещаемость
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-white px-4 py-10 text-center">
            <p className="m-0 text-[14px] font-semibold text-[var(--text-main)]">
              {formatDateRu(selectedDay)}
            </p>
            <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">
              Нет записей по посещаемости за этот день
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredRecords.map((record) => {
              const actionStatus = normalizeActionStatus(record.action_status)
              const requestStatus = normalizeWorkflowStatus(record.status)
              const actionTag = getActionStatusTag(actionStatus)
              const requestTag = getWorkflowStatusTag(requestStatus)
              const checkInTime = normalizeTime(String(record.check_in_time || ''))
              const checkOutTime = normalizeTime(String(record.check_out_time || ''))
              const delayTime = computeDelayTimeFromCheckIn(checkInTime)

              return (
                <article key={record.guid} className="rounded-xl border border-[var(--line)] bg-white px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 text-[13px] font-bold text-[var(--text-main)]">
                        {formatDateRu(resolveRecordDateKey(record))}
                      </p>
                      <p className="m-0 mt-1 text-[12px] text-[var(--text-muted)]">
                        Приход: {checkInTime || '—'} · Уход: {checkOutTime || '—'}
                      </p>
                      <p className="m-0 mt-0.5 text-[12px] text-[var(--text-muted)]">
                        Опоздание: {delayTime === '00:00' ? '—' : delayTime}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${actionTag.className}`}>
                        {actionTag.label}
                      </span>
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${requestTag.className}`}>
                        {requestTag.label}
                      </span>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-[88px] right-4 z-20 w-14 h-14 rounded-2xl border-0 text-white shadow-xl cursor-pointer flex items-center justify-center transition-transform active:scale-90"
        style={{ background: company.mainColor }}
        aria-label="Добавить посещаемость"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Drawer.Root open={showForm} onOpenChange={setShowForm}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px] outline-none max-h-[90vh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-[4px] bg-gray-300 rounded-full" />
            </div>

            <div className="px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2 overflow-y-auto">
              <p className="m-0 text-[20px] font-extrabold text-[var(--text-main)]">Добавить посещаемость</p>
              <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)]">Статус будет отправлен как requested</p>

              <div className="mt-4 flex flex-col gap-3">
                <label className="block">
                  <span className="block mb-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Дата</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="block">
                  <span className="block mb-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Время прихода</span>
                  <input
                    type="time"
                    value={form.checkInTime}
                    onChange={(event) => setForm((prev) => ({ ...prev, checkInTime: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>

                <label className="block">
                  <span className="block mb-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Время ухода</span>
                  <input
                    type="time"
                    value={form.checkOutTime}
                    onChange={(event) => setForm((prev) => ({ ...prev, checkOutTime: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--app-bg)] px-3 py-2">
                <p className="m-0 text-[11px] text-[var(--text-muted)]">Опоздание рассчитывается автоматически</p>
                <p className="m-0 mt-0.5 text-[13px] font-semibold text-[var(--text-main)]">
                  {normalizeTime(form.checkInTime) ? computeDelayTimeFromCheckIn(form.checkInTime) : '00:00'}
                </p>
              </div>

              {formError ? (
                <div className="mt-3 rounded-xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-3 py-2 text-sm">
                  {formError}
                </div>
              ) : null}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={isSubmitting}
                  className="h-12 flex-1 rounded-2xl border border-[var(--line)] bg-white text-[14px] font-bold text-[var(--text-secondary)]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={() => { void handleSave() }}
                  disabled={isSubmitting}
                  className="h-12 flex-1 rounded-2xl border-0 text-[14px] font-bold text-white"
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
