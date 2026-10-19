// token 與登入狀態的存放處。這個檔案不呼叫任何 API，避免和 api.ts 互相 import。
import { reactive, computed } from 'vue'
import type { AuthUser } from '../types'

const TOKEN_KEY = 'tarot_token'

export const session = reactive({
  user: null as AuthUser | null,
  // 還沒用 token 向後端確認過身分；路由守衛要等這個變 true 才判斷權限
  ready: false,
})

export const currentUser = computed(() => session.user)
export const isLoggedIn = computed(() => session.user !== null)
export const isAdmin = computed(() => session.user?.role === 'admin')
// AI 解析：admin 一律可用，member 要被管理者開通。實際放行與否還是後端說了算，
// 這裡只是用來決定畫面要顯示哪一種提示。
export const canUseAi = computed(
  () => session.user?.role === 'admin' || session.user?.aiAccess === true,
)

// 無痕視窗或封鎖儲存時 localStorage 會丟例外，一律吞掉，當成沒有登入
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 存不起來也還是能用到關掉分頁為止
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 同上
  }
}

export function setSession(user: AuthUser | null) {
  session.user = user
}

export function clearSession() {
  clearToken()
  session.user = null
}

// token 過期時由 api.ts 呼叫；真正要做什麼（清狀態、導頁）由 auth.ts 註冊
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function onUnauthorized(handler: UnauthorizedHandler) {
  unauthorizedHandler = handler
}

export function notifyUnauthorized() {
  unauthorizedHandler?.()
}
