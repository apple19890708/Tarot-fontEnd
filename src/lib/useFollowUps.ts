import { computed, reactive, ref, toRef, type Ref } from 'vue'

import { keepAnsweredSections } from './aiMarkdown'
import { drawFollowUp, streamFollowUpNarration, toFollowUpPayload, updateReadingFollowUps } from './api'
import {
  FOLLOW_UP_MAX_ROUNDS,
  type FollowUpRound,
  type FollowUpStatus,
  type ManualCardPick,
  type QuestionDomain,
  type ReadingResponse,
} from '../types'

// 抽牌追問（v23）的狀態：占卜頁與「我的紀錄」共用。
// 追問的牌由後端抽（同一副牌，不會抽到桌上已有的），AI 延伸回答把原牌陣和所有補充牌一起看。
//
// 存檔的三條路：
// - 還沒保存成紀錄：什麼都不存，之後按保存（或 AI 寫完自動保存）時由外層把追問一起送出
// - 已經是紀錄、抽了新的補充牌：PUT 同步追問清單
// - 已經是紀錄、AI 延伸回答寫完：後端自己存回（saved === true）；沒存成就由這裡 PUT 補存
export interface FollowUpOptions {
  reading: Ref<ReadingResponse | null>
  // 已保存成紀錄時的 id；還沒保存是空字串
  readingId: Ref<string>
  domain: Ref<QuestionDomain | undefined>
  // 先前的 AI 解讀全文（交給 AI 避免重複、對照結論）；只在完整產生時才給
  baseNarration: Ref<string>
  // 還沒保存成紀錄時，AI 延伸回答寫完後呼叫（占卜頁用它自動保存；紀錄頁不用給）
  onNarrationDone?: () => void | Promise<void>
}

