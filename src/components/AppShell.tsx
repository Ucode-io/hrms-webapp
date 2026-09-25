import { useMemo } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { App, Page } from 'konsta/react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { AppHeader } from './AppHeader'
import { PageHeader } from './PageHeader'
import { AppTabbar } from './AppTabbar'
import { HomePage } from '../pages/HomePage'
import { PayrollPage } from '../pages/PayrollPage'
import { MorePage } from '../pages/MorePage'
import { ProfilePage } from '../pages/ProfilePage'
import { SportPage } from '../pages/SportPage'
import { OrgStructurePage } from '../pages/OrgStructurePage'
import { ContactsPage } from '../pages/ContactsPage'
import { TimePage } from '../pages/TimePage'
import { KpiPage } from '../pages/KpiPage'
import { TasksPage } from '../pages/TasksPage'
import { DocumentsPage } from '../pages/DocumentsPage'
import { PropertyPage } from '../pages/PropertyPage'
import { SurveysPage } from '../pages/SurveysPage'
import { SurveyTakePage } from '../pages/SurveyTakePage'
import { TrainingsPage } from '../pages/TrainingsPage'
import { TrainingDetailPage } from '../pages/TrainingDetailPage'
import { KnowledgePage } from '../pages/KnowledgePage'
import { CopilotPage } from '../pages/CopilotPage'
import { KnowledgeArticlePage } from '../pages/KnowledgeArticlePage'
import { NewsPage } from '../pages/NewsPage'
import { MyDataPage } from '../pages/MyDataPage'
import { LanguageThemePage } from '../pages/LanguageThemePage'
import { PlaceholderPage } from '../pages/PlaceholderPage'
import { CalendarPage } from '../pages/CalendarPage'
import { TasksCalendarPage } from '../pages/TasksCalendarPage'
import { startRoute } from '../telegram/startParam'
import { useT, type TKey } from '../i18n'

function detectKonstaTheme(): 'ios' | 'material' {
  if (typeof navigator === 'undefined') return 'material'
  const ua = navigator.userAgent.toLowerCase()
  const plat = navigator.platform.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua) || (plat === 'macintel' && navigator.maxTouchPoints > 1)) return 'ios'
  return 'material'
}

const PAGE_TITLES: Record<string, TKey> = {
  '/time': 'page.time',
  '/payroll': 'page.payroll',
  '/more': 'page.more',
  '/profile': 'page.profile',
  '/sport': 'page.sport',
  '/org-structure': 'page.orgStructure',
  '/contacts': 'page.contacts',
  '/kpi': 'page.kpi',
  '/tasks': 'page.tasks',
  '/documents': 'page.documents',
  '/property': 'page.property',
  '/surveys': 'page.surveys',
  '/trainings': 'page.trainings',
  '/knowledge': 'page.knowledge',
  '/copilot': 'page.copilot',
  '/news': 'page.news',
  '/profile/my-data': 'page.myData',
  '/kiosk-mode': 'page.kiosk',
  '/language-theme': 'page.languageTheme',
  '/tracking-settings': 'page.tracking',
  '/change-password': 'page.changePassword',
  '/privacy-policy': 'page.privacy',
  '/support': 'page.support',
  '/company': 'page.company',
  '/reports': 'page.reports',
  '/calendar': 'page.calendar',
  '/tasks-calendar': 'page.tasksCalendar',
}

function CurrentHeader() {
  const { pathname } = useLocation()
  const t = useT()
  const isHome = pathname === '/home' || pathname === '/'

  if (isHome) return <AppHeader />

  const isSurveyTake = /^\/surveys\/.+/.test(pathname)
  const isTrainingDetail = /^\/trainings\/.+/.test(pathname)
  const isKnowledgeArticle = /^\/knowledge\/.+/.test(pathname)
  const titleKey: TKey | '' = isSurveyTake
    ? 'page.surveyTake'
    : isTrainingDetail
      ? 'page.trainingDetail'
      : isKnowledgeArticle
        ? 'page.knowledgeArticle'
        : PAGE_TITLES[pathname] || ''
  const title = titleKey ? t(titleKey) : ''
  const shouldShowBack =
    pathname === '/time' ||
    pathname === '/payroll' ||
    pathname === '/sport' ||
    pathname === '/org-structure' ||
    pathname === '/contacts' ||
    pathname === '/kpi' ||
    pathname === '/tasks' ||
    pathname === '/documents' ||
    pathname === '/property' ||
    pathname === '/surveys' ||
    pathname === '/trainings' ||
    pathname === '/knowledge' ||
    pathname === '/copilot' ||
    pathname === '/news' ||
    pathname === '/profile' ||
    pathname === '/profile/my-data' ||
    pathname === '/kiosk-mode' ||
    pathname === '/language-theme' ||
    pathname === '/tracking-settings' ||
    pathname === '/change-password' ||
    pathname === '/privacy-policy' ||
    pathname === '/support' ||
    pathname === '/company' ||
    pathname === '/reports' ||
    pathname === '/calendar' ||
    pathname === '/tasks-calendar' ||
    isSurveyTake ||
    isTrainingDetail ||
    isKnowledgeArticle ||
    !Object.keys(PAGE_TITLES).includes(pathname)
  return <PageHeader title={title} showBack={shouldShowBack} />
}

