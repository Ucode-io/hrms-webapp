import { useState } from 'react'
import { App, Button, Link, Page, Preloader } from 'konsta/react'
import { useAuth } from '../context/AuthContext'
import { useCompany } from '../context/CompanyContext'
import { useT } from '../i18n'

function detectKonstaTheme(): 'ios' | 'material' {
  if (typeof navigator === 'undefined') return 'material'
  const ua = navigator.userAgent.toLowerCase()
  const plat = navigator.platform.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua) || (plat === 'macintel' && navigator.maxTouchPoints > 1)) return 'ios'
  return 'material'
}

const konstaTheme = detectKonstaTheme()

export function LoginPage() {
  const { company } = useCompany()
  const { login, loginError, isSubmitting } = useAuth()
  const t = useT()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void login(username, password)
  }

  return (
    <App theme={konstaTheme} safeAreas className="webview-root">
      {/* Ни `min-h-svh`, ни `overflow-hidden`: konsta Page — это уже
          `absolute h-full overflow-auto`, то есть скролл-контейнер ровно по
          вьюпорту. `overflow-hidden` его убивал, и в Telegram на iPhone
          форма просто обрезалась — доскроллить до неё было нельзя. */}
      <Page className="flex flex-col bg-[var(--app-bg)]">
        {/* ── Gradient hero ── */}
        {/* gradient + ::before/::after orbs defined in index.css .auth-hero-section */}
        <div className="auth-hero-section">
          {company.companyCover && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-15 mix-blend-overlay"
              style={{ backgroundImage: `url('${company.companyCover}')` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/10" />

          {/* Logo + name */}
          <div className="relative z-10 flex flex-col items-center text-center px-5 pt-10 pb-[50px] text-white">
            <div className="w-[72px] h-[72px] rounded-[20px] bg-white/20 border-2 border-white/25 backdrop-blur-md flex items-center justify-center mb-4">
              <div className="w-[52px] h-[52px] rounded-[14px] bg-[#fff] flex items-center justify-center overflow-hidden font-extrabold text-base shadow-lg"
                style={{ color: company.mainColor }}>
                {company.logo ? (
                  <img src={company.logo} alt={company.name} className="w-full h-full object-contain" />
                ) : (
                  <span>{company.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
            </div>
            <h1 className="m-0 text-[26px] font-black tracking-tight leading-tight">{company.name}</h1>
            <p className="m-0 mt-1.5 text-sm font-medium opacity-80">{t('login.subtitle')}</p>
          </div>
        </div>

        {/* ── Form card ── */}
        {/* Запас снизу на высоту клавиатуры (--keyboard-inset считает main.tsx):
            без него скроллить некуда и инпут остаётся под клавиатурой. */}
        <div className="relative z-10 flex-1 flex flex-col items-center px-4 pb-[calc(1.5rem+var(--keyboard-inset))] -mt-8">
          <div className="w-full max-w-[440px] bg-[var(--surface)] rounded-[24px] border border-[var(--line)] shadow-xl shadow-black/10 p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Header */}
              <div className="text-center">
                <p className="m-0 text-xl font-extrabold text-[var(--text-main)]">{t('login.title')}</p>
                <p className="m-0 mt-1 text-[13px] text-[var(--text-muted)] font-medium">
                  {t('login.hint')}
                </p>
              </div>

              {/* Error */}
              {loginError && (
                <div className="rounded-xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-3.5 py-2.5 text-[13px] font-medium leading-snug">
                  {loginError}
                </div>
              )}

              {/* Fields */}
              <div className="flex flex-col gap-3.5">
                {/* Login */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]" htmlFor="login-input">
                    {t('login.login')}
                  </label>
                  <input
                    id="login-input"
                    type="text"
                    placeholder={t('login.loginPlaceholder')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="username"
                    className="w-full h-12 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 text-sm font-normal text-[var(--text-main)] outline-none transition-all duration-150 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-65"
                  />
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]" htmlFor="password-input">
                    {t('login.password')}
                  </label>
                  <div className="relative">
                    <input
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="current-password"
                      className="w-full h-12 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 pr-[52px] text-sm font-normal text-[var(--text-main)] outline-none transition-all duration-150 focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-65"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 w-8 h-8 rounded-lg bg-[var(--accent-light)] text-[var(--accent)] flex items-center justify-center border-0 cursor-pointer active:bg-[var(--accent-soft)] transition-colors"
                    >
                      {showPassword ? (
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
                          <path d="M2 2l20 20M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58M9.9 5.2A10.9 10.9 0 0112 5c5.55 0 9.27 5.11 9.42 5.33a1 1 0 010 1.14 16.08 16.08 0 01-4.17 4.23M6.23 6.23A16.52 16.52 0 002.58 10.3a1 1 0 000 1.14C2.73 11.66 6.45 16.77 12 16.77c1.7 0 3.22-.45 4.57-1.08" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4">
                          <path d="M1.5 12s3.9-7 10.5-7 10.5 7 10.5 7-3.9 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Forgot */}
              <div className="flex justify-end -mt-1">
                <Link component="button" type="button" className="border-0 bg-transparent cursor-pointer text-[13px] font-semibold text-[var(--accent)]">
                  {t('login.forgot')}
                </Link>
              </div>

              {/* Submit */}
              <Button
                large
                disabled={isSubmitting}
                className="w-full text-white rounded-xl min-h-[48px] font-bold text-[15px] tracking-[0.01em]"
                style={{ backgroundColor: company.mainColor }}
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Preloader className="h-4 w-4" />
                    {t('login.submitting')}
                  </span>
                ) : (
                  t('login.submit')
                )}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-[11px] text-[var(--text-muted)] text-center">
            © {new Date().getFullYear()} {company.name}. {t('login.rights')}
          </p>
        </div>
      </Page>
    </App>
  )
}
