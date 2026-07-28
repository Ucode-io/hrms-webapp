import { Navigate, Route, Routes, HashRouter } from 'react-router-dom'
import { CompanyProvider } from './context/CompanyContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppShell } from './components/AppShell'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LoginPage } from './pages/LoginPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

function AuthGate() {
  const { isAuthorized } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthorized ? <Navigate to="/home" replace /> : <LoginPage />}
      />
      <Route path="/*" element={<AppShell />} />
    </Routes>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        {/* AuthProvider снаружи: брендинг компании зависит от залогиненного пользователя. */}
        <AuthProvider>
          <CompanyProvider>
            <AuthGate />
          </CompanyProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  )
}

export default App
