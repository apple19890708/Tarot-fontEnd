// 塔羅占卜紀錄（v13）、AI 解讀的回饋（v25）、抽牌追問（v23）
import type { MarketSnapshot } from './marketTrack'
import type { QuestionDomain, ReadingCard, ReadingResponse } from './tarot'

// ===== 占卜紀錄（v13）=====
// 後端只存牌與正逆位，分析在讀取時重算；AI 解讀則原樣保存

export interface ReadingHistoryCard {
  id: string
  nameZh: string
  orientation: 'upright' | 'reversed'
}

// 列表用的摘要，不含分析與 AI 文字
export interface ReadingSummary {
  id: string
  question: string
  domain: QuestionDomain | null
  spreadKey: string | null
  spreadName: string
  cardCount: number
  cards: ReadingHistoryCard[]
  hasNarration: boolean
  createdAt: string
}

export interface ReadingHistoryResponse {
  page: number
  pageSize: number
  total: number
  readings: ReadingSummary[]
}

export interface SavedNarration {
  text: string
  model: string
  // 解讀當下查到的市場資料；不是股市問題、或舊紀錄時沒有
  market?: MarketSnapshot | null
  createdAt: string
  // 使用者的回饋（v25）；舊版後端沒有這個欄位
  feedback?: NarrationFeedback | null
}

// ===== AI 解讀的回饋（v25 階段 4）=====
// 有幫助／沒幫助；沒幫助時可以選一個原因。存在紀錄裡，用來統計哪類問題寫得不好
export type NarrationFeedbackValue = 'up' | 'down'
export type NarrationFeedbackReason = 'off-topic' | 'vague' | 'timing' | 'too-long' | 'other'
export interface NarrationFeedback {
  value: NarrationFeedbackValue
  reason: NarrationFeedbackReason | null
  at?: string
}
export const NARRATION_FEEDBACK_REASONS: { value: NarrationFeedbackReason; label: string }[] = [
  { value: 'off-topic', label: '沒回答到問題' },
  { value: 'vague', label: '太籠統' },
  { value: 'timing', label: '時間不對' },
  { value: 'too-long', label: '太長' },
  { value: 'other', label: '其他' },
]


// 單筆回顧：reading 由後端重算，narration 是當初存下來的 AI 解讀
export interface ReadingDetail {
  id: string
  createdAt: string
  domain: QuestionDomain | null
  reading: ReadingResponse
  narration: SavedNarration | null
  // 抽牌追問（v23）；舊版後端沒有這兩個欄位
  followUps?: FollowUpRound[]
  // rounds：這篇延伸回答寫的時候涵蓋了幾次追問（0 或沒有＝不知道，當成全部涵蓋）
  followUpNarration?: { text: string; model: string; rounds?: number; createdAt: string; feedback?: NarrationFeedback | null } | null
}

// ===== 抽牌追問（v23）=====
// 占卜完針對同一件事再問、再抽 1～3 張補充牌，最多三次。補充牌沒有牌陣位置
export type FollowUpCard = Omit<ReadingCard, 'position'>

export interface FollowUpRound {
  question: string
  cards: FollowUpCard[]
  createdAt?: string
}

// 追問的 AI 延伸回答的狀態（沒有 ready：有沒有按鈕看的是有沒有追問）
export type FollowUpStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'stopped' | 'error'

export const FOLLOW_UP_MAX_ROUNDS = 3
export const FOLLOW_UP_MAX_CARDS = 3
export const FOLLOW_UP_QUESTION_MAX = 200

// 結果頁「保存紀錄」的狀態
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
