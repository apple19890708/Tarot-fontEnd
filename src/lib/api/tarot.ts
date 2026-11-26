// 塔羅：牌陣、抽牌、占卜紀錄（v13）、抽牌追問（v23）、AI 解讀
import type { CardSummary, CustomPosition, FollowUpRound, ManualCardPick, MarketSnapshot, NarrationFeedback, NarrationFeedbackReason, NarrationFeedbackValue, NarrationStreamEvent, QuestionDomain, ReadingDetail, ReadingHistoryResponse, ReadingResponse, Spread } from '../../types'

import { postStream, request } from './client'

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

// AI 解讀的回饋（v25）：target 是原本的解讀或追問的延伸回答；value 為 null 時取消回饋
export function updateNarrationFeedback(
  id: string,
  payload: { target: 'narration' | 'followUp'; value: NarrationFeedbackValue | null; reason?: NarrationFeedbackReason | null },
) {
  return request<{ saved: boolean; feedback: NarrationFeedback | null }>(`/api/readings/${id}/narration-feedback`, {
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
  const done = await postStream<NarrationStreamEvent>(
    '/api/readings/follow-up/narrate',
    {
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
    },
    {
      signal: options.signal,
      label: 'AI 追問',
      unauthorizedMessage: '請先登入後再使用 AI 追問。',
      onEvent: (event) => {
        if (event.type === 'start') options.onStart?.(event.kept)
        else if (event.type === 'delta') options.onDelta(event.text)
      },
    },
  )
  return { model: done.model, saved: done.saved ?? null }
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
  const done = await postStream<NarrationStreamEvent>(
    '/api/readings/narrate',
    {
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
    },
    {
      signal: options.signal,
      label: 'AI 解讀',
      unauthorizedMessage: '請先登入後再使用 AI 解讀。',
      onEvent: (event) => {
        if (event.type === 'delta') options.onDelta(event.text)
        else if (event.type === 'market') options.onMarket?.(event.snapshot)
      },
    },
  )
  // 舊版後端沒有 saved，當成不知道（null），畫面就不顯示存檔結果
  return { model: done.model, saved: done.saved ?? null }
}
