import type {
  AdminUsersResponse,
  AuthResponse,
  AuthUser,
  CardSummary,
  CustomPosition,
  HealthResponse,
  ManualCardPick,
  MarketAlert,
  MarketAlertTarget,
  MarketSnapshot,
  MarketTrackSummary,
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
export function createMarketAlert(payload: {
  target?: MarketAlertTarget
  query?: string
  condition: MarketAlert['condition']
  price: number
  note?: string
}) {
  return request<{ alert: MarketAlert }>('/api/market/alerts', { method: 'POST', body: JSON.stringify(payload) })
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