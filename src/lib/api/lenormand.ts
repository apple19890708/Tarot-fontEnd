// 雷諾曼（v27）：牌、牌陣、抽牌、紀錄、AI 解讀
import type { LenormandCardsResponse, LenormandNarrateRequest, LenormandNarrationCheck, LenormandNarrationEvent, LenormandReadingDetail, LenormandReadingRequest, LenormandReadingResponse, LenormandReadingsResponse, LenormandSaveRequest, LenormandSaveResponse, LenormandSpreadsResponse } from '../../types'

import { postStream, request } from './client'

// ===== 雷諾曼（v27）=====
// 整組 /api/lenormand 都要雷諾曼權限：未登入 401、沒開通 403「雷諾曼功能需要管理者開通，請聯絡管理者。」（request 會把訊息帶出來）

// 52 張牌與撲克花色解說表。牌義、解說表不會在一次瀏覽中變動，載過一次就留著（選牌器、結果頁、花色區共用）；
// 失敗時不留，下次再試
let lenormandCardsCache: Promise<LenormandCardsResponse> | null = null
export function fetchLenormandCards() {
  if (!lenormandCardsCache) {
    lenormandCardsCache = request<LenormandCardsResponse>('/api/lenormand/cards').catch((error) => {
      lenormandCardsCache = null
      throw error
    })
  }
  return lenormandCardsCache
}

export function fetchLenormandSpreads() {
  return request<LenormandSpreadsResponse>('/api/lenormand/spreads')
}

// 後端洗牌抽牌（3-12）
export function drawLenormandReading(payload: LenormandReadingRequest) {
  return request<LenormandReadingResponse>('/api/lenormand/readings/draw', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 扇形挑牌或輸入實體牌：cards 是牌號，依位置順序（由左到右、由上到下）
export function createLenormandManualReading(payload: LenormandReadingRequest & { cards: number[] }) {
  return request<LenormandReadingResponse>('/api/lenormand/readings/manual', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ---- 雷諾曼紀錄（v27 階段 6，計畫書 3-13）：只看得到、動得到自己的；別人的或不存在的一律 404 ----
export function saveLenormandReading(payload: LenormandSaveRequest) {
  return request<LenormandSaveResponse>('/api/lenormand/readings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 新到舊；pageSize 最多 50
export function fetchLenormandReadings(params: { page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const suffix = query.toString() ? `?${query}` : ''
  return request<LenormandReadingsResponse>(`/api/lenormand/readings${suffix}`)
}

export function fetchLenormandReadingDetail(id: string) {
  return request<LenormandReadingDetail>(`/api/lenormand/readings/${encodeURIComponent(id)}`)
}

// 連同這筆的日記一起刪
export function deleteLenormandReading(id: string) {
  return request<{ deleted: boolean }>(`/api/lenormand/readings/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// 帳號設定的「刪除我的雷諾曼紀錄」（3-13）：只要登入、不需要雷諾曼權限，被收回權限的人也能清掉自己的資料
export function fetchMyLenormandData() {
  return request<{ readings: number; journals: number }>('/api/lenormand/my-data')
}

// 刪掉自己所有的雷諾曼紀錄與雷諾曼日記（塔羅的不動），無法復原
export function deleteMyLenormandData() {
  return request<{ deletedReadings: number; deletedJournals: number }>('/api/lenormand/my-data', { method: 'DELETE' })
}


// 雷諾曼 AI 解讀（v27 階段 7，計畫書 3-14）：NDJSON 串流，寫法和塔羅的 streamNarration 一樣
// （不走 request()，Authorization 自己帶；心跳判斷斷線在 ndjsonEvents）。
// 開始前的錯誤（沒權限 403、今天次數用完 429、AI 拒絕 422…）丟出後端給的訊息
export async function streamLenormandNarration(
  payload: LenormandNarrateRequest,
  options: { signal: AbortSignal; onDelta: (text: string) => void },
): Promise<{ model: string; saved: boolean | null; checks: LenormandNarrationCheck[] }> {
  const done = await postStream<LenormandNarrationEvent>('/api/lenormand/readings/narrate', payload, {
    signal: options.signal,
    label: 'AI 解讀',
    unauthorizedMessage: '請先登入後再使用 AI 解讀。',
    onEvent: (event) => options.onDelta(event.text),
  })
  return { model: done.model, saved: done.saved ?? null, checks: done.checks ?? [] }
}
