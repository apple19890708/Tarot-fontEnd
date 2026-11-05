// 瀏覽器推播（Web Push）：註冊 service worker、向瀏覽器要訂閱、交給後端保存。
// service worker 檔案在 public/sw.js；網站掛在子路徑（GitHub Pages 的 /Tarot-fontEnd/），一律用 BASE_URL。

const BASE = import.meta.env.BASE_URL

// 這個瀏覽器能不能用推播；iPhone 要「加入主畫面」從主畫面開啟才有 PushManager
export type PushSupport = 'supported' | 'ios-needs-install' | 'unsupported'

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (capable) return 'supported'
  if (isIos() && !isStandalone()) return 'ios-needs-install'
  return 'unsupported'
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

// 給使用者分辨裝置用的名稱，例如「Chrome · Windows」
export function deviceLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '瀏覽器'
  const os = /Android/.test(ua) ? 'Android' : isIos() ? 'iPhone／iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

// VAPID 公鑰（base64url）轉成瀏覽器要的 Uint8Array
function base64UrlToBytes(value: string) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

async function registration() {
  return navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
}

// 這台裝置目前的訂閱（沒有就是 null）
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null
  const reg = await navigator.serviceWorker.getRegistration(BASE)
  return reg ? reg.pushManager.getSubscription() : null
}

// 要通知權限並訂閱；使用者拒絕時丟錯誤（訊息給畫面顯示）
export async function subscribePush(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied' ? '瀏覽器封鎖了這個網站的通知，請到瀏覽器的網站設定裡改成「允許」再試一次。' : '沒有允許通知，所以無法開啟。',
    )
  }
  const reg = await registration()
  await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) })
}

export async function unsubscribePush() {
  const subscription = await currentSubscription()
  if (subscription) await subscription.unsubscribe()
}
