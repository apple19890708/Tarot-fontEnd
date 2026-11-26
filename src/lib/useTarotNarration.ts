// 塔羅 AI 解讀的串流狀態（2026-11-26 前端優化 5，從 HomeView、HistoryView 各自的一份抽出來；參考 useLenormandNarration）：
// - 一次只有一個請求；新的請求、停止、換結果都會中斷舊的，過期的回應用 controller 比對丟掉
// - 停止：後端跟著中斷 AI、停止計費；已經寫出的部分留著，狀態是 stopped
// - 股市諮詢時後端會先送一份行情（onMarket），畫面換成 AI 用的那一份
// - 離開頁面（元件卸載）時中斷，避免繼續計費
// 寫完之後要做什麼（自動保存、更新清單的標記）由呼叫端依 request() 的回傳決定
import { onBeforeUnmount, ref } from 'vue'

import { streamNarration } from './api'
import type { MarketSnapshot, NarrationFeedback, NarrationStatus, QuestionDomain, ReadingResponse } from '../types'

// 結果頁（StepResult）顯示 AI 解讀需要的東西（2026-11-26 前端優化 9：原本是五個 prop 加兩個事件，收成一個物件）。
// 呼叫端用 reactive({ status: narrationStatus, ... }) 組起來，template 裡直接讀 narration.status。
// request／stop 沒給就是唯讀（例如日記頁只顯示存下來的那一篇）
export interface NarrationView {
  status: NarrationStatus
  text: string
  error: string
  // 最近一次解讀有沒有存回紀錄（null＝沒有對應的紀錄或不知道）
  saved?: boolean | null
  // 紀錄裡這篇解讀原本的回饋（回顧紀錄時才有）
  feedback?: NarrationFeedback | null
  // 請 AI 解讀（未登入時由呼叫端帶去登入）；停止
  request?: () => void
  stop?: () => void
}

export function useTarotNarration(options: { onMarket?: (snapshot: MarketSnapshot) => void } = {}) {
  const status = ref<NarrationStatus>('idle')
  const text = ref('')
  const error = ref('')
  // 最近一次解讀有沒有存回紀錄（null＝沒有對應的紀錄，或後端沒回報）
  const saved = ref<boolean | null>(null)
  // 最近一次完整產生的解讀用的模型
  const model = ref('')
  let controller: AbortController | null = null

  function cancel() {
    controller?.abort()
    controller = null
  }

  // 開始一篇新的解讀。完整寫完回傳結果；被停止、被新的請求取代、失敗時回傳 null（失敗的原因在 error）
  async function request(
    reading: ReadingResponse,
    params: { domain?: QuestionDomain; readingId?: string } = {},
  ): Promise<{ saved: boolean | null; model: string } | null> {
    cancel()
    const own = new AbortController()
    controller = own
    text.value = ''
    error.value = ''
    saved.value = null
    model.value = ''
    // 行情不清掉：AI 開始寫之前畫面上照樣有數字，收到 AI 用的那一份再換掉
    status.value = 'loading'

    try {
      const result = await streamNarration(reading, {
        signal: own.signal,
        domain: params.domain,
        // 已經保存過才有 id；後端會在完整產生後把解讀存回那筆紀錄
        readingId: params.readingId,
        onMarket: (snapshot) => {
          // AI 用的是這一份，畫面跟著換成同一份，兩邊講的數字才會一致
          if (own === controller) options.onMarket?.(snapshot)
        },
        onDelta: (delta) => {
          if (own === controller) {
            text.value += delta
            status.value = 'streaming'
          }
        },
      })
      if (own !== controller) return null
      status.value = 'done'
      saved.value = result.saved
      model.value = result.model || ''
      return { saved: result.saved, model: model.value }
    } catch (err) {
      // 被停止或被新的請求取代時，狀態已由呼叫端處理
      if (own !== controller) return null
      error.value = err instanceof Error ? err.message : 'AI 解讀暫時無法使用'
      status.value = 'error'
      return null
    } finally {
      if (own === controller) controller = null
    }
  }

  // 停止：已經寫出來的留著
  function stop() {
    cancel()
    status.value = text.value ? 'stopped' : 'ready'
  }

  onBeforeUnmount(cancel)

  return { status, text, error, saved, model, request, stop, cancel }
}
