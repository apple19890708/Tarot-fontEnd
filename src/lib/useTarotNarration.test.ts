import { describe, expect, it, vi } from 'vitest'

import type { MarketSnapshot, ReadingResponse } from '../types'

// 不打真的 AI：把串流換成可以手動控制的假函式
const streamMock = vi.fn()
vi.mock('./api', () => ({ streamNarration: (...args: unknown[]) => streamMock(...args) }))
// 不在元件裡呼叫，onBeforeUnmount 只會出警告；測試不需要它
vi.mock('vue', async (original) => ({ ...(await original<typeof import('vue')>()), onBeforeUnmount: () => {} }))

const { useTarotNarration } = await import('./useTarotNarration')

const READING = { question: '這份工作適合我嗎？', cards: [] } as unknown as ReadingResponse

// 照 signal 中斷時丟錯，像真的 fetch 一樣
function pendingStream(onStart: (options: { onDelta: (text: string) => void; onMarket?: (s: MarketSnapshot) => void }) => void) {
  let late: ((text: string) => void) | null = null
  streamMock.mockImplementationOnce(
    (_reading, options) =>
      new Promise((_resolve, reject) => {
        onStart(options)
        options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        late = (text) => options.onDelta(text)
      }),
  )
  return (text: string) => late!(text)
}

describe('塔羅 AI 解讀狀態', () => {
  it('串流：文字接起來，寫完是 done，回傳 saved 與模型；問題類型與紀錄 id 照傳', async () => {
    streamMock.mockImplementationOnce(async (_reading, options) => {
      options.onDelta('第一段')
      options.onDelta('第二段')
      return { model: 'm', saved: true }
    })
    const narration = useTarotNarration()
    const result = await narration.request(READING, { domain: 'work', readingId: 'rec1' })
    expect(result).toEqual({ saved: true, model: 'm' })
    expect(narration.text.value).toBe('第一段第二段')
    expect(narration.status.value).toBe('done')
    expect(narration.saved.value).toBe(true)
    expect(narration.model.value).toBe('m')
    const [reading, options] = streamMock.mock.calls[streamMock.mock.calls.length - 1]!
    expect(reading).toBe(READING)
    expect(options).toMatchObject({ domain: 'work', readingId: 'rec1' })
  })

  it('股市諮詢：後端先送的行情交給 onMarket', async () => {
    const snapshot = { symbol: '2330' } as unknown as MarketSnapshot
    streamMock.mockImplementationOnce(async (_reading, options) => {
      options.onMarket(snapshot)
      return { model: 'm', saved: null }
    })
    const onMarket = vi.fn()
    const narration = useTarotNarration({ onMarket })
    await narration.request(READING)
    expect(onMarket).toHaveBeenCalledWith(snapshot)
  })

  it('停止：寫出的部分留著、狀態是 stopped，之後才到的文字丟掉，回傳 null', async () => {
    const late = pendingStream((options) => options.onDelta('寫到一半'))
    const narration = useTarotNarration()
    const pending = narration.request(READING)
    narration.stop()
    late('停止後才到')
    expect(await pending).toBeNull()
    expect(narration.status.value).toBe('stopped')
    expect(narration.text.value).toBe('寫到一半')
  })

  it('還沒寫出字就停止：回到 ready', async () => {
    pendingStream(() => {})
    const narration = useTarotNarration()
    const pending = narration.request(READING)
    narration.stop()
    await pending
    expect(narration.status.value).toBe('ready')
  })

  it('新的請求取代舊的：舊的文字與結果都丟掉', async () => {
    const late = pendingStream((options) => options.onDelta('舊的'))
    const narration = useTarotNarration()
    const first = narration.request(READING)
    streamMock.mockImplementationOnce(async (_reading, options) => {
      options.onDelta('新的')
      return { model: 'm2', saved: false }
    })
    const second = narration.request(READING)
    late('舊的晚到')
    expect(await first).toBeNull()
    expect(await second).toEqual({ saved: false, model: 'm2' })
    expect(narration.text.value).toBe('新的')
  })

  it('失敗：顯示後端的原因，狀態是 error，回傳 null', async () => {
    streamMock.mockImplementationOnce(async () => {
      throw new Error('今天的 AI 次數用完了')
    })
    const narration = useTarotNarration()
    expect(await narration.request(READING)).toBeNull()
    expect(narration.status.value).toBe('error')
    expect(narration.error.value).toBe('今天的 AI 次數用完了')
  })
})
