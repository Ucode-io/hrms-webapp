import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  defaultCompanyBrand,
  getCompanyBrand,
  resolveBrandCompanyId,
  type CompanyBrand,
} from '../api/companyService'
import { resolveCompaniesId } from '../api/adminRequest'
import { useAuth } from './AuthContext'

const brandCacheKey = (companiesId: string) => `company_brand:${companiesId}`

/* ── Color utils ────────────────────────────── */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16) / 255
    g = parseInt(clean[1] + clean[1], 16) / 255
    b = parseInt(clean[2] + clean[2], 16) / 255
  } else {
    r = parseInt(clean.substring(0, 2), 16) / 255
    g = parseInt(clean.substring(2, 4), 16) / 255
    b = parseInt(clean.substring(4, 6), 16) / 255
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function applyBrandColors(mainColor: string) {
  const { h, s, l } = hexToHsl(mainColor)
  const root = document.documentElement
  root.style.setProperty('--accent', `hsl(${h}, ${s}%, ${l}%)`)
  root.style.setProperty('--accent-dark', `hsl(${h}, ${s}%, ${Math.max(l - 10, 20)}%)`)
  // `--accent-light` и `--accent-soft` отсюда УБРАНЫ намеренно: они выводятся
  // в index.css через color-mix с фоном приложения. Раньше здесь жёстко
  // ставилась светлота 94% — почти белый, и в тёмной теме каждая акцентная
  // плашка светилась белым пятном. Перебить это правилом темы было нельзя:
  // inline-стиль на <html> выигрывает у любого CSS-селектора.
  root.style.setProperty('--gradient-start', `hsl(${h}, ${Math.min(s + 5, 100)}%, ${Math.min(l + 8, 60)}%)`)
  root.style.setProperty('--gradient-end', `hsl(${(h + 20) % 360}, ${Math.min(s + 10, 100)}%, ${Math.max(l - 5, 30)}%)`)
}

/* ── Context ────────────────────────────────── */
interface CompanyContextValue {
  company: CompanyBrand
}

const CompanyContext = createContext<CompanyContextValue>({
  company: defaultCompanyBrand,
})

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  const companiesId = useMemo(
    () => resolveBrandCompanyId(resolveCompaniesId(profile, session?.user_data, session?.user)),
    [profile, session],
  )

  const { data: company = defaultCompanyBrand } = useQuery({
    queryKey: ['companyBrand', companiesId],
    queryFn: async () => {
      try {
        const brand = await getCompanyBrand(companiesId)
        localStorage.setItem(brandCacheKey(companiesId), JSON.stringify(brand))
        return brand
      } catch {
        return defaultCompanyBrand
      }
    },
    initialData: () => {
      try {
        const cached = localStorage.getItem(brandCacheKey(companiesId))
        if (cached) return JSON.parse(cached) as CompanyBrand
      } catch {}
      return undefined
    },
    initialDataUpdatedAt: 0,
  })

  useEffect(() => {
    applyBrandColors(company.mainColor)
  }, [company.mainColor])

  // Обложка компании — тот же источник, что на логин-странице hrms-front.
  // Используется только как фон вокруг мобильной колонки на десктопе
  // (см. `.mobile-frame` в index.css); в webview/на телефоне не видна.
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--company-cover',
      company.companyCover ? `url("${company.companyCover}")` : 'none',
    )
  }, [company.companyCover])

  return (
    <CompanyContext.Provider value={{ company }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  return useContext(CompanyContext)
}
