// 登入狀態的進入點。元件只 import 這個檔案，不直接碰 session.ts 或 api.ts。
import { fetchMe, googleLoginRequest, loginRequest, registerRequest } from './api'
import { clearResultSnapshot } from './resultSnapshot'
import {
  clearSession,
  getToken,
  onUnauthorized,
  session,
  setSession,
  setToken,
} from './session'

export { canUseAi, canUseStock, currentUser, isAdmin, isLoggedIn, session } from './session'

// token 失效（請求收到 401）時要通知的對象。router 用它把停在要登入頁面上的人導去登入頁；
// 這裡不直接動 router，避免 lib 反過來相依 router。主動登出不走這裡，見 logout()
const expiredListeners = new Set<() => void>()

export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener)
  return () => {
    expiredListeners.delete(listener)
  }
}

// 任何請求收到 401 就把本機狀態清乾淨
onUnauthorized(() => {
  const wasLoggedIn = session.user !== null
  clearSession()
  session.ready = true
  // 同一頁好幾個請求一起 401 時只通知一次
  if (wasLoggedIn) {
    expiredListeners.forEach((listener) => listener())
  }
})

export async function login(email: string, password: string) {
  const { token, user } = await loginRequest({ email, password })
  setToken(token)
  setSession(user)
  session.ready = true
  return user
}

// Google 登入或註冊（後端用信箱找帳號，沒有就建立）
export async function loginWithGoogle(credential: string) {
  const { token, user } = await googleLoginRequest(credential)
  setToken(token)
  setSession(user)
  session.ready = true
  return user
}

export async function register(email: string, password: string, displayName?: string) {
  const { token, user } = await registerRequest({ email, password, displayName })
  setToken(token)
  setSession(user)
  session.ready = true
  return user
}

// 使用者主動登出時要通知的對象（例如占卜頁把畫面上的結果清掉）。401 不算，見 onUnauthorized
const logoutListeners = new Set<() => void>()

export function onLogout(listener: () => void) {
  logoutListeners.add(listener)
  return () => {
    logoutListeners.delete(listener)
  }
}

export function logout() {
  clearSession()
  // 暫存的占卜結果屬於上一個人，一起清掉
  clearResultSnapshot()
  session.ready = true
  logoutListeners.forEach((listener) => listener())
}

// 重新整理後用 token 向後端換回使用者。沒有這一步，守衛會把已登入的 admin 誤判成未登入。
let restoring: Promise<void> | null = null

export function restore(): Promise<void> {
  if (session.ready) {
    return Promise.resolve()
  }
  if (restoring) {
    return restoring
  }

  restoring = (async () => {
    const token = getToken()
    if (!token) {
      clearSession()
      session.ready = true
      return
    }

    try {
      const { user } = await fetchMe()
      setSession(user)
    } catch {
      // token 過期、後端還是舊版（沒有 /api/auth/me）都當成未登入
      clearSession()
    } finally {
      session.ready = true
      restoring = null
    }
  })()

  return restoring
}
