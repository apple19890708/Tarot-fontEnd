import { afterEach, describe, expect, it, vi } from 'vitest'
import { ndjsonEvents, StreamStalledError } from './api'

// ndjsonEvents：AI 串流（NDJSON）逐行解析、ping 心跳、閒置逾時、提早結束時關閉連線

const encoder = new TextEncoder()

// 手動控制的串流：測試自己決定什麼時候送資料、什麼時候結束
function manualStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel,
  })
  return {
    body,
    cancel,
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
  }
}

// 把 promise 的結果先接住，避免「未處理的 rejection」，之後再檢查
function settle<T>(promise: Promise<T>) {
  const state: { status: 'pending' | 'fulfilled' | 'rejected'; value?: T; error?: unknown } = { status: 'pending' }
  promise.then(
    (value) => {
      state.status = 'fulfilled'
      state.value = value
    },
    (error) => {
      state.status = 'rejected'
      state.error = error
    },
  )
  return state
}

type Ev = { type: string; text?: string }

afterEach(() => vi.useRealTimers())

describe('ndjsonEvents', () => {
  it('跨 chunk 切開的 JSON 行、一個 chunk 多行都照順序解析，空行略過', async () => {
    const stream = manualStream()
    stream.send('{"type":"delta","text":"一"}\n\n{"type":"del')
    stream.send('ta","text":"二"}\n   \n{"type":"delta","text":"三"}\n{"type":"done"}\n')

    const events: Ev[] = []
    for await (const event of ndjsonEvents<Ev>(stream.body, 'AI 解讀')) {
      events.push(event)
      if (event.type === 'done') break
    }

    expect(events).toEqual([
      { type: 'delta', text: '一' },
      { type: 'delta', text: '二' },
      { type: 'delta', text: '三' },
      { type: 'done' },
    ])
  })

  it('多位元組的中文字被切在 chunk 中間也能正確解碼', async () => {
    const bytes = encoder.encode('{"type":"delta","text":"塔羅"}\n{"type":"done"}\n')
    // 「塔」是 3 個位元組，從它的中間切開
    const cut = bytes.indexOf(0xe5) + 1
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
      },
    })

    const events: Ev[] = []
    for await (const event of ndjsonEvents<Ev>(body, 'AI 解讀')) {
      events.push(event)
      if (event.type === 'done') break
    }
    expect(events[0]).toEqual({ type: 'delta', text: '塔羅' })
  })

  it('ping 事件不會交給呼叫端', async () => {
    const stream = manualStream()
    stream.send('{"type":"ping"}\n{"type":"delta","text":"a"}\n{"type":"ping"}\n{"type":"ping"}\n{"type":"done"}\n')

    const events: Ev[] = []
    for await (const event of ndjsonEvents<Ev>(stream.body, 'AI 解讀')) {
      events.push(event)
      if (event.type === 'done') break
    }
    expect(events.map((e) => e.type)).toEqual(['delta', 'done'])
  })

  it('最後一行沒有換行就結束：那一行照樣交出，之後仍當成意外中斷', async () => {
    const stream = manualStream()
    stream.send('{"type":"delta","text":"尾"}')
    stream.close()

    const events: Ev[] = []
    const run = async () => {
      for await (const event of ndjsonEvents<Ev>(stream.body, 'AI 解讀')) events.push(event)
    }
    await expect(run()).rejects.toThrow('連線意外中斷')
    expect(events).toEqual([{ type: 'delta', text: '尾' }])
  })

  it('串流結束但呼叫端沒有 return（沒收到 done）：丟出含 label 的錯誤', async () => {
    const stream = manualStream()
    stream.send('{"type":"delta","text":"a"}\n')
    stream.close()

    const events: Ev[] = []
    const run = async () => {
      for await (const event of ndjsonEvents<Ev>(stream.body, 'AI 追問')) events.push(event)
    }
    const error = await run().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(StreamStalledError)
    expect((error as Error).message).toContain('AI 追問')
    expect(events).toEqual([{ type: 'delta', text: 'a' }])
  })

  it('呼叫端收到第一個事件就 break：底層串流被 cancel', async () => {
    const stream = manualStream()
    stream.send('{"type":"delta","text":"a"}\n{"type":"delta","text":"b"}\n')

    for await (const event of ndjsonEvents<Ev>(stream.body, 'AI 解讀')) {
      expect(event).toEqual({ type: 'delta', text: 'a' })
      break
    }
    // reader.cancel() 是非同步的，等一輪
    await Promise.resolve()
    expect(stream.cancel).toHaveBeenCalledTimes(1)
  })

  describe('閒置逾時（fake timers）', () => {
    it('完全沒資料：150 秒前不會中斷，滿 150 秒丟 StreamStalledError，並關閉串流', async () => {
      vi.useFakeTimers()
      const stream = manualStream()
      const gen = ndjsonEvents<Ev>(stream.body, 'AI 解讀')
      const result = settle(gen.next())

      await vi.advanceTimersByTimeAsync(149_999)
      expect(result.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      expect(result.status).toBe('rejected')
      expect(result.error).toBeInstanceOf(StreamStalledError)
      expect((result.error as Error).message).toContain('AI 解讀')
      expect((result.error as Error).message).toContain('150 秒')
      expect(stream.cancel).toHaveBeenCalledTimes(1)
    })

    it('收過 ping 之後改用 45 秒的閒置時間', async () => {
      vi.useFakeTimers()
      const stream = manualStream()
      const gen = ndjsonEvents<Ev>(stream.body, 'AI 解讀')
      const result = settle(gen.next())

      stream.send('{"type":"ping"}\n')
      await vi.advanceTimersByTimeAsync(44_999)
      expect(result.status).toBe('pending')

      await vi.advanceTimersByTimeAsync(1)
      expect(result.status).toBe('rejected')
      expect(result.error).toBeInstanceOf(StreamStalledError)
      expect((result.error as Error).message).toContain('45 秒')
    })

    it('每次收到資料都重新計時：舊版後端每 100 秒一段文字不會被誤判斷線', async () => {
      vi.useFakeTimers()
      const stream = manualStream()
      const gen = ndjsonEvents<Ev>(stream.body, 'AI 解讀')

      const first = settle(gen.next())
      await vi.advanceTimersByTimeAsync(100_000)
      stream.send('{"type":"delta","text":"a"}\n')
      await vi.advanceTimersByTimeAsync(0)
      expect(first.status).toBe('fulfilled')
      expect(first.value).toEqual({ done: false, value: { type: 'delta', text: 'a' } })

      const second = settle(gen.next())
      await vi.advanceTimersByTimeAsync(100_000)
      expect(second.status).toBe('pending')
      stream.send('{"type":"done"}\n')
      await vi.advanceTimersByTimeAsync(0)
      expect(second.value).toEqual({ done: false, value: { type: 'done' } })

      await gen.return(undefined)
      expect(stream.cancel).toHaveBeenCalledTimes(1)
    })
  })
})
