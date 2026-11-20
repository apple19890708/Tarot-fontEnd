import { describe, expect, it } from 'vitest'

import { clearDraft, emptyDoc, firstLineOf, hasText, loadDraft, outcomeLabel, saveDraft, trimTrailingEmpty } from './journal'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '他回訊息了' }] }] }

describe('占卜日記', () => {
  it('結果標記的名稱；不認得的當成還不知道', () => {
    expect(outcomeLabel('hit')).toBe('應驗了')
    expect(outcomeLabel(null)).toBe('還不知道')
  })

  it('有沒有寫字：空段落、只有空白不算', () => {
    expect(hasText(emptyDoc())).toBe(false)
    expect(hasText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '  ' }] }, { type: 'horizontalRule' }] })).toBe(false)
    expect(hasText(DOC)).toBe(true)
  })

  it('草稿：每個對象各自一份；存了拿得回來，清掉就沒有', () => {
    const store = memoryStore()
    saveDraft('reading:a', { entryId: null, content: DOC, outcome: 'hit', entryDate: '2026-11-20' }, store, 1000)
    expect(loadDraft('reading:a', store, 2000)?.outcome).toBe('hit')
    expect(loadDraft('reading:b', store, 2000)).toBeNull()
    clearDraft('reading:a', store)
    expect(loadDraft('reading:a', store, 2000)).toBeNull()
  })

  it('草稿：超過一個月或壞掉的當沒有，並清掉', () => {
    const store = memoryStore()
    saveDraft('daily:2026-10-01', { entryId: 'x', content: DOC, outcome: null, entryDate: '2026-10-01' }, store, 0)
    expect(loadDraft('daily:2026-10-01', store, 31 * 24 * 60 * 60 * 1000)).toBeNull()
    expect(store.getItem('tarot.journal.draft.daily:2026-10-01')).toBeNull()
    store.setItem('tarot.journal.draft.reading:c', '{壞掉')
    expect(loadDraft('reading:c', store)).toBeNull()
  })

  it('儲存前去掉結尾的空段落；中間的空行留著；全空時留一個段落', () => {
    const P = { type: 'paragraph' }
    const T = DOC.content[0]!
    expect(trimTrailingEmpty({ type: 'doc', content: [T, P, T, P, P] }).content).toEqual([T, P, T])
    expect(trimTrailingEmpty({ type: 'doc', content: [P, P] }).content).toEqual([P])
  })

  it('內文第一行：跳過空段落與分隔線，清單、待辦裡的也算；沒有字是空字串', () => {
    const P = (text?: string) => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) })
    expect(firstLineOf({ type: 'doc', content: [P(), { type: 'horizontalRule' }, P('  第一行  '), P('第二行')] })).toBe('第一行')
    expect(firstLineOf({ type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [P('問清楚')] }] }] })).toBe('問清楚')
    expect(firstLineOf({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '粗' }, { type: 'text', text: '體', marks: [{ type: 'bold' }] }] }] })).toBe('粗體')
    expect(firstLineOf(emptyDoc())).toBe('')
  })
})
