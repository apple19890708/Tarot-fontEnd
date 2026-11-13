import { watchlistMutation } from './watchlistSync'
import type {
  DividendProfile,
  IncomeReport,
  AdminLogsResponse,
  AdminUser,
  AdminUserDetail,
  AdminUserFilter,
  AdminUserSort,
  AdminUsersResponse,
  AuthResponse,
  AuthUser,
  CardSummary,
  CustomPosition,
  FinanceNewsAnalysisDetail,
  FinanceNewsDigest,
  FinanceNewsAnalysisSummary,
  FinanceNewsScopeRegion,
  FinanceNewsView,
  HealthResponse,
  IndexChart,
  IndexChartRange,
  MarketFuturesQuote,
  ManualCardPick,
  MarketAlert,
  MarketAlertKind,
  MarketAlertParams,
  MarketAlertTarget,
  MarketAssetHistory,
  MarketSearchResult,
  MarketSnapshot,
  MarketTrackSummary,
  IncomeDismissed,
  ConcentrationThresholds,
  MarketDividend,
  DailyPicks,
  DailyPickType,
  StockCardData,
  StockSubject,
  MarketDashboard,
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
  FollowUpRound,
  ReadingDetail,
  ReadingHistoryResponse,
  ReadingResponse,
  Spread,
  StockAnalysisRecord,
  StockAnalysisSummary,
  StockAnalysisView,
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

// AI 串流（NDJSON）太久沒收到任何資料：連線多半已經斷了（伺服器重啟、Render 重新部署、手機切到背景、網路切換）
export class StreamStalledError extends Error {}

// 新版後端串流途中每 15 秒送一次 {"type":"ping"}：收過 ping 之後 45 秒沒資料就當成斷線。
// 舊版後端沒有心跳，AI 推理時可能一兩分鐘沒有文字，放寬到 150 秒，避免誤判
const STREAM_IDLE_MS = 45_000
const STREAM_IDLE_LEGACY_MS = 150_000

// 逐行讀 NDJSON 事件（不含 ping）；連線結束、太久沒資料都丟錯誤，呼叫端在收到 done 時 return 結束
async function* ndjsonEvents<T>(body: ReadableStream<Uint8Array>, label: string): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawPing = false
  try {
    for (;;) {
      const idleMs = sawPing ? STREAM_IDLE_MS : STREAM_IDLE_LEGACY_MS
      let timer: ReturnType<typeof setTimeout> | undefined
      const stalled = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new StreamStalledError(`${label}的連線中斷了（超過 ${idleMs / 1000} 秒沒有收到資料），請再試一次。`)),
          idleMs,
        )
      })
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await Promise.race([reader.read(), stalled])
      } finally {
        clearTimeout(timer)
      }
      const { done, value } = chunk
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as { type: string }
        if (event.type === 'ping') {
          sawPing = true
          continue
        }
        yield event as T
      }
      if (done) throw new Error(`${label}連線意外中斷，請再試一次。`)
    }
  } finally {
    // 正常結束、丟錯誤或呼叫端提早 return 都把連線關掉（卡住時也不會一直佔著）
    reader.cancel().catch(() => {})
  }
}

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

// Google 登入／註冊（v17 規格 I）：credential 是 Google 給的 ID token，後端驗證後回和一般登入一樣的 token＋user
export function googleLoginRequest(credential: string) {
  return request<AuthResponse & { created?: boolean }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })
}

