import { Preloader } from 'konsta/react'
import { useAuth } from '../context/AuthContext'
import { NewspaperIcon } from '../components/Icons'

const TINTS = [
  { bg: 'rgba(59,108,245,0.14)', fg: '#6c9bff' },
  { bg: 'rgba(16,185,129,0.14)', fg: '#34d399' },
  { bg: 'rgba(217,119,6,0.14)', fg: '#f0b34d' },
  { bg: 'rgba(139,92,246,0.14)', fg: '#a78bfa' },
]

function toPlainText(value: string): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) return 'Только что'
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} назад`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Вчера'
  if (days < 7) return `${days} ${days < 5 ? 'дня' : 'дней'} назад`
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

export function NewsPage() {
  const { newsFeed, isNewsLoading, newsError } = useAuth()

  return (
    <section className="flex flex-col gap-3">
      <span className="self-start rounded-full bg-[var(--surface-muted)] border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
        {newsFeed.length} {newsFeed.length === 1 ? 'новая' : 'новых'}
      </span>

      {isNewsLoading ? (
        <div className="flex justify-center items-center py-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <Preloader />
        </div>
      ) : newsError ? (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-3 text-sm">
          {newsError}
        </div>
      ) : newsFeed.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-8 text-center text-sm text-[var(--text-muted)]">
          Пока нет активных новостей
        </div>
      ) : (
        newsFeed.map((item, idx) => {
          const tint = TINTS[idx % TINTS.length]
          return (
            <div
              key={item.guid}
              className="flex items-start gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
            >
              <div
                className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
                style={{ background: tint.bg, color: tint.fg }}
              >
                <NewspaperIcon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[15px] font-bold leading-snug text-[var(--text-main)]">
                  {item.title}
                </p>
                <p className="m-0 mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)] line-clamp-2">
                  {toPlainText(item.text) || '—'}
                </p>
                <p className="m-0 mt-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {formatRelativeTime(item.published_at)}
                </p>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
