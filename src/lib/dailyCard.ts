// 每日一牌的跨頁狀態（v26 計畫 1，2026-11-20 使用者要求）：
// - 每天第一次打開網站時跳出每日一牌彈窗（訪客與會員都會），同一台瀏覽器一天只跳一次，關掉就不再跳
// - 訪客抽的牌記在這台瀏覽器（當天再打開看到的是同一張）；登入或註冊後用伺服器簽的領取憑證存進月曆
// - todayStatus 給頂欄（每日一牌旁的小點）與月曆提醒共用
// localStorage 一律包 try/catch：無痕視窗或封鎖儲存時當成沒有記錄，只是可能多跳一次彈窗
import { ref } from 'vue'

import { claimDailyCard } from './api'
import type { DailyCard, DailyCardResponse } from '../types'

const PROMPTED_KEY = 'tarot.dailyCard.prompted'
const GUEST_KEY = 'tarot.dailyCard.guest'
// 這個分頁抽過訪客牌（sessionStorage）：共用電腦時，下一個人在別的視窗登入不會把前一位訪客的牌領走（api-reviewer 2026-11-20）
const DRAWN_HERE_KEY = 'tarot.dailyCard.drawnHere'

export interface GuestDailyCard {
  date: string
  dailyCard: DailyCard
  claim: string
}

// 台北時間的今天 YYYY-MM-DD（和後端的「一天」一致，不管使用者在哪個時區）
export function taipeiToday(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
function storage(): Store | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function read(key: string, store = storage()) {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(key: string, value: string | null, store = storage()) {
  try {
    if (value === null) store?.removeItem(key)
    else store?.setItem(key, value)
  } catch {
    // 存不了：最多是下次再跳一次彈窗
  }
}

// 今天跳過彈窗了沒
export function promptedToday(today = taipeiToday(), store = storage()) {
  return read(PROMPTED_KEY, store) === today
}

export function markPrompted(today = taipeiToday(), store = storage()) {
  write(PROMPTED_KEY, today, store)
}

// 訪客今天抽的牌（不是今天的就當沒有，順便清掉）
export function guestCardToday(today = taipeiToday(), store = storage()): GuestDailyCard | null {
  const raw = read(GUEST_KEY, store)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as GuestDailyCard
    if (parsed?.date === today && parsed.dailyCard && parsed.claim) return parsed
  } catch {
    // 壞掉的資料當沒有
  }
  write(GUEST_KEY, null, store)
  return null
}

export function saveGuestCard(result: DailyCardResponse, store = storage()) {
  if (!result.dailyCard || !result.claim) return
  write(GUEST_KEY, JSON.stringify({ date: result.today, dailyCard: result.dailyCard, claim: result.claim } satisfies GuestDailyCard), store)
  markDrawnHere(result.today)
}

function session(): Store | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function markDrawnHere(today: string, store = session()) {
  write(DRAWN_HERE_KEY, today, store)
}

// 這張訪客牌是不是這個分頁抽的
export function drawnHere(today = taipeiToday(), store = session()) {
  return read(DRAWN_HERE_KEY, store) === today
}

export function clearGuestCard(store = storage()) {
  write(GUEST_KEY, null, store)
}

// 今天抽了沒：unknown（還沒查）、drawn、pending（還沒抽）。頂欄小點與月曆提醒用
export const todayStatus = ref<'unknown' | 'drawn' | 'pending'>('unknown')

// 登入或註冊後，把訪客今天抽的牌存進月曆。月曆頁先等它做完再讀今天的牌，避免先顯示「還沒抽」
let pendingClaim: Promise<DailyCardResponse | null> = Promise.resolve(null)
// 領取送出中：路由守衛與 App 都會呼叫，同一張不要送兩次；每次載入頁面只試一次
let claiming = false
let triedThisLoad = false

export function claimGuestCardIfAny() {
  if (claiming || triedThisLoad) return pendingClaim
  const guest = guestCardToday()
  if (!guest) return pendingClaim
  // 不是這個分頁抽的（共用電腦上別人抽的）：不領，直接丟掉
  if (!drawnHere(guest.date)) {
    clearGuestCard()
    return pendingClaim
  }
  claiming = true
  triedThisLoad = true
  pendingClaim = claimDailyCard(guest.claim)
    .then((result) => {
      clearGuestCard()
      if (result.dailyCard) todayStatus.value = 'drawn'
      return result
    })
    .catch(() => {
      // 失敗先留著（可能只是網路暫時不通），下次打開網站再試；隔天憑證就自動失效、被 guestCardToday 清掉
      return null
    })
    .finally(() => {
      claiming = false
    })
  return pendingClaim
}

export function waitForGuestClaim() {
  return pendingClaim
}
