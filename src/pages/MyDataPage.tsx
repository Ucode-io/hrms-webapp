import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuth, getDisplayName, getInitials } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { updateUserBase, uploadFile } from '../api/dashboardService'
import { Icon } from '@iconify/react'
import { useT, tr, formatDateLocal } from '../i18n'
import { ProfileBanner } from '../components/ProfileBanner'

function getRelationTitle(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const source = value as Record<string, unknown>
  return typeof source.title === 'string' ? source.title : ''
}

function formatDateToRu(isoString: unknown): string {
  if (typeof isoString !== 'string' || !isoString) return '—'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '—'
  const formatter = { format: (value: Date) => formatDateLocal(value, { day: 'numeric', month: 'short', year: 'numeric' }) }
  return formatter.format(date)
}

function calcWorkPeriod(startDate: string): string {
  if (!startDate) return '—'
  const start = new Date(startDate)
  if (isNaN(start.getTime())) return '—'
  const now = new Date()
  let y = now.getFullYear() - start.getFullYear()
  let m = now.getMonth() - start.getMonth()
  let d = now.getDate() - start.getDate()
  if (d < 0) {
    m--
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
    d += prevMonth.getDate()
  }
  if (m < 0) {
    y--
    m += 12
  }
  const parts = []
  if (y > 0) parts.push(tr('myData.years', { count: y }))
  if (m > 0) parts.push(tr('myData.months', { count: m }))
  if (d > 0 && y === 0) parts.push(tr('myData.days', { count: d }))
  if (parts.length === 0) return tr('myData.justStarted')
  return parts.join(', ')
}

