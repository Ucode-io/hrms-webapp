import { useState } from 'react'
import { Icon } from '@iconify/react'
import { useTheme, type ThemeMode } from '../context/ThemeContext'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Светлая', icon: 'mdi:white-balance-sunny' },
  { value: 'dark', label: 'Тёмная', icon: 'mdi:weather-night' },
  { value: 'system', label: 'Система', icon: 'mdi:theme-light-dark' },
]

type LanguageCode = 'ru' | 'en' | 'uz'

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'uz', label: "O'zbekcha" },
]

const LANGUAGE_STORAGE_KEY = 'interface_language'

function loadStoredLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored === 'ru' || stored === 'en' || stored === 'uz') return stored
  } catch {}
  return 'ru'
}

export function LanguageThemePage() {
  const { mode, setMode } = useTheme()
  const [language, setLanguage] = useState<LanguageCode>(loadStoredLanguage)

  const selectLanguage = (value: LanguageCode) => {
    setLanguage(value)
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, value)
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-in-up">
      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Тема оформления</p>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-1 rounded-2xl bg-[var(--surface-muted)] p-1">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 border-0 text-[12.5px] font-semibold cursor-pointer transition-all active:scale-95 ${
                  mode === opt.value
                    ? 'bg-[var(--surface)] text-[var(--text-main)] shadow-sm'
                    : 'bg-transparent text-[var(--text-secondary)]'
                }`}
              >
                <Icon icon={opt.icon} width={16} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">Язык интерфейса</p>
        </div>
        <div className="px-5 py-2">
          {LANGUAGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => selectLanguage(opt.value)}
              className="flex items-center justify-between w-full py-3 border-0 border-b border-[var(--line)] last:border-0 bg-transparent text-left cursor-pointer"
            >
              <span className="text-[14px] font-semibold text-[var(--text-main)]">{opt.label}</span>
              {language === opt.value && (
                <Icon icon="mdi:check-circle" width={20} className="text-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