// 忘記密碼：信箱沒註冊時後端回 404（訊息直接顯示），有註冊才寄信
export function forgotPasswordRequest(email: string) {
  return request<{ sent: true; email: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

// 重設頁打開時確認連結還能不能用；email 是遮罩過的（a***@gmail.com）
export function checkResetToken(token: string) {
  return request<{ valid: boolean; email?: string }>(`/api/auth/reset-password/${encodeURIComponent(token)}`)
}

export function resetPasswordRequest(token: string, password: string) {
  return request<{ ok: true }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export function fetchMe() {
  return request<{ user: AuthUser }>('/api/auth/me')
}

// 登出所有裝置：後端把帳號的憑證版本號加 1，所有已登入的裝置（含這一台）都要重新登入
export function logoutAllRequest() {
  return request<{ ok: true }>('/api/auth/logout-all', { method: 'POST' })
}

// 開通／收回某個會員的 AI 解析權限（admin 專用）
export function setUserAiAccess(userId: string, allowed: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/ai-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}

// 開通／收回某個會員的金融股市權限（admin 專用）
export function setUserStockAccess(userId: string, allowed: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/stock-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}

export function fetchAdminUsers(
  params: { page?: number; pageSize?: number; q?: string; filter?: AdminUserFilter; sort?: AdminUserSort } = {},
) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.q?.trim()) query.set('q', params.q.trim())
  if (params.filter && params.filter !== 'all') query.set('filter', params.filter)
  if (params.sort && params.sort !== 'created') query.set('sort', params.sort)
  const suffix = query.toString() ? `?${query}` : ''
  return request<AdminUsersResponse>(`/api/admin/users${suffix}`)
}

// 單一會員的詳細：使用量與最近的管理操作（admin 專用）
export function fetchAdminUser(userId: string) {
  return request<AdminUserDetail>(`/api/admin/users/${userId}`)
}

// 停用或恢復帳號；停用時該會員所有裝置立刻登出（admin 專用）
export function setUserDisabled(userId: string, disabled: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/disabled`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled }),
  })
}

// 強制登出某個會員的所有裝置（admin 專用）
export function forceLogoutUser(userId: string) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/logout-all`, { method: 'POST' })
}

