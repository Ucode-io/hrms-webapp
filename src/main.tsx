import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { capturePendingTaskId } from './telegram/startParam'

// ponytail: минимальная типизация SDK вместо @types/telegram-web-app —
// используем ровно три метода и одно поле.
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        // Bot API 7.7, в старых клиентах метода нет — зовём опционально.
        disableVerticalSwipes?: () => void
        // Подписанная строка с данными пользователя. Намеренно берём её, а не
        // initDataUnsafe.user.id: id оттуда подделывается обычным curl, а эту
        // строку бек проверяет HMAC-ом по токену бота и достаёт chat_id сам.
        initData: string
        // Из неподписанной части берём только start_param — он решает, какой
        // экран открыть, и подделывать в нём нечего.
        initDataUnsafe?: { start_param?: string }
        // Bot API 6.1, в старых клиентах нет — зовём опционально.
        HapticFeedback?: { notificationOccurred?: (type: 'error' | 'success' | 'warning') => void }
        // Bot API 8.0. Внутри Telegram это единственный источник координат:
        // navigator.geolocation вебвью не отдаёт, его колбэк не приходит вовсе.
        LocationManager?: {
          isLocationAvailable?: boolean
          isAccessGranted?: boolean
          // Колбэк `init` приходит только на первой инициализации за сессию
          // мини-аппа, поэтому нужен и сам флаг: по нему видно, что звать
          // `init` второй раз бессмысленно и можно идти сразу за координатой.
          isInited?: boolean
          init: (callback?: () => void) => unknown
          getLocation: (
            callback: (location: { latitude: number; longitude: number } | null) => void,
          ) => unknown
        }
      }
    }
  }
}

// Telegram дописывает свои параметры в хеш (`#tgWebAppData=...&tgWebAppVersion=...`),
// а у нас на хеше висит роутер — без чистки HashRouter пытается открыть
// маршрут `/tgWebAppData=...`. Чиним до рендера, replaceState — чтобы не
// плодить запись в истории. SDK к этому моменту хеш уже разобрал: его
// <script> в index.html блокирующий, а этот модуль — defer.
if (window.location.hash.includes('tgWebApp')) {
  const { pathname, search } = window.location
  window.history.replaceState(null, '', `${pathname}${search}#/`)
}

// Вне Telegram window.Telegram нет — обычный webview работает как работал.
const tg = window.Telegram?.WebApp
if (tg) {
  // До рендера: роутер уже на первом кадре решает, вести на /home или /tasks.
  capturePendingTaskId()
  tg.ready()
  tg.expand() // без expand мини-апп открывается на половину экрана
  // Иначе свайп вниз по скроллящейся странице закрывает мини-апп.
  tg.disableVerticalSwipes?.()
}

// В iOS-вебвью (и в Telegram) клавиатура не сжимает layout viewport — только
// visual. Страница об этом не знает, скроллить некуда, и инпут остаётся под
// клавиатурой. Отдаём её высоту в CSS-переменную: вёрстка добавляет её в
// padding-bottom скролл-контейнера, дальше iOS сам доводит фокус до вида.
const viewport = window.visualViewport
if (viewport) {
  const syncKeyboardInset = () => {
    const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
  }
  viewport.addEventListener('resize', syncKeyboardInset)
  viewport.addEventListener('scroll', syncKeyboardInset)
  syncKeyboardInset()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
