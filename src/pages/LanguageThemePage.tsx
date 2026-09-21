import { Icon } from '@iconify/react'
import { useTheme, type ThemeMode } from '../context/ThemeContext'
import { useI18n, LANGUAGES, type TKey } from '../i18n'

const THEME_OPTIONS: { value: ThemeMode; label: TKey; icon: string }[] = [
  { value: 'light', label: 'settings.themeLight', icon: 'mdi:white-balance-sunny' },
  { value: 'dark', label: 'settings.themeDark', icon: 'mdi:weather-night' },
  { value: 'system', label: 'settings.themeSystem', icon: 'mdi:theme-light-dark' },
]

export function LanguageThemePage() {
  const { mode, setMode } = useTheme()
  // Язык живёт в контексте, а не в локальном стейте: выбор должен перерисовать
  // весь интерфейс, а не только эту страницу.
  const { lang, setLang, t } = useI18n()

  return (
    <div className="flex flex-col gap-3 animate-fade-in-up">
      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('settings.theme')}</p>
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
                {t(opt.label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--line)]">
          <p className="m-0 text-[15px] font-extrabold text-[var(--text-main)]">{t('settings.language')}</p>
        </div>
        <div className="px-5 py-2">
          {LANGUAGES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLang(opt.value)}
              className="flex items-center justify-between w-full py-3 border-0 border-b border-[var(--line)] last:border-0 bg-transparent text-left cursor-pointer"
            >
              {/* Названия языков намеренно не переводятся: «O'zbekcha» ищут
                  глазами именно так, на любом текущем языке. */}
              <span className="text-[14px] font-semibold text-[var(--text-main)]">{opt.label}</span>
              {lang === opt.value && (
                <Icon icon="mdi:check-circle" width={20} className="text-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