export function useFollowUps(options: FollowUpOptions) {
  const rounds = ref<FollowUpRound[]>([])
  const drawing = ref(false)
  const drawError = ref('')
  const narrationText = ref('')
  const narrationModel = ref('')
  const narrationStatus = ref<FollowUpStatus>('idle')
  const narrationError = ref('')
  // 延伸回答寫的時候有幾次追問：之後又追問的話，畫面提示「還沒包含新的追問」
  const answeredRounds = ref(0)
  // 最近一次同步到紀錄的結果（null＝沒有對應的紀錄或還沒同步）
  const synced = ref<boolean | null>(null)

  let controller: AbortController | null = null
  // 換一組牌（重抽、切換紀錄）後，前一組還在路上的回應一律丟掉
  let generation = 0

  const baseCards = (reading: ReadingResponse) =>
    reading.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation }))

  function cancelNarration() {
    controller?.abort()
    controller = null
  }

  // 換一組牌或回到沒有結果的狀態：全部清掉
  function reset() {
    generation += 1
    cancelNarration()
    rounds.value = []
    drawing.value = false
    drawError.value = ''
    narrationText.value = ''
    narrationModel.value = ''
    narrationStatus.value = 'idle'
    narrationError.value = ''
    answeredRounds.value = 0
    synced.value = null
  }

  // 從紀錄或快照還原
  function restore(saved: { rounds?: FollowUpRound[]; narrationText?: string; narrationModel?: string; answeredRounds?: number }) {
    reset()
    rounds.value = saved.rounds ?? []
    narrationText.value = rounds.value.length > 0 ? saved.narrationText || '' : ''
    narrationModel.value = saved.narrationModel || ''
    narrationStatus.value = narrationText.value ? 'done' : 'idle'
    answeredRounds.value = narrationText.value ? saved.answeredRounds ?? rounds.value.length : 0
  }

  // 把目前的追問（與延伸回答）同步到已保存的紀錄
  async function syncToRecord(includeNarration: boolean) {
    const reading = options.reading.value
    const id = options.readingId.value
    if (!reading || !id) return
    const current = generation
    try {
      await updateReadingFollowUps(id, {
        cards: baseCards(reading),
        followUps: toFollowUpPayload(rounds.value),
        ...(includeNarration && narrationText.value
          ? { narration: { text: narrationText.value, model: narrationModel.value || undefined } }
          : {}),
      })
      if (current === generation) synced.value = true
    } catch {
      if (current === generation) synced.value = false
    }
  }

  async function draw(question: string, count: number, picks?: ManualCardPick[]) {
    const reading = options.reading.value
    if (!reading || drawing.value || rounds.value.length >= FOLLOW_UP_MAX_ROUNDS) return false
    const current = generation
    drawing.value = true
    drawError.value = ''
    try {
      const round = await drawFollowUp(reading, rounds.value, question, count, picks)
      if (current !== generation) return false
      rounds.value = [...rounds.value, round]
      // 已經是紀錄：補充牌馬上存，重新整理或換裝置也看得到
      void syncToRecord(false)
      return true
    } catch (error) {
      if (current === generation) drawError.value = error instanceof Error ? error.message : '抽牌失敗，請再試一次'
      return false
    } finally {
      if (current === generation) drawing.value = false
    }
  }

  async function ask() {
    const reading = options.reading.value
    const busy = narrationStatus.value === 'loading' || narrationStatus.value === 'streaming'
    if (!reading || busy || rounds.value.length === 0) return
    const current = generation
    cancelNarration()
    const own = new AbortController()
    controller = own
    const askedRounds = rounds.value.length
    // 只回答新的追問（2026-11-13 使用者要求）：已經有回答的那幾次保留，AI 只寫新的與綜合來看。
    // 沒有新的追問（按「重新回答」）：重寫最後一次與綜合來看，前面的保留
    const previousText = narrationText.value
    const wanted = previousText ? Math.min(answeredRounds.value, askedRounds - 1) : 0
    const local = keepAnsweredSections(previousText, wanted)
    let prefix = local.text
    let streamed = ''
    let started = false
    const show = () => {
      narrationText.value = [prefix, streamed].filter((part) => part.trim()).join('\n\n')
    }
    show()
    narrationError.value = ''
    narrationStatus.value = 'loading'
    synced.value = null
    try {
      const { model, saved } = await streamFollowUpNarration(reading, {
        followUps: rounds.value,
        narration: options.baseNarration.value || undefined,
        answeredRounds: local.kept,
        followUpText: previousText,
        domain: options.domain.value,
        readingId: options.readingId.value || undefined,
        signal: own.signal,
        // 後端實際保留了幾段（紀錄裡的回答可能比畫面上的少）：照它重新算要留的段落，兩邊才一致
        onStart: (kept) => {
          if (own !== controller || current !== generation) return
          started = true
          prefix = keepAnsweredSections(previousText, kept).text
          show()
        },
        onDelta: (text) => {
          if (own !== controller || current !== generation) return
          // 舊版後端沒有 start 事件、會整篇重寫：不保留，免得同一節出現兩次
          if (!started) {
            started = true
            prefix = ''
          }
          streamed += text
          show()
          narrationStatus.value = 'streaming'
        },
      })
      if (own !== controller || current !== generation) return
      narrationStatus.value = 'done'
      narrationModel.value = model || ''
      answeredRounds.value = askedRounds
      if (saved === true) {
        synced.value = true
      } else if (options.readingId.value) {
        // 寫的過程中才保存成紀錄，或後端存回失敗：由前端補存
        await syncToRecord(true)
      } else {
        await options.onNarrationDone?.()
      }
    } catch (error) {
      if (own !== controller || current !== generation) return
      if (own.signal.aborted) return
      narrationError.value = error instanceof Error ? error.message : 'AI 追問暫時無法使用'
      narrationStatus.value = 'error'
    } finally {
      if (own === controller) controller = null
    }
  }

  function stop() {
    cancelNarration()
    narrationStatus.value = narrationText.value ? 'stopped' : 'idle'
  }

  // 桌上已經有的牌（原牌陣與所有補充牌）：自己抽補充牌時不能再抽到
  const usedCardIds = computed(() => [
    ...(options.reading.value?.cards.map((entry) => entry.card.id) ?? []),
    ...rounds.value.flatMap((round) => round.cards.map((entry) => entry.card.id)),
  ])

  // reactive：元件的 template 裡直接讀 followUp.rounds，不用 .value
  return reactive({
    rounds,
    usedCardIds,
    drawing,
    drawError,
    narrationText,
    narrationModel,
    narrationStatus,
    narrationError,
    answeredRounds,
    synced,
    readingId: toRef(options.readingId),
    draw,
    ask,
    stop,
    reset,
    restore,
    syncToRecord,
  })
}

export type FollowUpController = ReturnType<typeof useFollowUps>
