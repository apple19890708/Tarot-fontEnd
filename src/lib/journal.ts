// 占卜日記（v26 計畫 2）的共用設定與草稿。
// 日記寫在一筆塔羅紀錄（reading:<id>）或一筆股票分析（stock:<id>）底下；每日一牌的日記 2026-11-20 使用者決定拿掉。
// 草稿：編輯中自動存在這台瀏覽器（localStorage，包 try/catch），網頁關掉再開不會不見；按「儲存」才送後端
import type { JournalContent, JournalOutcome } from '../types'

export const OUTCOME_OPTIONS: { value: JournalOutcome; label: string }[] = [
  { value: null, label: '還不知道' },
  { value: 'hit', label: '應驗了' },
  { value: 'partial', label: '部分應驗' },
  { value: 'miss', label: '沒有應驗' },
]

export function outcomeLabel(value: JournalOutcome) {
  return OUTCOME_OPTIONS.find((option) => option.value === value)?.label ?? '還不知道'
}

export function emptyDoc(): JournalContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

// 有沒有寫字（只有空段落、分隔線不算）
export function hasText(content: JournalContent | null | undefined): boolean {
  const walk = (node: JournalContent): boolean => (node.type === 'text' && Boolean(node.text?.trim())) || (node.content ?? []).some(walk)
  return Boolean(content) && walk(content!)
}

// 儲存前去掉結尾的空段落（按了幾次 Enter 才停手），時間軸上才不會多一塊空白；全部都空時留一個
export function trimTrailingEmpty(content: JournalContent): JournalContent {
  const blocks = [...(content.content ?? [])]
  const last = () => blocks[blocks.length - 1]!
  while (blocks.length > 1 && last().type === 'paragraph' && !last().content?.length) blocks.pop()
  return { ...content, content: blocks }
}

// 列表預覽用：內文的第一行（第一個有字的區塊，標題、段落、清單、待辦都算）
export function firstLineOf(content: JournalContent | null | undefined): string {
  const textOf = (node: JournalContent): string => (node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join(''))
  const LEAF_BLOCKS = new Set(['paragraph', 'heading'])
  const walk = (node: JournalContent): string => {
    if (LEAF_BLOCKS.has(node.type)) return textOf(node).replace(/\s+/g, ' ').trim()
    for (const child of node.content ?? []) {
      const line = walk(child)
      if (line) return line
    }
    return ''
  }
  return content ? walk(content) : ''
}

export interface JournalDraft {
  // 編輯哪一篇；新的一篇是 null
  entryId: string | null
  // 舊的草稿沒有標題
  title?: string
  content: JournalContent
  outcome: JournalOutcome
  entryDate: string
  savedAt: number
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const draftKey = (target: string) => `tarot.journal.draft.${target}`
// 草稿留一個月，太舊的當沒有（避免 localStorage 越堆越多）
const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function loadDraft(target: string, store = storage(), now = Date.now()): JournalDraft | null {
  try {
    const raw = store?.getItem(draftKey(target))
    if (!raw) return null
    const draft = JSON.parse(raw) as JournalDraft
    if (draft?.content?.type === 'doc' && typeof draft.entryDate === 'string' && now - draft.savedAt < DRAFT_TTL_MS) return draft
    store?.removeItem(draftKey(target))
  } catch {
    // 壞掉的草稿當沒有
  }
  return null
}

export function saveDraft(target: string, draft: Omit<JournalDraft, 'savedAt'>, store = storage(), now = Date.now()) {
  try {
    store?.setItem(draftKey(target), JSON.stringify({ ...draft, savedAt: now }))
  } catch {
    // 存不了（無痕、空間滿）：只是關掉網頁後草稿不見
  }
}

export function clearDraft(target: string, store = storage()) {
  try {
    store?.removeItem(draftKey(target))
  } catch {
    // 同上
  }
}
