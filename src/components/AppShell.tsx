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
import { KpiPage } from '../pages/KpiPage'
import { TasksPage } from '../pages/TasksPage'
import { DocumentsPage } from '../pages/DocumentsPage'
import { PropertyPage } from '../pages/PropertyPage'
import { SurveysPage } from '../pages/SurveysPage'
import { SurveyTakePage } from '../pages/SurveyTakePage'
import { TrainingsPage } from '../pages/TrainingsPage'
import { TrainingDetailPage } from '../pages/TrainingDetailPage'

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
  '/kpi': 'KPI',
  '/tasks': 'Задачи',
  '/documents': 'Документы',
  '/property': 'Имущество',
  '/surveys': 'Опросы',
  '/trainings': 'Тренинги',
}

function CurrentHeader() {
  const { pathname } = useLocation()
  const isHome = pathname === '/home' || pathname === '/'

  if (isHome) return <AppHeader />

  const isSurveyTake = /^\/surveys\/.+/.test(pathname)
  const isTrainingDetail = /^\/trainings\/.+/.test(pathname)
  const title = isSurveyTake
    ? 'Прохождение опроса'
    : isTrainingDetail
      ? 'Тренинг'
      : PAGE_TITLES[pathname] || ''
  const shouldShowBack =
    pathname === '/sport' ||
    pathname === '/org-structure' ||
    pathname === '/kpi' ||
    pathname === '/tasks' ||
    pathname === '/documents' ||
    pathname === '/property' ||
    pathname === '/surveys' ||
    pathname === '/trainings' ||
    isSurveyTake ||
    isTrainingDetail ||
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
            <Route path="/kpi" element={<KpiPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/property" element={<PropertyPage />} />
            <Route path="/surveys" element={<SurveysPage />} />
            <Route path="/surveys/:id" element={<SurveyTakePage />} />
            <Route path="/trainings" element={<TrainingsPage />} />
            <Route path="/trainings/:id" element={<TrainingDetailPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </main>

        <AppTabbar />
      </Page>
    </App>
  )
}
