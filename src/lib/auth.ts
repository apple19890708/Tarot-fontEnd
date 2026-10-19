// 登入狀態的進入點。元件只 import 這個檔案，不直接碰 session.ts 或 api.ts。
import { fetchMe, loginRequest, registerRequest } from './api'
import {
  clearSession,
  getToken,
  onUnauthorized,
  session,
  setSession,
  setToken,
} from './session'

export { canUseAi, currentUser, isAdmin, isLoggedIn, session } from './session'

// 任何請求收到 401 就把本機狀態清乾淨。導頁交給路由守衛處理，
// 這裡不動 router，避免 lib 反過來相依 router。
onUnauthorized(() => {
  clearSession()
  session.ready = true
})

export async function login(email: string, password: string) {
  const { token, user } = await loginRequest({ email, password })
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

export function logout() {
  clearSession()
  session.ready = true
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
