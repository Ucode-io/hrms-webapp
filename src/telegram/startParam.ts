// Хвост deep link'а из уведомления (`?startapp=task_<guid>`) Telegram кладёт в
// `initDataUnsafe.start_param`. Забираем его один раз при старте: до экрана
// задач пользователь может пройти через логин, а `window.Telegram` переживает
// клиентскую навигацию, но не перезагрузку — поэтому перекладываем в
// sessionStorage.
//
// Подпись здесь не нужна: это не идентификация, а «какой экран открыть».
// Подставленный чужой guid покажет только то, что и так доступно сотруднику.

const KEY = 'telegram_pending_task'
const PREFIX = 'task_'

export function capturePendingTaskId(): void {
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  if (typeof startParam === 'string' && startParam.startsWith(PREFIX)) {
    sessionStorage.setItem(KEY, startParam.slice(PREFIX.length))
  }
}

/** Для редиректов: есть ли куда вести, не расходуя ссылку. */
export function hasPendingTaskId(): boolean {
  return sessionStorage.getItem(KEY) !== null
}

/** Для экрана задач: забрать и погасить, чтобы шторка не открывалась снова. */
export function takePendingTaskId(): string | null {
  const id = sessionStorage.getItem(KEY)
  if (id !== null) sessionStorage.removeItem(KEY)
  return id
}
