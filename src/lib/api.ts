import type {
  AdminUsersResponse,
  AuthResponse,
  AuthUser,
  CardSummary,
  CustomPosition,
  HealthResponse,
  ManualCardPick,
  MarketAlert,
  MarketAlertKind,
  MarketAlertParams,
  MarketAlertTarget,
  MarketAssetHistory,
  MarketSearchResult,
  MarketSnapshot,
  MarketTrackSummary,
  MarketDividend,
  MarketFees,
  MarketNewsItem,
  MarketNotifyStatus,
  MarketOverview,
  MarketScreenFilters,
  MarketScreenResult,
  MarketTrade,
  MarketWatchDetail,
  MarketWatchGroup,
  MarketWatchItem,
  NarrationStreamEvent,
  QuestionDomain,
  ReadingDetail,
  ReadingHistoryResponse,
  ReadingResponse,
  Spread,
} from '../types'
import { getToken, notifyUnauthorized } from './session'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// 牌卡圖片放在後端的 /cards；正式環境需加上後端網址，開發時走 Vite proxy（base 為空）
export function imageUrl(image?: string) {
  return image ? `${API_BASE_URL}${image}` : ''
}

// 登入後的請求一律帶 Authorization；沒登入就不帶，後端的公開路由照樣能用
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// token 過期或被撤銷時後端回 401：清掉本機狀態，不要停在半登入的畫面
export class UnauthorizedError extends Error {}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options?.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      notifyUnauthorized()
      throw new UnauthorizedError(payload?.message || '請先登入。')
    }
    throw new Error(payload?.message || 'API request failed')
  }

  return (await response.json()) as T
}

export function fetchHealth() {
  return request<HealthResponse>('/api/health')
}

// ===== 會員與權限（v12）=====

