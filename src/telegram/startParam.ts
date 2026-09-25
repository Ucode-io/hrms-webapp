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
const ABSENCE_KEY = 'telegram_pending_absence'

export function capturePendingTaskId(): void {
  const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  if (typeof startParam === 'string' && startParam.startsWith(PREFIX)) {
    sessionStorage.setItem(KEY, startParam.slice(PREFIX.length))
  }
}

// Кнопка «Отпроситься» под полем ввода в боте — web_app-кнопка клавиатуры, а
// у неё start_param не бывает, поэтому экран приходит в query: `?open=absence`.
// Из адреса его убираем, иначе перезагрузка мини-аппа откроет шторку снова.
export function capturePendingAbsence(): void {
  const url = new URL(window.location.href)
  if (url.searchParams.get('open') !== 'absence') return
  sessionStorage.setItem(ABSENCE_KEY, '1')
  url.searchParams.delete('open')
  window.history.replaceState(null, '', url)
}

/** Для редиректов: куда вести с «/» и после логина, не расходуя ссылку. */
export function startRoute(): string {
  if (sessionStorage.getItem(KEY) !== null) return '/tasks'
  if (sessionStorage.getItem(ABSENCE_KEY) !== null) return '/time'
  return '/home'
}

/** Для экрана задач: забрать и погасить, чтобы шторка не открывалась снова. */
export function takePendingTaskId(): string | null {
  const id = sessionStorage.getItem(KEY)
  if (id !== null) sessionStorage.removeItem(KEY)
  return id
}

/** Для экрана «Время»: забрать и погасить, как takePendingTaskId. */
export function takePendingAbsence(): boolean {
  const pending = sessionStorage.getItem(ABSENCE_KEY) !== null
  sessionStorage.removeItem(ABSENCE_KEY)
  return pending
}
