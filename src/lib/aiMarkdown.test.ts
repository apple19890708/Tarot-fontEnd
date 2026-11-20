// 追問的延伸回答照「## 追問 N｜…」「## 綜合來看」切開（純字串，不需要瀏覽器）。
// renderAiMarkdown 要 DOM（DOMPurify），這裡不測。
import { describe, expect, it } from 'vitest'

import { keepAnsweredSections, splitFollowUpAnswer } from './aiMarkdown'

const ANSWER = ['開場的一句話', '## 追問 1｜他會回來嗎', '**傾向會。**', '說明一', '## 追問 2｜什麼時候', '大約明年春天。', '## 綜合來看', '**結論。**'].join('\n')

describe('splitFollowUpAnswer', () => {
  it('每次追問一段，標題不留；第一個標題前的文字歸到綜合來看', () => {
    const { rounds, summary } = splitFollowUpAnswer(ANSWER)
    expect(rounds).toEqual(['**傾向會。**\n說明一', '大約明年春天。'])
    expect(summary).toBe('開場的一句話\n**結論。**')
  })

  it('AI 沒照標題寫時，全部放進綜合來看，不會不見', () => {
    expect(splitFollowUpAnswer('只有一段文字')).toEqual({ rounds: [], summary: '只有一段文字' })
  })

  it('空字串或 null 不會出錯', () => {
    expect(splitFollowUpAnswer('')).toEqual({ rounds: [], summary: '' })
    expect(splitFollowUpAnswer(null as unknown as string)).toEqual({ rounds: [], summary: '' })
  })
})

describe('keepAnsweredSections', () => {
  it('留下前 count 次已經寫好的段落（含標題）', () => {
    const { kept, text } = keepAnsweredSections(ANSWER, 1)
    expect(kept).toBe(1)
    expect(text).toBe('## 追問 1｜他會回來嗎\n**傾向會。**\n說明一')
  })

  it('從追問 1 起要連續都有內容才算；中間缺一段就停', () => {
    const missingFirst = ['## 追問 2｜什麼時候', '大約明年春天。'].join('\n')
    expect(keepAnsweredSections(missingFirst, 2)).toEqual({ kept: 0, text: '' })
    const emptyFirst = ['## 追問 1｜他會回來嗎', '', '## 追問 2｜什麼時候', '大約明年春天。'].join('\n')
    expect(keepAnsweredSections(emptyFirst, 2).kept).toBe(0)
  })

  it('綜合來看不算在任何一段裡', () => {
    const { text } = keepAnsweredSections(ANSWER, 2)
    expect(text).not.toContain('綜合來看')
    expect(text).toContain('大約明年春天。')
  })
})