export function registerRequest(payload: { email: string; password: string; displayName?: string }) {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginRequest(payload: { email: string; password: string }) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchMe() {
  return request<{ user: AuthUser }>('/api/auth/me')
}

// 開通／收回某個會員的 AI 解析權限（admin 專用）
export function setUserAiAccess(userId: string, allowed: boolean) {
  return request<{ user: AuthUser }>(`/api/admin/users/${userId}/ai-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}

// 開通／收回某個會員的金融股市權限（admin 專用）
export function setUserStockAccess(userId: string, allowed: boolean) {
  return request<{ user: AuthUser }>(`/api/admin/users/${userId}/stock-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}

export function fetchAdminUsers(params: { page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  if (params.page) {
    query.set('page', String(params.page))
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize))
  }
  const suffix = query.toString() ? `?${query}` : ''
  return request<AdminUsersResponse>(`/api/admin/users${suffix}`)
}

export function fetchSpreads() {
  return request<Spread[]>('/api/spreads')
}

// domain 為選填；不送時後端走關鍵詞比對，再不中則用均等權重
export function createReading(payload: { question: string; spreadKey: string; domain?: QuestionDomain }) {
  return request<ReadingResponse>('/api/readings/draw', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchCards() {
  return request<CardSummary[]>('/api/cards')
}

export function createManualReading(payload: {
  question: string
  cards: ManualCardPick[]
  domain?: QuestionDomain
  // 帶了就套牌陣位置與關係對；省略則維持自由張數
  spreadKey?: string
  // 不指定牌陣時，使用者自己定義的位置含意；省略則維持無位置
  positions?: CustomPosition[]
}) {
  return request<ReadingResponse>('/api/readings/manual', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 股市諮詢的行情與技術指標。限 admin 與開通金融股市的會員（和股市諮詢本身一致），不呼叫 AI、不產生費用
export function fetchMarketSnapshot(question: string) {
  return request<{ snapshot: MarketSnapshot }>('/api/market/snapshot', {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
}

// 建議追蹤：過去的操作建議和之後實際走勢的對照
export function fetchMarketTrack() {
  return request<MarketTrackSummary>('/api/market/track')
}

export function clearMarketTrack() {
  return request<{ deleted: number }>('/api/market/track', { method: 'DELETE' })
}

// 價位提醒
export function fetchMarketAlerts() {
  return request<{ alerts: MarketAlert[] }>('/api/market/alerts')
}

// target：從操作建議一鍵設定；query：手動輸入代號或名稱
// kind 預設 price（condition＋price）；其他種類用 params（見 MarketAlertParams）
export function createMarketAlert(payload: {
  target?: MarketAlertTarget
  query?: string
  kind?: MarketAlertKind
  condition?: 'above' | 'below'
  price?: number
  params?: Partial<MarketAlertParams>
  note?: string
}) {
  return request<{ alert: MarketAlert }>('/api/market/alerts', { method: 'POST', body: JSON.stringify(payload) })
}

// 重新啟用已觸發的提醒
export function reactivateMarketAlert(id: string) {
  return request<{ alert: MarketAlert }>(`/api/market/alerts/${id}/reactivate`, { method: 'POST', body: JSON.stringify({}) })
}

export function deleteMarketAlert(id: string) {
  return request<{ deleted: boolean }>(`/api/market/alerts/${id}`, { method: 'DELETE' })
}

// 檢查還沒觸發的提醒：回傳全部提醒、這次新觸發的、各標的目前價格
export function checkMarketAlerts() {
  return request<{ alerts: MarketAlert[]; triggered: MarketAlert[]; prices: Record<string, number> }>(
    '/api/market/alerts/check',
    { method: 'POST', body: JSON.stringify({}) },
  )
}

// ===== 自訂股票追蹤 =====

// 輸入框的下拉候選；signal 讓輸入很快時可以取消前一次查詢
export function searchMarketTargets(market: 'tw' | 'us', q: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ market, q })
  return request<{ results: MarketSearchResult[] }>(`/api/market/search?${params}`, { signal })
}

export function fetchWatchlist() {
  return request<{
    asOf: string
    fees?: MarketFees
    // 下一次月營收公布截止日（每月 10 日前公布上個月）；舊版後端沒有
    revenueDeadline?: { deadline: string; forMonth: string }
    // 自選清單（舊版後端沒有）
    groups?: MarketWatchGroup[]
    items: MarketWatchItem[]
  }>('/api/market/watchlist')
}

// target：從下拉選單選的；沒有就用 query 讓後端找。trades 可以帶第一筆買進
export function createWatch(payload: {
  market: 'tw' | 'us'
  query: string
  target?: MarketSearchResult
  trades?: MarketTrade[]
  // 放進哪個清單；不帶就是未分類
  group?: string | null
}) {
  return request<{ item: MarketWatchItem }>('/api/market/watchlist', { method: 'POST', body: JSON.stringify(payload) })
}

// 買賣紀錄、股利各自整批替換（可以只送其中一個，空陣列代表清除）；回傳含報價與重算後的損益
export function updateWatchHoldings(id: string, payload: { trades?: MarketTrade[]; dividends?: MarketDividend[] }) {
  return request<{ item: MarketWatchItem }>(`/api/market/watchlist/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

// 追蹤清單裡台股公司最近 30 天的重大訊息（新的在前）
export function fetchMarketNews() {
  return request<{ news: MarketNewsItem[] }>('/api/market/news')
}

// 選股：依條件從全市場篩選（每人每分鐘最多 10 次）
export function screenMarket(filters: MarketScreenFilters) {
  return request<{ result: MarketScreenResult }>('/api/market/screen', { method: 'POST', body: JSON.stringify({ filters }) })
}

// 大盤概況：主要指數、漲跌家數、類股漲跌、三大法人、美股與匯率（後端快取 10 分鐘）
export function fetchMarketOverview() {
  return request<{ overview: MarketOverview }>('/api/market/overview')
}

// 資產走勢：每日快照與大盤比較
export function fetchAssetHistory() {
  return request<MarketAssetHistory>('/api/market/history')
}

// 展開卡片時才查：價格走勢圖、籌碼與估值
export function fetchWatchDetail(id: string) {
  return request<{ detail: MarketWatchDetail }>(`/api/market/watchlist/${id}/detail`)
}

// 交易成本設定
export function fetchMarketSettings() {
  return request<{ fees: MarketFees }>('/api/market/settings')
}

export function saveMarketSettings(fees: MarketFees) {
  return request<{ fees: MarketFees }>('/api/market/settings', { method: 'PUT', body: JSON.stringify({ fees }) })
}

// ---- 到價推播：瀏覽器推播（所有人）、Discord Webhook（只有 admin）----
export function fetchNotifyStatus() {
  return request<MarketNotifyStatus>('/api/market/notify')
}

// 這台裝置開啟瀏覽器推播：subscription 是瀏覽器給的 PushSubscription（toJSON）
export function addPushDevice(subscription: PushSubscriptionJSON, label: string) {
  return request<MarketNotifyStatus>('/api/market/notify/push', { method: 'POST', body: JSON.stringify({ subscription, label }) })
}

export function removePushDevice(id: string) {
  return request<MarketNotifyStatus>(`/api/market/notify/push/${id}`, { method: 'DELETE' })
}

// 綁定（或換一個）Webhook：後端會先送一則確認訊息，成功才儲存。只有 admin 能用（其他人 403）
export function linkDiscord(webhookUrl: string) {
  return request<MarketNotifyStatus>('/api/market/notify/discord', { method: 'PUT', body: JSON.stringify({ webhookUrl }) })
}

export function unlinkDiscord() {
  return request<MarketNotifyStatus>('/api/market/notify/discord', { method: 'DELETE' })
}

// 測試通知：送到所有已開啟的管道；push 是送出的裝置數
export function sendTestNotify() {
  return request<{ push: number; discord: boolean; errors?: string[] }>('/api/market/notify/test', { method: 'POST', body: JSON.stringify({}) })
}

// 換清單（null＝未分類）
export function moveWatchToGroup(id: string, group: string | null) {
  return request<{ item: MarketWatchItem }>(`/api/market/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify({ group }) })
}

// 自訂順序：依序傳入 id
export function reorderWatchlist(ids: string[]) {
  return request<{ ok: boolean }>('/api/market/watchlist/order', { method: 'PUT', body: JSON.stringify({ ids }) })
}

// ---- 自選清單 ----
export function createWatchGroup(name: string) {
  return request<{ group: MarketWatchGroup }>('/api/market/groups', { method: 'POST', body: JSON.stringify({ name }) })
}

export function renameWatchGroup(id: string, name: string) {
  return request<{ group: MarketWatchGroup }>(`/api/market/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
}

// 刪除清單：裡面的股票移到未分類；回傳剩下的清單
export function deleteWatchGroup(id: string) {
  return request<{ groups: MarketWatchGroup[] }>(`/api/market/groups/${id}`, { method: 'DELETE' })
}

export function reorderWatchGroups(ids: string[]) {
  return request<{ groups: MarketWatchGroup[] }>('/api/market/groups/order', { method: 'PUT', body: JSON.stringify({ ids }) })
}

export function deleteWatch(id: string) {
  return request<{ deleted: boolean }>(`/api/market/watchlist/${id}`, { method: 'DELETE' })
}

// ===== 占卜紀錄（v13）=====
// 要不要留存由使用者在結果頁決定，不是自動存

// 只送輸入（問題、牌與正逆位、牌陣或自訂位置），分析由後端在回顧時重算。
// AI 解讀無法重算，所以已經產生好的要一起送回去存。
export function saveReadingRecord(payload: {
  question: string
  cards: ManualCardPick[]
  domain?: QuestionDomain
  spreadKey?: string
  positions?: CustomPosition[]
  narration?: { text: string; model?: string; market?: MarketSnapshot | null }
}) {
  return request<{ id: string; createdAt: string }>('/api/readings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchReadingHistory(params: { page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  if (params.page) {
    query.set('page', String(params.page))
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize))
  }
  const suffix = query.toString() ? `?${query}` : ''
  return request<ReadingHistoryResponse>(`/api/readings${suffix}`)
}

// 單筆回顧：分析由後端依當時的牌重算，AI 解讀則是當初存下來的那一份
export function fetchReadingDetail(id: string) {
  return request<ReadingDetail>(`/api/readings/${id}`)
}

export function deleteReading(id: string) {
  return request<{ deleted: boolean }>(`/api/readings/${id}`, { method: 'DELETE' })
}

// 以串流接收 AI 解讀：每收到一段文字就呼叫 onDelta。
// 傳入的 signal 被中斷時，後端會跟著中斷 AI 生成（停止計費），這裡會丟出 AbortError。
export async function streamNarration(
  reading: ReadingResponse,
  options: {
    signal: AbortSignal
    onDelta: (text: string) => void
    // 股市問題時，後端會先送出查到的市場資料
    onMarket?: (snapshot: MarketSnapshot) => void
    domain?: QuestionDomain
    // 已經保存成紀錄時帶上它的 id，後端會在解讀完整產生後存回那筆紀錄
    readingId?: string
  },
): Promise<{ model: string; saved: boolean | null }> {
  const response = await fetch(`${API_BASE_URL}/api/readings/narrate`, {
    method: 'POST',
    // 這支不走 request()，Authorization 要自己帶；AI 解讀限會員使用
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      question: reading.question,
      spreadKey: reading.spread.key,
      // 自訂牌陣的位置含意只存在於這次結果裡，後端查不到，要一起送回去
      positions: reading.cards.every((entry) => entry.position)
        ? reading.cards.map((entry) => ({
            label: entry.position!.label,
            prompt: entry.position!.prompt,
          }))
        : undefined,
      domain: options.domain,
      // 後端完整產生後會把文字存回這筆紀錄；還沒保存就只是不存檔，解讀照常
      readingId: options.readingId,
      cards: reading.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation })),
    }),
    signal: options.signal,
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      notifyUnauthorized()
      throw new UnauthorizedError(payload?.message || '請先登入後再使用 AI 解讀。')
    }
    throw new Error(payload?.message || 'AI 解讀暫時無法使用')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })

    const lines = buffer.split('\n')
    buffer = done ? '' : (lines.pop() ?? '')

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }
      const event = JSON.parse(line) as NarrationStreamEvent
      if (event.type === 'delta') {
        options.onDelta(event.text)
      } else if (event.type === 'market') {
        options.onMarket?.(event.snapshot)
      } else if (event.type === 'done') {
        // 舊版後端沒有 saved，當成不知道（null），畫面就不顯示存檔結果
        return { model: event.model, saved: event.saved ?? null }
      } else {
        throw new Error(event.message)
      }
    }

    if (done) {
      throw new Error('AI 解讀連線意外中斷')
    }
  }
}