// 會員管理頁與會員詳細彈窗共用的顯示文字：日期、多久以前、登入方式、操作紀錄。
// 列表和彈窗用同一組函式，兩邊顯示才會一致。
import type { AdminLogEntry, AdminUser } from '../types'

// 2026-11-10 14:05：補零到固定寬度，配 tabular-nums 上下列才對齊
export function formatDateTime(value?: string | null) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 「3 小時前」「12 天前」；超過一年寫日期。沒有紀錄（功能上線前的舊帳號）寫「沒有紀錄」
export function relativeTime(value?: string | null, now = Date.now()) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '沒有紀錄'
  const minutes = Math.floor((now - date.getTime()) / 60000)
  if (minutes < 60) return '1 小時內'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小時前`
  const days = Math.floor(hours / 24)
  if (days < 365) return `${days} 天前`
  return formatDateTime(value).slice(0, 10)
}

// 超過 30 天沒有活動（或沒有紀錄）就標淡，和後端「很久沒來」的篩選同一個天數
export const INACTIVE_DAYS = 30
export function isInactive(user: AdminUser, now = Date.now()) {
  if (!user.lastActiveAt) return true
  return now - new Date(user.lastActiveAt).getTime() > INACTIVE_DAYS * 24 * 60 * 60 * 1000
}

// 能用哪些方式登入：密碼、Google
export function loginMethodsText(user: AdminUser) {
  const methods = user.loginMethods
  if (!methods) return '—'
  const list = [methods.password ? '密碼' : '', methods.google ? 'Google' : ''].filter(Boolean)
  return list.length ? list.join('＋') : '—'
}

const LAST_LOGIN_LABELS = { password: '密碼', google: 'Google', register: '註冊' } as const
export function lastLoginMethodText(method?: AdminUser['lastLoginMethod']) {
  return method ? LAST_LOGIN_LABELS[method] : ''
}

// 操作紀錄的一句話（不含操作者與對象）
export function logActionText(entry: AdminLogEntry) {
  switch (entry.action) {
    case 'aiAccess':
      return entry.value ? '開通 AI 解析' : '收回 AI 解析'
    case 'stockAccess':
      return entry.value ? '開通金融股市' : '收回金融股市'
    case 'disable':
      return '停用帳號'
    case 'enable':
      return '恢復帳號'
    case 'logoutAll':
      return '強制登出所有裝置'
    default:
      return entry.action
  }
}

export function personText(person: AdminLogEntry['admin']) {
  return person ? person.email : '已刪除的帳號'
}
