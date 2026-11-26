// 股市諮詢紀錄的行情（我的紀錄、日記頁共用，2026-11-20 抽出來；2026-11-26 占卜頁也改用這一份）：
// - 紀錄裡有存下當時的行情（做過 AI 解讀）就先顯示那一份（isSaved = true）
// - 沒存到（例如當時沒做 AI 解讀）就自動查最新報價；按「更新報價」也是查最新的
// 原本只寫在 HistoryView，日記頁直接把存下來的那一份傳給 StepResult，沒存到時「行情與技術指標」只剩標題、按更新也沒反應
import { ref, watch, type Ref } from 'vue'

import { fetchMarketSnapshot } from './api'
import type { MarketSnapshot, MarketStatus } from '../types'

// 只用得到問題類型與問題文字：紀錄（ReadingDetail）、占卜頁剛抽完的結果（2026-11-26 起 HomeView 也用這一份）都能傳進來
export interface MarketSource {
  domain?: string | null
  reading: { question: string }
}

export function useReadingMarket(detail: Readonly<Ref<MarketSource | null>>) {
  const snapshot = ref<MarketSnapshot | null>(null)
  const status = ref<MarketStatus>('idle')
  const error = ref('')
  // 目前顯示的是紀錄裡存下來的（true），還是剛查到的最新報價（false）
  const isSaved = ref(false)
  // 重複按「更新報價」或換了紀錄時，只採用最新一次的回應
  let requestId = 0

  function reset() {
    requestId += 1
    snapshot.value = null
    status.value = 'idle'
    error.value = ''
    isSaved.value = false
  }

  // 換一筆紀錄時：先放它存下來的那一份（沒有就是 null，之後 watch 會去查最新的）
  function useSaved(saved: MarketSnapshot | null) {
    requestId += 1
    snapshot.value = saved
    status.value = saved ? 'ready' : 'idle'
    error.value = ''
    isSaved.value = Boolean(saved)
  }

  // AI 解讀串流時後端給的那一份：畫面跟著換成同一份，兩邊講的數字才會一致
  function useStreamed(streamed: MarketSnapshot) {
    requestId += 1
    snapshot.value = streamed
    status.value = 'ready'
    error.value = ''
    isSaved.value = false
  }

  async function load() {
    const question = detail.value?.domain === 'stock' ? detail.value.reading.question : null
    if (question === null) return
    const own = (requestId += 1)
    status.value = 'loading'
    error.value = ''
    try {
      const result = await fetchMarketSnapshot(question)
      if (own !== requestId) return
      snapshot.value = result.snapshot
      status.value = 'ready'
      isSaved.value = false
    } catch (err) {
      if (own !== requestId) return
      error.value = err instanceof Error ? err.message : '行情暫時查不到，請稍後再試。'
      status.value = 'error'
    }
  }

  // 股市諮詢的舊紀錄沒有存到行情時，直接查最新的
  watch(detail, (current) => {
    if (current?.domain === 'stock' && !snapshot.value) void load()
  })

  return { snapshot, status, error, isSaved, reset, useSaved, useStreamed, refresh: load }
}