// 管理操作紀錄（全部會員，新到舊）
export function fetchAdminLogs(page = 1) {
  return request<AdminLogsResponse>(`/api/admin/logs?page=${page}`)
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
// onlyCurrent：只統計目前規則版本的紀錄
export function fetchMarketTrack(onlyCurrent = false) {
  return request<MarketTrackSummary>(`/api/market/track${onlyCurrent ? '?version=current' : ''}`)
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

// 存股試算自選一檔：現價、配息頻率、近 12 個月與多年平均殖利率（不用先加入追蹤）；舊版後端沒有這支會 404
export function fetchDividendProfile(market: 'tw' | 'us', q: string) {
  const params = new URLSearchParams({ market, q })
  return request<{ profile: DividendProfile }>(`/api/market/dividend-profile?${params}`)
}

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
  // existing：已經在追蹤，這次只是把選的清單加上去（持股不動，有填第一筆時 tradesIgnored）；舊版後端沒有，會直接回 409
  return watchlistMutation(
    request<{ item: MarketWatchItem; existing?: boolean; tradesIgnored?: boolean }>('/api/market/watchlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  )
}

// 買賣紀錄、股利各自整批替換（可以只送其中一個，空陣列代表清除）；回傳含報價與重算後的損益
export function updateWatchHoldings(
  id: string,
  payload: { trades?: MarketTrade[]; dividends?: MarketDividend[]; dismissedEntitlements?: IncomeDismissed[] },
) {
  return watchlistMutation(
    request<{ item: MarketWatchItem }>(`/api/market/watchlist/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  )
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

// 大盤概況重點卡的走勢彈窗：只能查大盤概況裡的指數與匯率
export function fetchIndexChart(symbol: string, range: IndexChartRange) {
  return request<{ chart: IndexChart }>(`/api/market/index-chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
}

// 台指期夜盤的分鐘走勢（期交所，當次夜盤 15:00～隔天 05:00）
export function fetchFuturesChart() {
  return request<{ chart: { quote: MarketFuturesQuote; points: { t: string; close: number }[] } }>('/api/market/futures-chart')
}

// 資產走勢：每日快照與大盤比較
export function fetchAssetHistory() {
  return request<MarketAssetHistory>('/api/market/history')
}

// 展開卡片時才查：價格走勢圖、籌碼與估值
export function fetchWatchDetail(id: string) {
  return request<{ detail: MarketWatchDetail }>(`/api/market/watchlist/${id}/detail`)
}

// ===== 個股分析（v17 規格 F）=====
// 彈窗資料：完整分析、持股、事件與 AI 額度（不呼叫 AI）
export function fetchStockAnalysis(subject: StockSubject) {
  return request<{ analysis: StockAnalysisView }>(`${subjectPath(subject)}/analysis`)
}

// 「我的紀錄」的股票分析
export function fetchStockAnalyses() {
  return request<{ analyses: StockAnalysisSummary[] }>('/api/market/analyses')
}

export function fetchStockAnalysisRecord(id: string) {
  return request<{ analysis: StockAnalysisRecord }>(`/api/market/analyses/${id}`)
}

export function deleteStockAnalysis(id: string) {
  return request<{ deleted: boolean }>(`/api/market/analyses/${id}`, { method: 'DELETE' })
}

// 以串流接收個股 AI 分析（會計費）。完整產生後後端會存成一筆紀錄，done 帶回它的摘要。
// signal 中斷時後端會跟著停止 AI 生成，這裡會丟出 AbortError
export function streamStockAnalysis(
  subject: StockSubject,
  options: { signal: AbortSignal; onDelta: (text: string) => void },
): Promise<{ model: string; analysis: StockAnalysisSummary | null }> {
  return streamAnalysis<StockAnalysisSummary>(`${subjectPath(subject)}/analysis/ai`, undefined, options)
}

// 股市 AI 分析共用的 NDJSON 串流：delta 逐段回呼、done 回傳結果、error 丟出錯誤
// A：done 帶回的紀錄摘要型別（存檔失敗時為 null）
async function streamAnalysis<A>(
  path: string,
  body: unknown,
  options: { signal: AbortSignal; onDelta: (text: string) => void },
): Promise<{ model: string; analysis: A | null }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    // 這支不走 request()，Authorization 要自己帶
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      notifyUnauthorized()
      throw new UnauthorizedError(payload?.message || '請先登入。')
    }
    throw new Error(payload?.message || 'AI 分析暫時無法使用')
  }

  type AnalysisEvent =
    | { type: 'delta'; text: string }
    | { type: 'done'; model: string; analysis: A | null }
    | { type: 'error'; message: string }
  for await (const event of ndjsonEvents<AnalysisEvent>(response.body, 'AI 分析')) {
    if (event.type === 'delta') {
      options.onDelta(event.text)
    } else if (event.type === 'done') {
      return { model: event.model, analysis: event.analysis }
    } else if (event.type === 'error') {
      throw new Error(event.message)
    }
  }
  throw new Error('AI 分析連線意外中斷，請再試一次。')
}

// ===== 財經新聞（v17 規格 G）=====
// 最近 3 天的國內外新聞、主題、來源狀態、AI 額度與最近一份分析（不呼叫 AI）
export function fetchFinanceNews() {
  return request<FinanceNewsView>('/api/market/finance-news')
}

// AI 影響分析（會計費）：範圍是畫面目前的區域與主題，新聞由後端自己挑
export function streamFinanceNewsAnalysis(
  scope: { region: FinanceNewsScopeRegion; theme: string | null },
  options: { signal: AbortSignal; onDelta: (text: string) => void },
) {
  return streamAnalysis<FinanceNewsAnalysisSummary>('/api/market/finance-news/analysis', scope, options)
}

// 新聞重點彈窗：節錄重點、提及個股、語氣、可能影響族群（不呼叫 AI；第一次打開時後端才讀原文）
export function fetchFinanceNewsDigest(id: string) {
  return request<{ digest: FinanceNewsDigest }>(`/api/market/finance-news/${id}/digest`)
}

export function fetchFinanceNewsAnalyses() {
  return request<{ analyses: FinanceNewsAnalysisSummary[] }>('/api/market/finance-news/analyses')
}

export function fetchFinanceNewsAnalysis(id: string) {
  return request<{ analysis: FinanceNewsAnalysisDetail }>(`/api/market/finance-news/analyses/${id}`)
}

export function deleteFinanceNewsAnalysis(id: string) {
  return request<{ deleted: boolean }>(`/api/market/finance-news/analyses/${id}`, { method: 'DELETE' })
}

// 交易成本設定
export function fetchMarketSettings() {
  // dashboard：股市總覽的版面；沒自訂過是 null，舊版後端沒有這個欄位
  // reminders：提醒開關（v20，舊版後端沒有）
  // concentration：集中度提醒的門檻（v20，舊版後端沒有）
  return request<{
    fees: MarketFees
    reminders?: { exDividend: boolean }
    concentration?: ConcentrationThresholds
    dashboard?: MarketDashboard | null
  }>('/api/market/settings')
}

// 集中度提醒的門檻（v20 2.9.8）：只送 concentration，其他設定不動
export function saveConcentrationThresholds(concentration: ConcentrationThresholds) {
  return request<{ concentration: ConcentrationThresholds }>('/api/market/settings', {
    method: 'PUT',
    body: JSON.stringify({ concentration }),
  })
}

// 除息前推播的開關（v20 階段 6）：只送 reminders，交易成本不動
export function saveExDividendReminder(enabled: boolean) {
  return request<{ reminders: { exDividend: boolean } }>('/api/market/settings', {
    method: 'PUT',
    body: JSON.stringify({ reminders: { exDividend: enabled } }),
  })
}

// 股利獲利與預測（v20）：持股損益、應收股利、未來 12 個月股利預估。group 不給是全部追蹤
export function fetchIncome(group: string | null = null) {
  return request<IncomeReport>(`/api/market/income${group ? `?group=${encodeURIComponent(group)}` : ''}`)
}

// 當日推薦個股（股市總覽的區塊）：所有人共用一份，跟著全市場收盤資料更新
export function fetchDailyPicks(type?: DailyPickType) {
  return request<{ picks: DailyPicks }>(`/api/market/daily-picks${type ? `?type=${type}` : ''}`)
}

// 任何一檔台股的卡片（推薦／熱門股票）
export function fetchStockCard(code: string) {
  return request<{ card: StockCardData }>(`/api/market/stock/${encodeURIComponent(code)}/card`)
}

// 個股分析的網址：追蹤項目或任何一檔台股的代號
const subjectPath = (subject: StockSubject) =>
  'watchId' in subject ? `/api/market/watchlist/${subject.watchId}` : `/api/market/stock/${encodeURIComponent(subject.code)}`

// 股市總覽的版面：整份替換；null＝恢復預設
export function saveMarketDashboard(dashboard: Pick<MarketDashboard, 'blocks'> | null) {
  return request<{ dashboard: MarketDashboard | null }>('/api/market/dashboard', { method: 'PUT', body: JSON.stringify({ dashboard }) })
}

export function saveMarketSettings(fees: MarketFees) {
  return watchlistMutation(
    request<{ fees: MarketFees }>('/api/market/settings', { method: 'PUT', body: JSON.stringify({ fees }) }),
  )
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

// 設定這一檔所在的清單（可以好幾個，空陣列＝未分類），整批替換
export function setWatchGroups(id: string, groups: string[]) {
  return watchlistMutation(
    request<{ item: MarketWatchItem }>(`/api/market/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify({ groups }) }),
  )
}

// 自訂順序：依序傳入 id
export function reorderWatchlist(ids: string[]) {
  return watchlistMutation(
    request<{ ok: boolean }>('/api/market/watchlist/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  )
}

// ---- 自選清單 ----
export function createWatchGroup(name: string) {
  return watchlistMutation(
    request<{ group: MarketWatchGroup }>('/api/market/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  )
}

export function renameWatchGroup(id: string, name: string) {
  return watchlistMutation(
    request<{ group: MarketWatchGroup }>(`/api/market/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  )
}

// 刪除清單：裡面的股票移到未分類；回傳剩下的清單
export function deleteWatchGroup(id: string) {
  return watchlistMutation(
    request<{ groups: MarketWatchGroup[] }>(`/api/market/groups/${id}`, { method: 'DELETE' }),
  )
}

export function reorderWatchGroups(ids: string[]) {
  return watchlistMutation(
    request<{ groups: MarketWatchGroup[] }>('/api/market/groups/order', { method: 'PUT', body: JSON.stringify({ ids }) }),
  )
}

export function deleteWatch(id: string) {
  return watchlistMutation(
    request<{ deleted: boolean }>(`/api/market/watchlist/${id}`, { method: 'DELETE' }),
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
  // 保存前已經追問過的補充牌與 AI 延伸回答（舊版後端會忽略）
  followUps?: FollowUpPayload[]
  followUpNarration?: { text: string; model?: string }
}) {
  return request<{ id: string; createdAt: string }>('/api/readings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 補存或更新一筆紀錄的 AI 解讀（2026-11-12）：AI 寫的過程中才按保存時，那次 AI 請求沒帶紀錄 id，後端不會存回，
// AI 完成後由前端用這支補上；已經有解讀會被覆蓋
// cards：這段解讀當時的牌與正逆位，後端和紀錄比對，不一樣就不存（409）
export function updateReadingNarration(
  id: string,
  narration: { text: string; model?: string; market?: MarketSnapshot | null; cards: ManualCardPick[] },
) {
  return request<{ saved: boolean }>(`/api/readings/${id}/narration`, {
    method: 'PUT',
    body: JSON.stringify(narration),
  })
}

// ---- 抽牌追問（v23）----
// 送給後端的追問：只要問題、牌 id 與正逆位
export interface FollowUpPayload {
  question: string
  cards: ManualCardPick[]
}

export function toFollowUpPayload(followUps: FollowUpRound[]): FollowUpPayload[] {
  return followUps.map((round) => ({
    question: round.question,
    cards: round.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation })),
  }))
}

const baseCardsOf = (reading: ReadingResponse): ManualCardPick[] =>
  reading.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation }))

