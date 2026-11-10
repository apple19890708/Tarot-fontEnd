// 價位提醒的共用狀態：提醒清單、到價通知、定期檢查。
// 網頁開著時每 3 分鐘檢查一次（分頁在背景時暫停），但只在「有啟用中的提醒、而且它的市場正在交易」時才打 API；
// 收盤後價格不會變，由後端 market-cron 排程檢查並推播，前端不必一直問（Cloud Run 依請求時間計費）。
import { ref } from 'vue'

import { anyMarketOpen } from './marketHours'
import { checkMarketAlerts, createMarketAlert, deleteMarketAlert, fetchMarketAlerts, reactivateMarketAlert } from './api'
import type { MarketAlert, MarketAlertTarget } from '../types'

const CHECK_INTERVAL_MS = 3 * 60 * 1000

export const marketAlerts = ref<MarketAlert[]>([])
// 各標的目前價格（key 是 symbol，沒有 symbol 時是 exchange_code）
export const marketAlertPrices = ref<Record<string, number>>({})
// 到價了、還沒被使用者關掉的提醒
export const triggeredAlerts = ref<MarketAlert[]>([])

let timer: ReturnType<typeof setInterval> | null = null
let checking = false

export function alertKey(target: MarketAlertTarget) {
  return target.symbol || `${target.exchange}_${target.code}`
}

// 條件文字以後端的 description 為準；舊版後端沒有時退回價格提醒的寫法
export function alertTitle(alert: MarketAlert) {
  return alert.description || `${alert.condition === 'above' ? '漲到' : '跌到'} ${alert.price ?? ''}`
}

export function alertDetail(alert: MarketAlert) {
  return [alert.triggeredPrice !== null ? `目前 ${alert.triggeredPrice}` : '', alert.triggeredNote, alert.note].filter(Boolean).join('｜')
}

// 瀏覽器允許時另外送系統通知；不允許就只有畫面上的提示
function notify(alert: MarketAlert) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(`${alert.target.name} ${alertTitle(alert)}`, { body: alertDetail(alert) })
  } catch {
    // 部分瀏覽器（例如 iOS）不支援在頁面裡建立通知，畫面上的提示照常
  }
}

export async function requestAlertPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try {
      await Notification.requestPermission()
    } catch {
      // 使用者拒絕或瀏覽器不支援，都不影響提醒本身
    }
  }
}

export async function refreshMarketAlerts() {
  const { alerts } = await fetchMarketAlerts()
  marketAlerts.value = alerts
}

export async function checkAlertsNow() {
  if (checking) return
  checking = true
  try {
    const { alerts, triggered, prices } = await checkMarketAlerts()
    marketAlerts.value = alerts
    marketAlertPrices.value = prices
    if (triggered.length > 0) {
      triggeredAlerts.value = [...triggered, ...triggeredAlerts.value]
      triggered.forEach(notify)
    }
  } finally {
    checking = false
  }
}

export async function addMarketAlert(payload: Parameters<typeof createMarketAlert>[0]) {
  const { alert } = await createMarketAlert(payload)
  marketAlerts.value = [alert, ...marketAlerts.value]
  void requestAlertPermission()
  return alert
}

export async function reactivateAlert(id: string) {
  const { alert } = await reactivateMarketAlert(id)
  marketAlerts.value = marketAlerts.value.map((item) => (item.id === id ? alert : item))
}

export async function removeMarketAlert(id: string) {
  await deleteMarketAlert(id)
  marketAlerts.value = marketAlerts.value.filter((alert) => alert.id !== id)
}

export function dismissTriggered(id: string) {
  triggeredAlerts.value = triggeredAlerts.value.filter((alert) => alert.id !== id)
}

// 定期檢查要不要打：沒有啟用中的提醒、或提醒的市場都收盤了就跳過
function shouldCheck(date = new Date()) {
  const active = marketAlerts.value.filter((alert) => alert.active)
  return active.length > 0 && anyMarketOpen(active.map((alert) => alert.target.market), date)
}

// 由 App.vue 依「有沒有金融股市權限」開關；檢查失敗（例如 Cloud Run 冷啟動逾時）就等下一輪。
// 第一次一定檢查：要拿到提醒清單，也要帶回收盤後排程觸發、還沒看到的提醒
export function startAlertWatcher() {
  if (timer) return
  const tick = (first = false) => {
    if (document.visibilityState === 'visible' && (first || shouldCheck())) {
      checkAlertsNow().catch(() => undefined)
    }
  }
  tick(true)
  timer = setInterval(() => tick(), CHECK_INTERVAL_MS)
}

export function stopAlertWatcher() {
  if (timer) clearInterval(timer)
  timer = null
  marketAlerts.value = []
  marketAlertPrices.value = {}
  triggeredAlerts.value = []
}
