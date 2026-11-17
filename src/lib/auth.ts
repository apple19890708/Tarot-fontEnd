// 登入狀態的進入點。元件只 import 這個檔案，不直接碰 session.ts 或 api.ts。
import {
  changePasswordRequest,
  deleteAccountRequest,
  fetchMe,
  googleLoginRequest,
  loginRequest,
  logoutAllRequest,
  registerRequest,
} from './api'
import { confirmDialog } from './confirm'
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

// Google 登入或註冊（後端用信箱找帳號，沒有就建立）。
// 綁 Google 時清掉了信箱沒驗證過的舊密碼（v24 1-1）就告訴使用者，之後要用密碼得走忘記密碼
export async function loginWithGoogle(credential: string) {
  const { token, user, passwordCleared } = await googleLoginRequest(credential)
  setToken(token)
  setSession(user)
  session.ready = true
  if (passwordCleared) {
    await confirmDialog({
      title: '登入方式已更新',
      message:
        '這個信箱之前用密碼註冊過，但信箱還沒驗證。為了避免別人先拿你的信箱註冊，原本的密碼已經停用，其他裝置也已登出。\n之後請用 Google 登入；想用密碼的話，到登入頁按「忘記密碼」重新設定一組。',
      confirmText: '確定',
      alert: true,
    })
  }
  return user
}

// 註冊完直接登入；後端寄了驗證信（v24 3-1）就提醒去收信
export async function register(email: string, password: string, displayName?: string) {
  const { token, user, verificationSent } = await registerRequest({ email, password, displayName })
  setToken(token)
  setSession(user)
  session.ready = true
  if (verificationSent) {
    await confirmDialog({
      title: '請收驗證信',
      message: `註冊完成！我們寄了一封驗證信到 ${user.email}，請在 24 小時內點信裡的連結。\n沒收到的話看一下垃圾郵件匣，或到帳號設定頁重寄。`,
      confirmText: '確定',
      alert: true,
    })
  }
  return user
}

// 驗證信箱成功後，畫面上的登入狀態跟著更新（帳號設定頁的「未驗證」提示要消失）
export function markEmailVerified() {
  if (session.user) session.user = { ...session.user, emailVerified: true }
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

// 登出所有裝置：後端成功後這台也登出；失敗就丟出錯誤、維持登入（由呼叫端顯示原因）
export async function logoutEverywhere() {
  await logoutAllRequest()
  logout()
}

// 改密碼：其他裝置登出，這台換上後端給的新 token 繼續用
export async function changePassword(currentPassword: string, newPassword: string) {
  const { token } = await changePasswordRequest({ currentPassword, newPassword })
  setToken(token)
}

// 刪除帳號：後端刪完就在這台登出（暫存的占卜結果一起清掉）
export async function deleteAccount(payload: { password?: string; credential?: string }) {
  await deleteAccountRequest(payload)
  logout()
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
