// 所有後端呼叫。2026-11-26 前端優化 9 依領域拆到 src/lib/api/ 底下（原本一個檔 1100 多行）：
// client（網址、帶 token、逾時、NDJSON 串流）、auth（會員與管理者）、tarot（占卜、紀錄、追問、AI 解讀）、
// lenormand、market（股市）、journal（每日一牌、月曆、日記、通知）。元件照舊從 './api' import
// request()、postStream() 只給 api/ 底下的檔案用，不轉出去：元件一律呼叫這裡具名的函式
export {
  API_BASE_URL,
  authHeaders,
  fetchHealth,
  imageUrl,
  ndjsonEvents,
  REQUEST_TIMEOUT_MS,
  RequestTimeoutError,
  StreamStalledError,
  UnauthorizedError,
} from './api/client'
export * from './api/auth'
export * from './api/lenormand'
export * from './api/tarot'
export * from './api/market'
export * from './api/journal'
