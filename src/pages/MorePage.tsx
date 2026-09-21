import { useState } from 'react'
import { useAuth, getDisplayName } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { LogoutConfirmDrawer } from '../components/LogoutConfirmDrawer'
import { useT, type TKey } from '../i18n'

interface ServiceCard {
  label: TKey
  desc: TKey
  icon: string
  onClick?: () => void
}

export function MorePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { company } = useCompany()
  const t = useT()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const displayName = getDisplayName(profile)

  const services: ServiceCard[] = [
    {
      label: 'page.copilot',
      desc: 'more.desc.copilot',
      icon: 'mdi:robot-happy-outline',
      onClick: () => navigate('/copilot'),
    },
    {
      label: 'page.sport',
      desc: 'more.desc.sport',
      icon: 'mdi:dumbbell',
      onClick: () => navigate('/sport'),
    },
    {
      label: 'page.contacts',
      desc: 'more.desc.contacts',
      icon: 'mdi:account-box-multiple-outline',
      onClick: () => navigate('/contacts'),
    },
    {
      label: 'page.orgStructure',
      desc: 'more.desc.orgStructure',
      icon: 'mdi:office-building-outline',
      onClick: () => navigate('/org-structure'),
    },
    {
      label: 'page.kpi',
      desc: 'more.desc.kpi',
      icon: 'mdi:target-arrow',
      onClick: () => navigate('/kpi'),
    },
    {
      label: 'page.tasks',
      desc: 'more.desc.tasks',
      icon: 'mdi:checkbox-marked-outline',
      onClick: () => navigate('/tasks'),
    },
    {
      label: 'page.documents',
      desc: 'more.desc.documents',
      icon: 'mdi:file-document-outline',
      onClick: () => navigate('/documents'),
    },
    {
      label: 'page.property',
      desc: 'more.desc.property',
      icon: 'mdi:package-variant-closed',
      onClick: () => navigate('/property'),
    },
    {
      label: 'page.surveys',
      desc: 'more.desc.surveys',
      icon: 'mdi:clipboard-text-outline',
      onClick: () => navigate('/surveys'),
    },
    {
      label: 'page.trainings',
      desc: 'more.desc.trainings',
      icon: 'mdi:school-outline',
      onClick: () => navigate('/trainings'),
    },
    {
      label: 'page.knowledge',
      desc: 'more.desc.knowledge',
      icon: 'mdi:book-open-page-variant-outline',
      onClick: () => navigate('/knowledge'),
    },
  ]

  return (
    <div className="animate-fade-in-up flex flex-col gap-3.5 flex-1 min-h-0">
      <section className="grid grid-cols-3 gap-2">
          {services.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] min-h-[144px] p-3 text-center cursor-pointer transition-transform active:scale-[0.98]"
            >
              <div
                className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-white shadow-sm"
                style={{ background: `linear-gradient(145deg, ${company.mainColor}, ${company.mainColor}CC)` }}
              >
                <Icon icon={item.icon} width={24} />
              </div>
              <p className="m-0 mt-3 text-[13px] font-bold text-[var(--text-main)] leading-tight">
                {t(item.label)}
              </p>
              <p className="m-0 mt-1 text-[11px] text-[var(--text-muted)] leading-tight">
                {t(item.desc)}
              </p>
            </button>
          ))}
        </section>

      <div className="mt-auto flex flex-col items-center gap-2 pt-6 pb-[calc(8px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-red-200 bg-[var(--surface)] text-red-600 text-[13px] font-bold cursor-pointer transition-all active:scale-95 active:bg-red-50"
        >
          <Icon icon="mdi:logout" width={16} />
          {t('more.logout')}
        </button>
        {displayName ? (
          <p className="m-0 text-[11px] text-[var(--text-muted)]">
            {t('more.signedInAs')} <span className="font-semibold text-[var(--text-secondary)]">{displayName}</span>
          </p>
        ) : null}
      </div>

      <LogoutConfirmDrawer open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm} />
    </div>
  )
}
