import { clearSession } from '../auth/session'

type UnauthorizedHandler = () => void

let handler: UnauthorizedHandler | null = null
let handling = false

/**
 * Register the app-level logout to run when an authenticated request gets a
 * 401. AuthContext registers its logout here on mount and clears it on unmount.
 */
export const setUnauthorizedHandler = (fn: UnauthorizedHandler | null): void => {
  handler = fn
}

/**
 * Called by the authenticated axios interceptor on a 401. Hard-clears the
 * persisted session (so a reload can't restore the dead token) and routes the
 * user back to login — via the registered React handler when available, or a
 * full reload as a fallback. Re-entrancy guarded so a burst of parallel 401s
 * logs the user out only once.
 */
export const handleUnauthorized = (): void => {
  if (handling) return
  handling = true

  clearSession()
  localStorage.removeItem('user_profile')

  if (handler) {
    handler()
  } else {
    window.location.replace('/')
  }

  // Allow future 401s (e.g. after re-login) to trigger logout again.
  setTimeout(() => {
    handling = false
  }, 0)
}
