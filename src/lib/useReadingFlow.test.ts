import { describe, expect, it, vi } from 'vitest'

// 換步驟後，還在路上的抽牌結果要丟掉（2026-11-26 前端優化 2）
vi.mock('./api', () => ({ fetchCards: vi.fn(async () => []) }))

const { useReadingFlow } = await import('./useReadingFlow')

const SPREAD = { key: 's3', name: '三張', cardCount: 1, description: '', positions: [{ key: 'p', label: 'p', prompt: '' }] }
const CARD = { id: 'c1', nameZh: '牌', nameEn: 'card', image: '' }

// 可以從外面決定什麼時候回來的請求
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function setup() {
  const manual = deferred<{ id: string }>()
  const auto = deferred<{ id: string }>()
  const onResult = vi.fn()
  const flow = useReadingFlow({
    defaultSpreadKey: 's3',
    fetchSpreads: async () => [SPREAD],
    loadCards: async () => [CARD],
    modesFor: () => ['fan', 'auto', 'input'],
    drawAuto: () => auto.promise,
    drawManual: () => manual.promise,
    onResult,
  })
  return { flow, manual, auto, onResult }
}

describe('抽牌請求的過期回應', () => {
  it('送出後按「回到問題」：晚到的結果丟掉，停在問題步驟、不算載入中', async () => {
    const { flow, manual, onResult } = setup()
    await flow.bootstrap()
    await flow.goToDraw()
    await flow.setDrawMode('input')
    flow.draw.setInputCard(0, CARD)
    const pending = flow.handleManualSubmit()
    expect(flow.isLoading.value).toBe(true)
    flow.backToQuestion()
    expect(flow.step.value).toBe(1)
    expect(flow.isLoading.value).toBe(false)
    manual.resolve({ id: 'late' })
    await pending
    expect(flow.step.value).toBe(1)
    expect(flow.reading.value).toBeNull()
    expect(onResult).not.toHaveBeenCalled()
  })

  it('自動抽牌中重新開始：晚到的結果不會留在待發的牌裡', async () => {
    const { flow, auto } = setup()
    await flow.bootstrap()
    await flow.goToDraw()
    const pending = flow.handleAutoDraw()
    flow.restart()
    auto.resolve({ id: 'late' })
    await pending
    expect(flow.pendingAutoReading.value).toBeNull()
    expect(flow.isLoading.value).toBe(false)
  })

  it('沒換步驟：結果照常進結果頁', async () => {
    const { flow, manual, onResult } = setup()
    await flow.bootstrap()
    await flow.goToDraw()
    await flow.setDrawMode('input')
    flow.draw.setInputCard(0, CARD)
    const pending = flow.handleManualSubmit()
    manual.resolve({ id: 'ok' })
    await pending
    expect(flow.step.value).toBe(3)
    expect(flow.reading.value).toEqual({ id: 'ok' })
    expect(onResult).toHaveBeenCalledTimes(1)
  })
})
