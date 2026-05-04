interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="animate-fade-in-up flex flex-col items-center justify-center py-12 px-4 rounded-2xl border border-[var(--line)] bg-white text-center">
      <span className="text-4xl mb-3">🚧</span>
      <p className="m-0 text-base font-bold text-[var(--text-main)]">{title}</p>
      <p className="m-0 mt-1.5 text-sm text-[var(--text-muted)]">Раздел в разработке</p>
    </div>
  )
}
