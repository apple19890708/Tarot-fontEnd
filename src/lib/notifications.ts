// 通知中心（v26 計畫 5，計畫書在後端 doc/v26-daily-card-journal-plan.md）：頂欄鈴鐺的未讀數與面板用的整理。
// 不做即時連線：換頁時、分頁回到前景時、每 60 秒（分頁在前景才查）查一次未讀數；
// 收到推播（service worker 轉告）或網頁上跳出到價提示時也馬上查。寫入在後端（notifier 送推播前先存）
import { ref } from 'vue'

import { fetchUnreadNotificationCount } from './api'
import { taipeiToday } from './dailyCard'
import type { AppNotification, AppNotificationKind } from '../types'

const POLL_MS = 60 * 1000
// 換頁很快時不要每換一次就查（強制查詢不受這個限制）
const MIN_GAP_MS = 10 * 1000

export const unreadNotifications = ref(0)

let request = 0
let lastFetch = 0
let timer: ReturnType<typeof setInterval> | null = null
let running = false

// force：收到推播、到價提示、面板裡改了已讀這類「確定有變」的時候
export async function refreshUnreadNotifications(force = false) {
  if (!running) return
  const now = Date.now()
  if (!force && now - lastFetch < MIN_GAP_MS) return
  lastFetch = now
  const own = ++request
  try {
    const { count } = await fetchUnreadNotificationCount()
    if (own === request && running) unreadNotifications.value = count
  } catch {
    // 查不到就等下一輪，鈴鐺維持原本的數字
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void refreshUnreadNotifications()
}

// service worker 收到推播時會轉告開著的分頁（public/sw.js）
function onWorkerMessage(event: MessageEvent) {
  if (event.data?.type === 'push') void refreshUnreadNotifications(true)
}

// 由 App.vue 依登入狀態開關
export function startNotificationWatcher() {
  if (running) return
  running = true
  lastFetch = 0
  void refreshUnreadNotifications(true)
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshUnreadNotifications(true)
  }, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onWorkerMessage)
}

export function stopNotificationWatcher() {
  running = false
  request += 1
  if (timer) clearInterval(timer)
  timer = null
  unreadNotifications.value = 0
  document.removeEventListener('visibilitychange', onVisible)
  if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onWorkerMessage)
}

// 鈴鐺上的數字：超過 99 顯示 99+
export function badgeText(count: number) {
  return count > 99 ? '99+' : String(count)
}

// ---- 面板 ----

export const NOTIFICATION_KIND_LABELS: Record<AppNotificationKind, string> = {
  'price-alert': '價位提醒',
  'ex-dividend': '除息提醒',
  test: '測試通知',
  system: '系統通知',
}

const timeFormat = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function previousDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

// 依台北日期分組：今天、昨天、更早（列表本來就是新到舊，組內順序不動）
export function groupNotifications(list: AppNotification[], now = new Date()) {
  const today = taipeiToday(now)
  const yesterday = previousDay(today)
  const groups: { key: 'today' | 'yesterday' | 'earlier'; label: string; items: AppNotification[] }[] = [
    { key: 'today', label: '今天', items: [] },
    { key: 'yesterday', label: '昨天', items: [] },
    { key: 'earlier', label: '更早', items: [] },
  ]
  for (const item of list) {
    const day = taipeiToday(new Date(item.createdAt))
    groups[day === today ? 0 : day === yesterday ? 1 : 2]!.items.push(item)
  }
  return groups.filter((group) => group.items.length)
}

// 時間：今天、昨天只寫幾點幾分；更早加上日期（11/18 09:05）
export function notificationTime(createdAt: string, now = new Date()) {
  const date = new Date(createdAt)
  const time = timeFormat.format(date)
  const day = taipeiToday(date)
  const today = taipeiToday(now)
  if (day === today || day === previousDay(today)) return time
  return `${Number(day.slice(5, 7))}/${Number(day.slice(8))} ${time}`
}

// 通知的站內路徑 → router 的路徑（後端存的是不含開頭 / 的寫法，和推播一樣）；沒有就 null
export function notificationRoute(url: string) {
  const path = url.trim().replace(/^\/+/, '')
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null
  return `/${path}`
}