export function MyDataPage() {
  const t = useT()

  const { profile, session } = useAuth()
  const { company } = useCompany()

  const employeeGuid = useMemo(() =>
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  , [profile, session])

  const displayName = getDisplayName(profile)
  const avatar =
    (typeof profile?.photo === 'string' && profile.photo.trim()) ||
    (typeof profile?.avatar === 'string' && profile.avatar.trim()) || ''

  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) {
      setFormData({
        second_name: typeof profile.second_name === 'string' ? profile.second_name : '',
        first_name: typeof profile.first_name === 'string' ? profile.first_name : '',
        middle_name: typeof profile.middle_name === 'string' ? profile.middle_name : '',
        birthday: typeof profile.birthday === 'string' ? profile.birthday.slice(0, 10) : '',
        gender: typeof profile.gender === 'string' ? profile.gender : '',
        email: typeof profile.email === 'string' ? profile.email : '',
        personal_email: typeof profile.personal_email === 'string' ? profile.personal_email : '',
        phone: typeof profile.phone === 'string' ? profile.phone : '',
        work_phone: typeof profile.work_phone === 'string' ? profile.work_phone : '',
        telegram: typeof profile.telegram === 'string' ? profile.telegram : '',
        interests: typeof profile.interests === 'string' ? profile.interests : '',
        education: typeof profile.education === 'string' ? profile.education : '',
        certificates: typeof profile.certificates === 'string' ? profile.certificates : '',
      })
    }
  }, [profile, isEditing])

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!employeeGuid) return
    setIsSaving(true)
    setError('')
    try {
      await updateUserBase(employeeGuid, formData)
      setIsEditing(false)
      window.location.reload()
    } catch {
      setError(t('myData.saveFailed'))
      setIsSaving(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setError('')
    try {
      const url = await uploadFile(file)
      if (url) {
        setFormData(prev => ({ ...prev, photo: url, avatar: url }))
        // Also immediately save photo if the user expects it to change without pressing save,
        // but for now we just keep it in formData until they press save.
      }
    } catch {
      setError(t('myData.photoFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  const renderField = (label: string, field: string, type = 'text', required = false) => {
    const val = formData[field] || ''
    return (
      <div className="flex flex-col gap-1.5 pt-2 pb-3">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
          {label} {required && '*'}
        </label>
        <input
          type={type}
          value={val}
          onChange={e => handleChange(field, e.target.value)}
          className="mobile-input h-12 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>
    )
  }

  const renderSelect = (label: string, field: string, options: {value: string, label: string}[]) => {
    const val = formData[field] || ''
    return (
      <div className="flex flex-col gap-1.5 pt-2 pb-3">
        <label className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</label>
        <select
          value={val}
          onChange={e => handleChange(field, e.target.value)}
          className="mobile-input h-12 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors"
        >
          <option value="">{t('myData.choose')}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }

  const renderReadField = (label: string, value: string | undefined | null) => (
    <div className="flex flex-col gap-1 py-3 border-b border-[var(--line)] last:border-0">
      <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{label}</span>
      <span className="text-[14px] font-semibold text-[var(--text-main)]">{value || '—'}</span>
    </div>
  )

  const workingData = {
    startDate: typeof profile?.contract_date === 'string' ? profile.contract_date : '',
    jobType: getRelationTitle(profile?.employment_types_id_data),
    position: getRelationTitle(profile?.roles_id_data),
    level: getRelationTitle(profile?.levels_id_data),
    department: getRelationTitle(profile?.departments_id_data),
    location: getRelationTitle(profile?.locations_id_data),
    manager: getRelationTitle(profile?.managers_id_data),
  }

  return (
    <>
    <div className="flex flex-col gap-5 animate-fade-in-up pb-[92px]">

      {error && (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {!isEditing ? (
        <>
          {/* Profile banner */}
          <ProfileBanner disableNav />

          {/* Personal Info Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.personal')}</p>
            </div>
            <div className="px-5 py-2">
              {renderReadField(t('myData.employeeId'), profile?.guid as string)}
              {renderReadField(t('myData.lastName'), profile?.second_name as string)}
              {renderReadField(t('myData.firstName'), profile?.first_name as string)}
              {renderReadField(t('myData.middleName'), profile?.middle_name as string)}
              {renderReadField(t('myData.birthday'), formatDateToRu(profile?.birthday))}
              {renderReadField(t('myData.gender'), profile?.gender === 'male' ? t('myData.male') : profile?.gender === 'female' ? t('myData.female') : '—')}
              <div className="flex flex-col gap-1 py-3 border-b border-[var(--line)] last:border-0">
                <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{t('myData.status')}</span>
                <span className="mt-0.5 inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-3 py-1 text-[12px] font-bold text-emerald-400">{t('myData.active')}</span>
              </div>
            </div>
          </section>

          {/* Working Data Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.workData')}</p>
            </div>
            <div className="px-5 py-2">
              {renderReadField(t('myData.startDate'), formatDateToRu(workingData.startDate))}
              {renderReadField(t('myData.jobType'), workingData.jobType)}
              {renderReadField(t('myData.position'), workingData.position)}
              {renderReadField(t('myData.level'), workingData.level)}
              {renderReadField(t('myData.department'), workingData.department)}
              {renderReadField(t('myData.location'), workingData.location)}
              {renderReadField(t('myData.tenure'), calcWorkPeriod(workingData.startDate))}
            </div>
          </section>

          {/* Contacts Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2">
              <Icon icon="mdi:phone-outline" width={18} className="text-[var(--text-main)]" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.contacts')}</p>
            </div>
            <div className="px-5 py-2">
              {renderReadField(t('myData.email'), profile?.email as string)}
              {renderReadField(t('myData.personalEmail'), profile?.personal_email as string)}
              {renderReadField(t('myData.phone'), profile?.phone as string)}
              {renderReadField(t('myData.workPhone'), profile?.work_phone as string)}
              {renderReadField(t('myData.telegram'), profile?.telegram as string)}
            </div>
          </section>

          {/* Education Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2">
              <Icon icon="mdi:school-outline" width={18} className="text-[var(--text-main)]" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.education')}</p>
            </div>
            <div className="px-5 py-5">
               <p className="m-0 text-[14px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                 {(profile?.education as string) || t('myData.noEducation')}
               </p>
            </div>
          </section>

          {/* Certificates Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2">
              <Icon icon="mdi:certificate-outline" width={18} className="text-[var(--text-main)]" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.certificates')}</p>
            </div>
            <div className="px-5 py-5">
               <p className="m-0 text-[14px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                 {(profile?.certificates as string) || t('myData.noCertificates')}
               </p>
            </div>
          </section>

          {/* Interests Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2">
              <Icon icon="mdi:heart-outline" width={18} className="text-[var(--text-main)]" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.interests')}</p>
            </div>
            <div className="px-5 py-5">
               <p className="m-0 text-[14px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                 {(profile?.interests as string) || t('myData.noInterests')}
               </p>
            </div>
          </section>

        </>
      ) : (
        <>
          {/* Edit Mode Avatar */}
          <div className="flex flex-col gap-4 bg-[var(--surface)] rounded-[24px] border border-[var(--line)] p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden border border-[var(--line)] flex items-center justify-center text-[var(--text-main)] font-extrabold text-xl bg-[var(--surface-muted)] shadow-inner relative group">
                {(formData.photo || formData.avatar || avatar) ? (
                  <img src={formData.photo || formData.avatar || avatar} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span>{getInitials(profile)}</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={e => void handlePhotoUpload(e)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[12px] font-bold text-[var(--text-main)] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Icon icon="mdi:camera-outline" width={16} />
                  {isUploading ? t('myData.uploading') : t('myData.changePhoto')}
                </button>
              </div>
            </div>
          </div>

          {/* Basic Info Edit */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)]">
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.personal')}</p>
            </div>
            <div className="p-5 flex flex-col gap-1">
              {renderField(t('myData.lastName'), 'second_name', 'text', true)}
              {renderField(t('myData.firstName'), 'first_name', 'text', true)}
              {renderField(t('myData.middleName'), 'middle_name')}
              {renderField(t('myData.birthday'), 'birthday', 'date')}
              {renderSelect(t('myData.gender'), 'gender', [
                { value: 'male', label: t('myData.maleOption') },
                { value: 'female', label: t('myData.femaleOption') }
              ])}
            </div>
          </section>

          {/* Contacts Edit */}
          <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-2">
              <Icon icon="mdi:phone-outline" width={18} className="text-[var(--text-main)]" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('myData.contacts')}</p>
            </div>
            <div className="p-5 flex flex-col gap-1">
              {renderField(t('myData.email'), 'email', 'email', true)}
              {renderField(t('myData.personalEmail'), 'personal_email', 'email')}
              {renderField(t('myData.phone'), 'phone', 'tel')}
              {renderField(t('myData.workPhone'), 'work_phone', 'tel')}
              {renderField(t('myData.telegram'), 'telegram')}
            </div>
          </section>

        </>
      )}

    </div>

    {!isEditing ? (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="fixed bottom-[88px] right-4 z-20 w-14 h-14 rounded-2xl border-0 text-white shadow-xl cursor-pointer flex items-center justify-center transition-transform active:scale-90"
        style={{ background: `color-mix(in srgb, ${company.mainColor} 55%, white)` }}
        aria-label={t('myData.editProfile')}
      >
        <Icon icon="mdi:pencil-outline" width={24} />
      </button>
    ) : (
      <div className="fixed bottom-[88px] right-4 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          disabled={isSaving}
          className="h-11 px-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[13px] font-bold text-[var(--text-secondary)] shadow-lg cursor-pointer transition-transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => void handleSave()}
          className="h-11 px-4 rounded-xl border-0 text-white text-[13px] font-bold shadow-xl cursor-pointer transition-transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: company.mainColor }}
        >
          {isSaving ? t('myData.saving') : t('common.save')}
        </button>
      </div>
    )}
    </>
  )
}
