// 雷諾曼 AI 解讀的狀態（v27 階段 7，計畫書 3-14）：占卜頁與雷諾曼紀錄頁共用。
// 寫法照塔羅 HomeView 的 loadNarration：
// - 一次只有一個請求；新的請求、停止、換結果都會中斷舊的，過期的回應用 controller 比對丟掉
// - 停止：後端跟著中斷 AI、停止計費；已經寫出的部分留著，狀態是 stopped
// - 有 readingId（已保存的紀錄）時，後端完整產生後把解讀存回那一筆（saved 告訴我們有沒有存成）
// 離開頁面（元件卸載）時中斷，避免繼續計費
import { onBeforeUnmount, ref, type Ref } from 'vue'

import { streamLenormandNarration } from './api'
import type { LenormandDomain, LenormandNarrationCheck, LenormandReadingResponse, NarrationStatus } from '../types'

export interface NarrationResult {
  text: string
  model: string
  saved: boolean | null
  // 開始時帶的紀錄 id（空字串＝當時還沒保存）
  readingIdAtStart: string
}

export function useLenormandNarration(options: {
  reading: Readonly<Ref<LenormandReadingResponse | null>>
  // 已保存的紀錄 id；還沒保存是空字串
  readingId: Readonly<Ref<string>>
  // 紀錄頁：照紀錄存下的問題類型送（null＝存的時候沒指定）。後端要牌陣、牌號、代表牌、問題類型都和紀錄一致才會存回（3-14）。
  // 沒給（占卜頁）就用「使用者自己選的才送」的規則，和保存時一致
  recordDomain?: Readonly<Ref<LenormandDomain | null | undefined>>
  // 完整寫完時（不含停止、失敗）
  onDone?: (result: NarrationResult) => void
}) {
  const status = ref<NarrationStatus>('idle')
  const text = ref('')
  const error = ref('')
  const saved = ref<boolean | null>(null)
  const model = ref('')
  const checks = ref<LenormandNarrationCheck[]>([])
  let controller: AbortController | null = null

  function cancel() {
    controller?.abort()
    controller = null
  }

  // 換了一組牌（新結果、重抽、重新開始、紀錄頁換一筆）：清掉並回到「可以請 AI」或什麼都沒有
  function reset(hasReading: boolean) {
    cancel()
    status.value = hasReading ? 'ready' : 'idle'
    text.value = ''
    error.value = ''
    saved.value = null
    model.value = ''
    checks.value = []
  }

  // 紀錄裡已經存了一篇：直接顯示，狀態是已完成（可以重新產生）
  function restore(saved_: { text: string; model?: string; checks?: LenormandNarrationCheck[] }) {
    cancel()
    text.value = saved_.text
    model.value = saved_.model ?? ''
    checks.value = saved_.checks ?? []
    error.value = ''
    saved.value = null
    status.value = 'done'
  }

  // 送給後端的問題類型：紀錄頁照紀錄存的；占卜頁只送使用者自己選的，由問題文字判斷的讓後端重新判斷（和保存一樣）
  function domainOf(current: LenormandReadingResponse) {
    const recorded = options.recordDomain?.value
    if (recorded !== undefined) return recorded ?? undefined
    return current.analysis.domain.source === 'selected' ? (current.analysis.domain.key ?? undefined) : undefined
  }

  async function request() {
    const current = options.reading.value
    if (!current || status.value === 'loading' || status.value === 'streaming') return
    cancel()
    const own = new AbortController()
    controller = own
    const readingIdAtStart = options.readingId.value
    text.value = ''
    error.value = ''
    saved.value = null
    model.value = ''
    checks.value = []
    status.value = 'loading'
    try {
      const result = await streamLenormandNarration(
        {
          question: current.question,
          spreadKey: current.spread.key,
          domain: domainOf(current),
          significator: current.significator ?? undefined,
          cards: current.cards.map((entry) => entry.card.id),
          readingId: readingIdAtStart || undefined,
        },
        {
          signal: own.signal,
          onDelta: (delta) => {
            if (own !== controller) return
            text.value += delta
            status.value = 'streaming'
          },
        },
      )
      if (own !== controller) return
      status.value = 'done'
      saved.value = result.saved
      model.value = result.model
      checks.value = result.checks
      controller = null
      options.onDone?.({ text: text.value, model: result.model, saved: result.saved, readingIdAtStart })
    } catch (err) {
      // 被停止或被新的請求取代：狀態由呼叫端處理
      if (own !== controller) return
      controller = null
      error.value = err instanceof Error ? err.message : 'AI 解讀暫時無法使用'
      status.value = 'error'
    }
  }

  // 停止：已經寫出來的留著
  function stop() {
    cancel()
    status.value = text.value ? 'stopped' : 'ready'
  }

  onBeforeUnmount(cancel)

  return { status, text, error, saved, model, checks, request, stop, reset, restore }
}
