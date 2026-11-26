// 每日一牌與月曆（v26 計畫 1）、占卜日記（v26 計畫 2）、通知中心（v26 計畫 5）
import type { AppNotification, CalendarMonth, DailyCardResponse, JournalContent, JournalEntry, JournalOutcome, JournalStockRecord, StockJournalInfo } from '../../types'

import { request } from './client'

// ---- 每日一牌與月曆（v26 計畫 1）----

export function fetchTodayDailyCard() {
  return request<DailyCardResponse>('/api/daily-card/today')
}

// 登入的會存起來、當天固定；訪客只回傳不存（後端依有沒有帶 token 判斷）
export function drawDailyCard() {
  return request<DailyCardResponse>('/api/daily-card/draw', { method: 'POST' })
}

// 訪客抽的牌，登入或註冊後存進月曆（只收今天的領取憑證）
export function claimDailyCard(claim: string) {
  return request<DailyCardResponse>('/api/daily-card/claim', { method: 'POST', body: JSON.stringify({ claim }) })
}

export function fetchCalendarMonth(month: string) {
  return request<CalendarMonth>(`/api/calendar?month=${encodeURIComponent(month)}`)
}

// ---- 占卜日記（v26 計畫 2）----
// target：reading:<紀錄 id> 或 stock:<市場>:<代號>（股票一檔一本，v26 計畫 2-2）

export function fetchJournal(target: string) {
  return request<{ entries: JournalEntry[] }>(`/api/journal?target=${encodeURIComponent(target)}`)
}

// stock：記錄股票的欄位，只有股票日記收（null＝清掉）
export function createJournalEntry(input: {
  target: string
  title: string
  content: JournalContent
  outcome: JournalOutcome
  entryDate: string
  stock?: JournalStockRecord | null
}) {
  return request<{ entry: JournalEntry }>('/api/journal', { method: 'POST', body: JSON.stringify(input) })
}

// 股票日記頁的這檔股票：名稱與最新股價（只限自己分析過或追蹤中的）
export function fetchStockJournalInfo(stockKey: string) {
  return request<{ stock: StockJournalInfo }>(`/api/market/stock-journal?stock=${encodeURIComponent(stockKey)}`)
}

export function updateJournalEntry(
  id: string,
  input: { title?: string; content?: JournalContent; outcome?: JournalOutcome; entryDate?: string; stock?: JournalStockRecord | null },
) {
  return request<{ entry: JournalEntry }>(`/api/journal/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteJournalEntry(id: string) {
  return request<{ deleted: boolean }>(`/api/journal/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---- 通知中心（v26 計畫 5）----
// 新到舊，一次最多 50 則；before 是上一頁最後一則的 id（載入更多）
export function fetchNotifications(before?: string) {
  const query = before ? `?before=${encodeURIComponent(before)}` : ''
  return request<{ notifications: AppNotification[]; hasMore: boolean }>(`/api/notifications${query}`)
}

export function fetchUnreadNotificationCount() {
  return request<{ count: number }>('/api/notifications/unread-count')
}

// 沒給 ids 就是全部標成已讀
export function markNotificationsRead(ids?: string[]) {
  return request<{ updated: number }>('/api/notifications/read', { method: 'PUT', body: JSON.stringify(ids ? { ids } : {}) })
}

export function deleteNotification(id: string) {
  return request<{ deleted: boolean }>(`/api/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function clearReadNotifications() {
  return request<{ deleted: number }>('/api/notifications?read=true', { method: 'DELETE' })
}
