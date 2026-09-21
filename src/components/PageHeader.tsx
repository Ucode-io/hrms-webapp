import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'

interface PageHeaderProps {
  title: string
  showBack?: boolean
  rightSlot?: React.ReactNode
}

export function PageHeader({ title, showBack = true, rightSlot }: PageHeaderProps) {
  const navigate = useNavigate()
  const t = useT()

  return (
    <header className="shrink-0 sticky top-0 z-20 flex items-center h-[52px] px-4 border-b border-[var(--line)]/60 bg-[var(--surface)]/90 backdrop-blur-xl">
      {/* Left */}
      <div className="w-10 flex items-center justify-start">
        {showBack && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center border-0 bg-transparent text-[var(--text-main)] cursor-pointer active:bg-gray-100 transition-colors"
            aria-label={t('common.back')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Center */}
      <p className="flex-1 m-0 text-center text-[16px] font-bold text-[var(--text-main)] truncate">
        {title}
      </p>

      {/* Right */}
      <div className="w-10 flex items-center justify-end">
        {rightSlot}
      </div>
    </header>
  )
}
