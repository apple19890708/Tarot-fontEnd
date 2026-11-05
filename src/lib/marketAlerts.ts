// 價位提醒的共用狀態：提醒清單、到價通知、定期檢查。
// 伺服器沒有常駐排程，所以只有網頁開著時才會檢查（每 3 分鐘，分頁在背景時暫停）。
import { ref } from 'vue'

import { checkMarketAlerts, createMarketAlert, deleteMarketAlert, fetchMarketAlerts } from './api'
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

function conditionText(alert: MarketAlert) {
  return alert.condition === 'above' ? '漲到' : '跌到'
}

// 瀏覽器允許時另外送系統通知；不允許就只有畫面上的提示
function notify(alert: MarketAlert) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(`${alert.target.name} ${conditionText(alert)} ${alert.price}`, {
      body: `目前 ${alert.triggeredPrice}${alert.note ? `｜${alert.note}` : ''}`,
    })
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

export async function removeMarketAlert(id: string) {
  await deleteMarketAlert(id)
  marketAlerts.value = marketAlerts.value.filter((alert) => alert.id !== id)
}

export function dismissTriggered(id: string) {
  triggeredAlerts.value = triggeredAlerts.value.filter((alert) => alert.id !== id)
}

// 由 App.vue 依「有沒有金融股市權限」開關；檢查失敗（例如 Render 剛喚醒）就等下一輪
export function startAlertWatcher() {
  if (timer) return
  const tick = () => {
    if (document.visibilityState === 'visible') {
      checkAlertsNow().catch(() => undefined)
    }
  }
  tick()
  timer = setInterval(tick, CHECK_INTERVAL_MS)
}

export function stopAlertWatcher() {
  if (timer) clearInterval(timer)
  timer = null
  marketAlerts.value = []
  marketAlertPrices.value = {}
  triggeredAlerts.value = []
}
