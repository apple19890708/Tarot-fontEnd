import { describe, expect, it } from 'vitest'

import { readResultSnapshot, restoredNarrationStatus, RESULT_SNAPSHOT_KEY, RESULT_SNAPSHOT_TTL_MS, writeResultSnapshot, type ResultSnapshot } from './resultSnapshot'
import type { ReadingResponse } from '../types'

// 假的 sessionStorage
function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const reading = { question: '要換工作嗎', cards: [{ card: { id: 'fool' }, orientation: 'upright' }], analysis: { text: 'x' } } as unknown as ReadingResponse
const base = { reading, question: '要換工作嗎', domain: 'work' as const, narrationText: '', savedReadingId: '' }

describe('占卜結果快照', () => {
  it('存了讀得回來，savedAt 是存的時間；沒有結果就清掉', () => {
    const storage = memoryStorage()
    writeResultSnapshot(base, { now: 1000, storage })
    expect(readResultSnapshot({ now: 2000, storage })).toMatchObject({ question: '要換工作嗎', savedAt: 1000 })
    writeResultSnapshot(null, { storage })
    expect(storage.data.has(RESULT_SNAPSHOT_KEY)).toBe(false)
  })

  it('超過 2 小時、壞掉的 JSON、沒有牌的都不還原，並清掉', () => {
    const storage = memoryStorage()
    writeResultSnapshot(base, { now: 0, storage })
    expect(readResultSnapshot({ now: RESULT_SNAPSHOT_TTL_MS + 1, storage })).toBeNull()
    expect(storage.data.has(RESULT_SNAPSHOT_KEY)).toBe(false)

    storage.setItem(RESULT_SNAPSHOT_KEY, '{壞掉')
    expect(readResultSnapshot({ storage })).toBeNull()
    expect(storage.data.has(RESULT_SNAPSHOT_KEY)).toBe(false)

    writeResultSnapshot({ ...base, reading: { ...reading, cards: [] } }, { now: 0, storage })
    expect(readResultSnapshot({ now: 1, storage })).toBeNull()
  })

  it('沒有 storage（無痕、封鎖）時不丟錯', () => {
    expect(() => writeResultSnapshot(base, { storage: null })).not.toThrow()
    expect(readResultSnapshot({ storage: null })).toBeNull()
  })

  it('還原後的 AI 解讀狀態：寫完是完成、寫到一半是已停止、沒文字看有沒有組合分析', () => {
    const snap = (extra: Partial<ResultSnapshot>) => ({ ...base, savedAt: 0, ...extra }) as ResultSnapshot
    expect(restoredNarrationStatus(snap({ narrationText: '解讀', narrationDone: true }))).toBe('done')
    // 舊快照沒有 narrationDone：當成已停止，之後保存不會帶上不完整的解讀
    expect(restoredNarrationStatus(snap({ narrationText: '寫到一半' }))).toBe('stopped')
    expect(restoredNarrationStatus(snap({}))).toBe('ready')
    expect(restoredNarrationStatus(snap({ reading: { ...reading, analysis: undefined } as unknown as ReadingResponse }))).toBe('idle')
  })
})
