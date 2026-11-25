import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import type { LenormandReadingResponse } from '../types'

// 不打真的 AI：把串流換成可以手動控制的假函式
const streamMock = vi.fn()
vi.mock('./api', () => ({ streamLenormandNarration: (...args: unknown[]) => streamMock(...args) }))

const { useLenormandNarration } = await import('./useLenormandNarration')

const READING = {
  question: '他會主動聯絡我嗎？',
  spread: { key: 'theme-3', name: '三張主題牌', description: '', cardCount: 3 },
  significator: 29,
  cards: [{ card: { id: 1 } }, { card: { id: 24 } }, { card: { id: 25 } }],
  analysis: { domain: { key: 'love', label: '感情', source: 'keywords', themeCardId: 24, themeIndex: 1 } },
} as unknown as LenormandReadingResponse

function setup(readingId = '') {
  const onDone = vi.fn()
  const narration = useLenormandNarration({ reading: ref(READING), readingId: ref(readingId), onDone })
  narration.reset(true)
  return { narration, onDone }
}

describe('雷諾曼 AI 解讀狀態', () => {
  it('串流：文字一段段接起來，寫完是 done 並通知（帶開始時的紀錄 id）；由問題判斷的類型不送', async () => {
    streamMock.mockImplementationOnce(async (_payload, options) => {
      options.onDelta('第一段')
      options.onDelta('第二段')
      return { model: 'm', saved: true, checks: [] }
    })
    const { narration, onDone } = setup('rec1')
    await narration.request()
    expect(narration.text.value).toBe('第一段第二段')
    expect(narration.status.value).toBe('done')
    expect(narration.saved.value).toBe(true)
    expect(onDone).toHaveBeenCalledWith({ text: '第一段第二段', model: 'm', saved: true, readingIdAtStart: 'rec1' })
    const payload = streamMock.mock.calls[0]![0]
    expect(payload).toEqual({ question: READING.question, spreadKey: 'theme-3', domain: undefined, significator: 29, cards: [1, 24, 25], readingId: 'rec1' })
  })

  it('停止：寫出的部分留著、狀態是 stopped，之後才到的文字丟掉，也不算寫完', async () => {
    let late: (() => void) | null = null
    streamMock.mockImplementationOnce(
      (_payload, options) =>
        new Promise((_resolve, reject) => {
          options.onDelta('寫到一半')
          options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          late = () => options.onDelta('停止後才到')
        }),
    )
    const { narration, onDone } = setup()
    const pending = narration.request()
    narration.stop()
    late!()
    await pending
    expect(narration.status.value).toBe('stopped')
    expect(narration.text.value).toBe('寫到一半')
    expect(onDone).not.toHaveBeenCalled()
  })

  it('開始前的錯誤（次數用完 429）：顯示後端的訊息，狀態是 error', async () => {
    streamMock.mockRejectedValueOnce(new Error('今天的雷諾曼 AI 解讀已用完（每天 30 次），明天再試。'))
    const { narration } = setup()
    await narration.request()
    expect(narration.status.value).toBe('error')
    expect(narration.error.value).toContain('已用完')
  })

  it('紀錄頁：照紀錄存的問題類型送（null 就不送），不看重算時是不是由問題判斷', async () => {
    streamMock.mockResolvedValue({ model: 'm', saved: true, checks: [] })
    const recordDomain = ref<'love' | null | undefined>('love')
    const narration = useLenormandNarration({ reading: ref(READING), readingId: ref('rec1'), recordDomain })
    narration.reset(true)
    await narration.request()
    expect(streamMock.mock.lastCall![0].domain).toBe('love')
    recordDomain.value = null
    await narration.request()
    expect(streamMock.mock.lastCall![0].domain).toBeUndefined()
  })

  it('紀錄裡已有解讀：restore 直接顯示為已完成；reset 清掉', () => {
    const { narration } = setup()
    narration.restore({ text: '存下來的解讀', model: 'm' })
    expect(narration.status.value).toBe('done')
    expect(narration.text.value).toBe('存下來的解讀')
    narration.reset(false)
    expect(narration.status.value).toBe('idle')
    expect(narration.text.value).toBe('')
  })
})
