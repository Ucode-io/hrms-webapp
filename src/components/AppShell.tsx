import { useMemo } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { App, Page } from 'konsta/react'
import { useAuth } from '../context/AuthContext'
import { AppHeader } from './AppHeader'
import { PageHeader } from './PageHeader'
import { AppTabbar } from './AppTabbar'
import { HomePage } from '../pages/HomePage'
import { AbsencePage } from '../pages/AbsencePage'
import { PayrollPage } from '../pages/PayrollPage'
import { MorePage } from '../pages/MorePage'
import { ProfilePage } from '../pages/ProfilePage'
import { SportPage } from '../pages/SportPage'
import { OrgStructurePage } from '../pages/OrgStructurePage'
import { TimePage } from '../pages/TimePage'

function detectKonstaTheme(): 'ios' | 'material' {
  if (typeof navigator === 'undefined') return 'material'
  const ua = navigator.userAgent.toLowerCase()
  const plat = navigator.platform.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua) || (plat === 'macintel' && navigator.maxTouchPoints > 1)) return 'ios'
  return 'material'
}

const PAGE_TITLES: Record<string, string> = {
  '/absence': 'Отпуск',
  '/time': 'Учёт времени',
  '/payroll': 'Зарплата',
  '/more': 'Ещё',
  '/profile': 'Профиль',
  '/sport': 'Спорт',
  '/org-structure': 'Орг структура',
}

function CurrentHeader() {
  const { pathname } = useLocation()
  const isHome = pathname === '/home' || pathname === '/'

  if (isHome) return <AppHeader />

  const title = PAGE_TITLES[pathname] || ''
  const shouldShowBack =
    pathname === '/sport' ||
    pathname === '/org-structure' ||
    !Object.keys(PAGE_TITLES).includes(pathname)
  return <PageHeader title={title} showBack={shouldShowBack} />
}

export function AppShell() {
  const { isAuthorized } = useAuth()
  const konstaTheme = useMemo(() => detectKonstaTheme(), [])
  const { pathname } = useLocation()

  if (!isAuthorized) return <Navigate to="/login" replace />

  return (
    <App theme={konstaTheme} safeAreas className="webview-root">
      <Page className="flex flex-col min-h-svh bg-[var(--app-bg)]">
        <CurrentHeader />

        <main
          className={
            pathname === '/org-structure'
              ? 'flex-1 pb-[84px] flex flex-col'
              : 'flex-1 px-4 pt-4 pb-[100px] flex flex-col gap-4'
          }
        >
          <Routes>
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/absence" element={<AbsencePage />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/sport" element={<SportPage />} />
            <Route path="/org-structure" element={<OrgStructurePage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </main>

        <AppTabbar />
      </Page>
    </App>
  )
}