/**
 * Маршруты, которым принадлежит глобальный таббар — то есть те, между которыми
 * он и переключает. Раньше здесь был перевёрнутый список: таббар рисовался
 * везде, кроме перечисленных исключений, и потому вылезал на внутренних
 * экранах, где по макету его нет (Опросы, Тренинги, Календарь, Документы,
 * Имущество, База знаний, KPI — уходят назад стрелкой в шапке).
 *
 * Экрану, которому нужны собственные вкладки, глобальный таббар не подходит:
 * он рисует свои внутри страницы — так устроено «Время» (Заявки/Табель/График)
 * и так же задуманы «Отчёты» (Обзор/Продажи/Финансы/Операции) в макете.
 */
const TABBAR_ROUTES = new Set(['/more'])

export function AppShell() {
  const { isAuthorized } = useAuth()
  const t = useT()
  const konstaTheme = useMemo(() => detectKonstaTheme(), [])
  const { resolvedTheme } = useTheme()
  const { pathname } = useLocation()

  if (!isAuthorized) return <Navigate to="/login" replace />

  const hasTabbar = TABBAR_ROUTES.has(pathname)

  return (
    <App theme={konstaTheme} dark={resolvedTheme === 'dark'} safeAreas className="webview-root">
      <Page className="flex flex-col min-h-svh bg-[var(--app-bg)]">
        <CurrentHeader />

        <main
          className={
            pathname === '/org-structure'
              ? 'flex-1 pb-[84px] flex flex-col'
              : // Запас снизу — ровно под таббар, и только там, где он есть.
                // Без этого страницы без таббара упирались в пустые 100px.
                `flex-1 px-4 pt-4 flex flex-col gap-4 ${hasTabbar ? 'pb-[100px]' : 'pb-6'}`
          }
        >
          <Routes>
            {/* Deep link из уведомления приходит на «/» — ведём сразу на задачи. */}
            <Route index element={<Navigate to={startRoute()} replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/absence" element={<Navigate to="/time" replace />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/more" element={<MorePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/my-data" element={<MyDataPage />} />
            <Route path="/kiosk-mode" element={<PlaceholderPage title={t('page.kiosk')} />} />
            <Route path="/language-theme" element={<LanguageThemePage />} />
            <Route path="/tracking-settings" element={<PlaceholderPage title={t('page.tracking')} />} />
            <Route path="/change-password" element={<PlaceholderPage title={t('page.changePassword')} />} />
            <Route path="/privacy-policy" element={<PlaceholderPage title={t('page.privacy')} />} />
            <Route path="/support" element={<PlaceholderPage title={t('page.support')} />} />
            <Route path="/company" element={<PlaceholderPage title={t('page.company')} />} />
            <Route path="/reports" element={<PlaceholderPage title={t('page.reports')} />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/tasks-calendar" element={<TasksCalendarPage />} />
            <Route path="/sport" element={<SportPage />} />
            <Route path="/org-structure" element={<OrgStructurePage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/kpi" element={<KpiPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/property" element={<PropertyPage />} />
            <Route path="/surveys" element={<SurveysPage />} />
            <Route path="/surveys/:id" element={<SurveyTakePage />} />
            <Route path="/trainings" element={<TrainingsPage />} />
            <Route path="/trainings/:id" element={<TrainingDetailPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/knowledge/:id" element={<KnowledgeArticlePage />} />
            <Route path="/copilot" element={<CopilotPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </main>

        {hasTabbar && <AppTabbar />}
      </Page>
    </App>
  )
}
