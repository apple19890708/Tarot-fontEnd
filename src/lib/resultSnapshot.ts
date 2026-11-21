// 占卜結果的暫存（sessionStorage）。占卜頁用它在登入來回、重新整理時還原結果；
// 登出時也要清掉，下一個人不該看到上一個人的牌。
// 存檔、讀回、過期判斷都在這裡（2026-11-21 從 HomeView 搬出來），storage 可以換成假的，單元測試不需要瀏覽器
import type { FollowUpRound, NarrationStatus, QuestionDomain, ReadingResponse } from '../types'

export const RESULT_SNAPSHOT_KEY = 'tarot_result_snapshot'

// 太舊的快照不還原，免得隔很久回到這個分頁，看到的是上次的牌
export const RESULT_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000

export interface ResultSnapshot {
  reading: ReadingResponse
  question: string
  domain: QuestionDomain | ''
  narrationText: string
  // 解讀是不是完整產生的（舊快照沒有）：還原成「已停止」的話，之後保存不會帶上解讀
  narrationDone?: boolean
  narrationModel?: string
  // 已經保存成紀錄的話，登入回來不要又變成沒存過
  savedReadingId: string
  savedAt: number
  // 抽牌追問（舊快照沒有）：補充牌與已經寫好的延伸回答
  followUps?: FollowUpRound[]
  followUpText?: string
  followUpModel?: string
  followUpAnswered?: number
}

type SnapshotStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// 無痕視窗、封鎖儲存時 sessionStorage 本身就會丟例外
function defaultStorage(): SnapshotStorage | null {
  try {
    return sessionStorage
  } catch {
    return null
  }
}

export function clearResultSnapshot(storage: SnapshotStorage | null = defaultStorage()) {
  try {
    storage?.removeItem(RESULT_SNAPSHOT_KEY)
  } catch {
    // 本來就沒有東西可清
  }
}

// 存一份；沒有結果（null）就清掉。存不起來（容量不足、無痕）只是沒有還原功能，不影響其他流程
export function writeResultSnapshot(
  snapshot: Omit<ResultSnapshot, 'savedAt'> | null,
  { now = Date.now(), storage = defaultStorage() }: { now?: number; storage?: SnapshotStorage | null } = {},
) {
  if (!snapshot) {
    clearResultSnapshot(storage)
    return
  }
  try {
    storage?.setItem(RESULT_SNAPSHOT_KEY, JSON.stringify({ ...snapshot, savedAt: now }))
  } catch {
    // 見上
  }
}

// 讀回來：沒有、壞掉、沒有牌、過期都回 null，並把壞掉或過期的清掉
export function readResultSnapshot({ now = Date.now(), storage = defaultStorage() }: { now?: number; storage?: SnapshotStorage | null } = {}): ResultSnapshot | null {
  try {
    const raw = storage?.getItem(RESULT_SNAPSHOT_KEY)
    if (!raw) return null
    const snapshot = JSON.parse(raw) as ResultSnapshot
    if (!snapshot?.reading?.cards?.length || !snapshot.savedAt || now - snapshot.savedAt > RESULT_SNAPSHOT_TTL_MS) {
      clearResultSnapshot(storage)
      return null
    }
    return snapshot
  } catch {
    clearResultSnapshot(storage)
    return null
  }
}

// 還原後 AI 解讀的狀態：寫完的是「完成」，寫到一半被中斷的留著文字、標成「已停止」（可以再按一次繼續）；
// 沒有文字時看結果有沒有組合分析（有才能請 AI 解讀）
export function restoredNarrationStatus(snapshot: ResultSnapshot): NarrationStatus {
  if (snapshot.narrationText) return snapshot.narrationDone ? 'done' : 'stopped'
  return snapshot.reading.analysis ? 'ready' : 'idle'
}