// 追問抽牌：後端從還沒出現過的牌裡抽（原牌陣與之前的補充牌不會再出現）。
// picks：使用者自己在扇形牌堆抽的牌（正逆位洗牌時已決定）；有帶就用它，後端只檢查與補上牌義
export function drawFollowUp(
  reading: ReadingResponse,
  followUps: FollowUpRound[],
  question: string,
  count: number,
  picks?: ManualCardPick[],
) {
  return request<FollowUpRound>('/api/readings/follow-up/draw', {
    method: 'POST',
    body: JSON.stringify({ cards: baseCardsOf(reading), followUps: toFollowUpPayload(followUps), question, count, picks }),
  })
}

// 更新已保存紀錄的追問（整批取代）。narration 有帶才會動延伸回答
export function updateReadingFollowUps(
  id: string,
  payload: { cards: ManualCardPick[]; followUps: FollowUpPayload[]; narration?: { text: string; model?: string } | null },
) {
  return request<{ saved: boolean }>(`/api/readings/${id}/follow-ups`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

// 追問的 AI 延伸回答（串流）：原牌陣、先前的解讀與所有追問一起交給 AI
export async function streamFollowUpNarration(
  reading: ReadingResponse,
  options: {
    followUps: FollowUpRound[]
    // 先前的 AI 解讀全文；沒有就不帶
    narration?: string
    // 前幾次追問已經有回答、要保留（只回答新的追問）；followUpText 是目前的延伸回答全文（還沒保存成紀錄時後端用它）
    answeredRounds?: number
    followUpText?: string
    signal: AbortSignal
    // 後端實際保留了前幾次的回答（可能比要求的少）；舊版後端不會呼叫
    onStart?: (kept: number) => void
    onDelta: (text: string) => void
    domain?: QuestionDomain
    readingId?: string
  },
): Promise<{ model: string; saved: boolean | null }> {
  const response = await fetch(`${API_BASE_URL}/api/readings/follow-up/narrate`, {
    method: 'POST',
    // 不走 request()，Authorization 要自己帶
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      question: reading.question,
      spreadKey: reading.spread.key,
      positions: reading.cards.every((entry) => entry.position)
        ? reading.cards.map((entry) => ({ label: entry.position!.label, prompt: entry.position!.prompt }))
        : undefined,
      domain: options.domain,
      readingId: options.readingId,
      cards: baseCardsOf(reading),
      followUps: toFollowUpPayload(options.followUps),
      narration: options.narration || undefined,
      answeredRounds: options.answeredRounds || undefined,
      followUpText: options.answeredRounds ? options.followUpText || undefined : undefined,
    }),
    signal: options.signal,
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      notifyUnauthorized()
      throw new UnauthorizedError(payload?.message || '請先登入後再使用 AI 追問。')
    }
    throw new Error(payload?.message || 'AI 追問暫時無法使用')
  }

  for await (const event of ndjsonEvents<NarrationStreamEvent>(response.body, 'AI 追問')) {
    if (event.type === 'start') {
      options.onStart?.(event.kept)
    } else if (event.type === 'delta') {
      options.onDelta(event.text)
    } else if (event.type === 'done') {
      return { model: event.model, saved: event.saved ?? null }
    } else if (event.type === 'error') {
      throw new Error(event.message)
    }
  }
  throw new Error('AI 追問連線意外中斷，請再試一次。')
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

  for await (const event of ndjsonEvents<NarrationStreamEvent>(response.body, 'AI 解讀')) {
    if (event.type === 'delta') {
      options.onDelta(event.text)
    } else if (event.type === 'market') {
      options.onMarket?.(event.snapshot)
    } else if (event.type === 'done') {
      // 舊版後端沒有 saved，當成不知道（null），畫面就不顯示存檔結果
      return { model: event.model, saved: event.saved ?? null }
    } else if (event.type === 'error') {
      throw new Error(event.message)
    }
  }
  throw new Error('AI 解讀連線意外中斷，請再試一次。')
}