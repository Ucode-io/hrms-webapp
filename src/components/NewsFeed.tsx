import { Preloader } from 'konsta/react'
import { useAuth } from '../context/AuthContext'

function toPlainText(value: string): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatFeedDate(value: string): string {
  if (!value) return 'Без даты'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Без даты'
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function NewsFeed() {
  const { newsFeed, isNewsLoading, newsError } = useAuth()

  return (
    <section className="animate-fade-in-up animate-delay-2 flex flex-col gap-2.5">
      <div>
        <p className="m-0 text-[17px] font-extrabold text-[var(--text-main)] tracking-tight">
          Лента новостей
        </p>
        <p className="m-0 mt-1 text-xs font-medium text-[var(--text-muted)]">
          Корпоративные объявления и события
        </p>
      </div>

      {isNewsLoading ? (
        <div className="flex justify-center items-center py-8 rounded-2xl border border-[var(--line)] bg-white">
          <Preloader />
        </div>
      ) : newsError ? (
        <div className="rounded-2xl border border-[var(--error-line)] bg-[var(--error-bg)] text-[var(--error-text)] px-4 py-3 text-sm">
          {newsError}
        </div>
      ) : newsFeed.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-white py-8 text-center text-sm text-[var(--text-muted)]">
          Пока нет активных новостей
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {newsFeed.map((item, idx) => (
            <div
              key={item.guid}
              className={`rounded-[20px] border border-[var(--line)] bg-white overflow-hidden shadow-sm transition-transform duration-150 active:scale-[0.985] animate-fade-in-up animate-delay-${Math.min(idx + 1, 4)}`}
            >
              {item.photo && (
                <div className="w-full aspect-video overflow-hidden bg-gradient-to-br from-[var(--app-bg)] to-[var(--accent-light)]">
                  <img
                    src={item.photo}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-300 active:scale-[1.02]"
                  />
                </div>
              )}
              <div className="px-4 py-3.5">
                <p className="m-0 text-[15px] font-bold leading-snug text-[var(--text-main)]">
                  {item.title}
                </p>
                <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)] line-clamp-3">
                  {toPlainText(item.text) || '—'}
                </p>
                <p className="m-0 mt-2.5 text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">
                  {formatFeedDate(item.published_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
