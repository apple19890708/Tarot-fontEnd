// 股市：行情、建議追蹤、價位提醒、自訂股票追蹤、個股分析、財經新聞、設定與推播、自選清單
import { watchlistMutation } from '../watchlistSync'
import type { ConcentrationThresholds, DailyPicks, DailyPickType, DividendProfile, FinanceNewsAnalysisDetail, FinanceNewsAnalysisSummary, FinanceNewsDigest, FinanceNewsScopeRegion, FinanceNewsView, IncomeDismissed, IncomeReport, IndexChart, IndexChartRange, MarketAlert, MarketAlertKind, MarketAlertParams, MarketAlertTarget, MarketAssetHistory, MarketDashboard, MarketDividend, MarketFees, MarketFuturesQuote, MarketNewsItem, MarketNotifyStatus, MarketOverview, MarketScreenFilters, MarketScreenResult, MarketSearchResult, MarketSnapshot, MarketTrackSummary, MarketTrade, MarketWatchDetail, MarketWatchGroup, MarketWatchItem, StockAnalysisRecord, StockAnalysisSummary, StockAnalysisView, StockCardData, StockSubject } from '../../types'

import { postStream, request } from './client'

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

// 「我的紀錄」的股票分析；stockKey（tw:0050）只要這檔的（股票日記頁的左欄）
export function fetchStockAnalyses(stockKey?: string) {
  return request<{ analyses: StockAnalysisSummary[] }>(`/api/market/analyses${stockKey ? `?stock=${encodeURIComponent(stockKey)}` : ''}`)
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
  type AnalysisEvent =
    | { type: 'delta'; text: string }
    | { type: 'done'; model: string; analysis: A | null }
    | { type: 'error'; message: string }
  const done = await postStream<AnalysisEvent>(path, body, {
    signal: options.signal,
    label: 'AI 分析',
    unauthorizedMessage: '請先登入。',
    onEvent: (event) => options.onDelta(event.text),
  })
  return { model: done.model, analysis: done.analysis }
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
