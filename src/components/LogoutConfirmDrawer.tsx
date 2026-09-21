import { Drawer } from 'vaul'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

interface LogoutConfirmDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LogoutConfirmDrawer({ open, onOpenChange }: LogoutConfirmDrawerProps) {
  const { logout } = useAuth()
  const t = useT()

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--surface)] rounded-t-[28px] outline-none flex flex-col">
          <Drawer.Title className="sr-only">{t('logout.srTitle')}</Drawer.Title>
          <Drawer.Description className="sr-only">
            {t('logout.srDescription')}
          </Drawer.Description>
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-[4px] bg-gray-300 rounded-full" />
          </div>
          <div className="px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-red-50 inline-flex items-center justify-center mb-3">
              <Icon icon="mdi:logout" width={24} className="text-red-500" />
            </div>
            <p className="m-0 text-center text-[16px] font-extrabold text-[var(--text-main)]">
              {t('logout.title')}
            </p>
            <p className="m-0 mt-1 text-center text-[12.5px] text-[var(--text-muted)] leading-relaxed">
              {t('logout.text')}
            </p>
            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 h-12 rounded-2xl border border-[var(--line)] bg-[var(--surface)] text-[14px] font-bold text-[var(--text-secondary)] cursor-pointer active:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  logout()
                }}
                className="flex-1 h-12 rounded-2xl border-0 bg-red-500 text-white text-[14px] font-extrabold cursor-pointer active:scale-[0.985]"
              >
                {t('logout.confirm')}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
