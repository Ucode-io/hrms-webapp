import { useState, useMemo, useEffect, useRef } from 'react'
import { useAuth, getDisplayName, getInitials } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { updateUserBase, uploadFile } from '../api/dashboardService'
import { Icon } from '@iconify/react'

function getRelationTitle(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const source = value as Record<string, unknown>
  return typeof source.title === 'string' ? source.title : ''
}

function formatDateToRu(isoString: unknown): string {
  if (typeof isoString !== 'string' || !isoString) return '—'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '—'
  const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
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
  if (y > 0) parts.push(`${y} г.`)
  if (m > 0) parts.push(`${m} мес.`)
  if (d > 0 && y === 0) parts.push(`${d} дн.`)
  if (parts.length === 0) return 'Только начал(а)'
  return parts.join(', ')
}

export function ProfilePage() {
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
      setError('Не удалось сохранить изменения')
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
      setError('Не удалось загрузить фото')
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
          className="mobile-input h-12 rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors"
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
          className="mobile-input h-12 rounded-2xl border border-[var(--line)] bg-gray-50 px-4 text-[14px] font-medium text-[var(--text-main)] outline-none focus:border-[var(--accent)] transition-colors"
        >
          <option value="">Выберите</option>
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

  const jobTitle = getRelationTitle(profile?.roles_id_data) || (typeof profile?.roles_id === 'string' ? profile.roles_id : 'Сотрудник')
  const location = getRelationTitle(profile?.locations_id_data) || (typeof profile?.locations_id === 'string' ? profile.locations_id : '—')
  
  const workingData = {
    startDate: typeof profile?.contract_date === 'string' ? profile.contract_date : '',
    jobType: getRelationTitle(profile?.employment_types_id_data),
    position: getRelationTitle(profile?.roles_id_data),
    level: getRelationTitle(profile?.levels_id_data),
    department: getRelationTitle(profile?.departments_id_data),
    unit: getRelationTitle(profile?.divisions_id_data),
    location: getRelationTitle(profile?.locations_id_data),
    manager: getRelationTitle(profile?.managers_id_data),
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in-up pb-10">
      
      {/* Header Actions */}
      <div className="flex items-center justify-end px-1">
        {!isEditing ? (
          <button 
            type="button" 
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--line)] bg-white text-[13px] font-bold text-[var(--text-main)] active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            <Icon icon="mdi:pencil-outline" width={16} />
            Изменить
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded-xl border border-[var(--line)] bg-white text-[13px] font-bold text-[var(--text-muted)] active:scale-95 transition-all cursor-pointer"
            >
              Отмена
            </button>
            <button 
              type="button" 
              disabled={isSaving}
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-xl border-0 text-white text-[13px] font-bold active:scale-95 transition-all cursor-pointer shadow-md"
              style={{ background: company.mainColor }}
            >
              {isSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {!isEditing ? (
        <>
          {/* Avatar and Main Info */}
          <div className="profile-banner animate-fade-in-up shadow-sm mb-2 rounded-[24px]">
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-[88px] h-[88px] shrink-0 rounded-[28px] overflow-hidden bg-white/20 border-2 border-white/30 flex items-center justify-center text-white font-extrabold text-2xl backdrop-blur-sm">
                {avatar ? (
                  <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span>{getInitials(profile)}</span>
                )}
              </div>
              <h1 className="m-0 mt-4 text-[22px] font-black text-white tracking-tight text-center drop-shadow-sm">
                {displayName}
              </h1>
              <div className="flex flex-wrap items-center justify-center gap-3 mt-2 text-[13px] font-semibold text-white/90">
                <span className="flex items-center gap-1.5"><Icon icon="mdi:briefcase-outline" /> {jobTitle}</span>
                <span className="flex items-center gap-1.5"><Icon icon="mdi:map-marker-outline" /> {location}</span>
              </div>
            </div>
          </div>

          {/* Personal Info Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30">
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Личное</p>
            </div>
            <div className="px-5 py-2">
              {renderReadField('ID сотрудника', profile?.guid as string)}
              {renderReadField('Фамилия', profile?.second_name as string)}
              {renderReadField('Имя', profile?.first_name as string)}
              {renderReadField('Отчество', profile?.middle_name as string)}
              {renderReadField('Дата рождения', formatDateToRu(profile?.birthday))}
              {renderReadField('Пол', profile?.gender === 'male' ? 'Мужской' : profile?.gender === 'female' ? 'Женский' : '—')}
              <div className="flex flex-col gap-1 py-3 border-b border-[var(--line)] last:border-0">
                <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Статус</span>
                <span className="text-[13px] font-bold text-emerald-600">Активный</span>
              </div>
            </div>
          </section>

          {/* Working Data Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30">
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Рабочие данные</p>
            </div>
            <div className="px-5 py-2">
              {renderReadField('Дата начала', formatDateToRu(workingData.startDate))}
              {renderReadField('Тип работы', workingData.jobType)}
              {renderReadField('Должность', workingData.position)}
              {renderReadField('Уровень', workingData.level)}
              {renderReadField('Департамент', workingData.department)}
              {renderReadField('Подразделение', workingData.unit)}
              {renderReadField('Локация', workingData.location)}
              {renderReadField('Срок работы', calcWorkPeriod(workingData.startDate))}
            </div>
          </section>

          {/* Contacts Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30 flex items-center gap-2">
              <Icon icon="mdi:phone-outline" width={18} className="text-blue-500" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Контакты</p>
            </div>
            <div className="px-5 py-2">
              {renderReadField('Эл. почта', profile?.email as string)}
              {renderReadField('Личная эл. почта', profile?.personal_email as string)}
              {renderReadField('Мобильный телефон', profile?.phone as string)}
              {renderReadField('Рабочий телефон', profile?.work_phone as string)}
              {renderReadField('Телеграм', profile?.telegram as string)}
            </div>
          </section>

          {/* Education Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30 flex items-center gap-2">
              <Icon icon="mdi:school-outline" width={18} className="text-emerald-500" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Образование</p>
            </div>
            <div className="px-5 py-5">
               <p className="m-0 text-[14px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                 {(profile?.education as string) || 'Нет добавленной информации'}
               </p>
            </div>
          </section>

          {/* Certificates Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30 flex items-center gap-2">
              <Icon icon="mdi:certificate-outline" width={18} className="text-amber-500" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Лицензии и сертификаты</p>
            </div>
            <div className="px-5 py-5">
               <p className="m-0 text-[14px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                 {(profile?.certificates as string) || 'Нет добавленных сертификатов'}
               </p>
            </div>
          </section>

          {/* Interests Read */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30 flex items-center gap-2">
              <Icon icon="mdi:heart-outline" width={18} className="text-rose-500" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Интересы</p>
            </div>
            <div className="px-5 py-5">
               <p className="m-0 text-[14px] text-[var(--text-main)] leading-relaxed whitespace-pre-wrap">
                 {(profile?.interests as string) || 'Нет добавленных интересов'}
               </p>
            </div>
          </section>

        </>
      ) : (
        <>
          {/* Edit Mode Avatar */}
          <div className="flex flex-col gap-4 bg-white rounded-[24px] border border-[var(--line)] p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden border border-[var(--line)] flex items-center justify-center text-[var(--text-main)] font-extrabold text-xl bg-gray-50 shadow-inner relative group">
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
                  className="px-3 py-2 rounded-xl border border-[var(--line)] bg-white text-[12px] font-bold text-[var(--text-main)] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Icon icon="mdi:camera-outline" width={16} />
                  {isUploading ? 'Загрузка...' : 'Изменить фото'}
                </button>
              </div>
            </div>
          </div>

          {/* Basic Info Edit */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30">
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Личное</p>
            </div>
            <div className="p-5 flex flex-col gap-1">
              {renderField('Фамилия', 'second_name', 'text', true)}
              {renderField('Имя', 'first_name', 'text', true)}
              {renderField('Отчество', 'middle_name')}
              {renderField('Дата рождения', 'birthday', 'date')}
              {renderSelect('Пол', 'gender', [
                { value: 'male', label: 'Мужчина' },
                { value: 'female', label: 'Женщина' }
              ])}
            </div>
          </section>

          {/* Contacts Edit */}
          <section className="rounded-[24px] border border-[var(--line)] bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-[var(--line)] bg-gray-50/30 flex items-center gap-2">
              <Icon icon="mdi:phone-outline" width={18} className="text-blue-500" />
              <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Контакты</p>
            </div>
            <div className="p-5 flex flex-col gap-1">
              {renderField('Эл. почта', 'email', 'email', true)}
              {renderField('Личная эл. почта', 'personal_email', 'email')}
              {renderField('Мобильный телефон', 'phone', 'tel')}
              {renderField('Рабочий телефон', 'work_phone', 'tel')}
              {renderField('Телеграм', 'telegram')}
            </div>
          </section>

        </>
      )}

    </div>
  )
}
