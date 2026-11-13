<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'

import { useRoute, useRouter } from 'vue-router'

import StepDraw from '../components/StepDraw.vue'
import StepQuestion from '../components/StepQuestion.vue'
import StepResult from '../components/StepResult.vue'
import {
  createManualReading,
  createReading,
  fetchCards,
  fetchSpreads,
  saveReadingRecord,
  updateReadingNarration,
  fetchMarketSnapshot,
  streamNarration,
  toFollowUpPayload,
} from '../lib/api'
import { canUseAi, canUseStock, isLoggedIn, onLogout } from '../lib/auth'
import { refreshHealth } from '../lib/health'
import { installPixelCardBack } from '../lib/pixelArt'
import { resetSceneBus, sceneBus } from '../lib/sceneBus'
import { clearResultSnapshot, RESULT_SNAPSHOT_KEY } from '../lib/resultSnapshot'
import { spreadForReading } from '../lib/readingSpread'
import { useFollowUps } from '../lib/useFollowUps'
import type {
  CardSummary,
  CustomPosition,
  DeckCard,
  DrawMode,
  FollowUpRound,
  ManualCardPick,
  NarrationStatus,
  MarketSnapshot,
  MarketStatus,
  QuestionDomain,
  InputCard,
  ReadingResponse,
  SaveStatus,
  Spread,
} from '../types'

// ---- 步驟 ----
// 1 問題（問題核心與牌陣）→ 2 抽牌（自動／手動／輸入）→ 3 結果（可加問 AI）
const step = ref<1 | 2 | 3>(1)

// 像素牌背放進 CSS 變數，要在子元件畫出牌背之前設好
installPixelCardBack()

const STEPS = [
  { value: 1, label: '問題' },
  { value: 2, label: '抽牌' },
  { value: 3, label: '結果' },
] as const

// ---- 步驟 1 的狀態 ----
const spreads = ref<Spread[]>([])
const selectedSpreadKey = ref('timeline')
const question = ref('')
const selectedDomain = ref<QuestionDomain | ''>('')
// 只在「不指定牌陣」時使用
const freeCardCount = ref(3)

// 股市諮詢只給有金融股市權限的人：登出、權限被收回、或從快照還原出這個值時，退回自動判斷。
// 這裡只是讓畫面一致，真正的放行在後端
watch(
  [canUseStock, selectedDomain],
  ([allowed, domain]) => {
    if (domain === 'stock' && !allowed) {
      selectedDomain.value = ''
    }
  },
  { immediate: true },
)

// 未選時不送這個欄位，讓後端自己判斷
const domainParam = computed(() => selectedDomain.value || undefined)
const selectedSpread = computed(
  () => spreads.value.find((spread) => spread.key === selectedSpreadKey.value) || null,
)
const targetCount = computed(() => selectedSpread.value?.cardCount ?? freeCardCount.value)

// ---- 步驟 2 的狀態 ----
// 預設手動抽牌：自己洗牌挑牌是這個站的重點，自動抽牌是想快一點時才用
const drawMode = ref<DrawMode>('fan')
const allCards = ref<CardSummary[]>([])
const cardsError = ref('')
const cardSearch = ref('')

// 手動抽牌：洗好的牌堆與依序選出的牌
const deck = ref<DeckCard[]>([])
const picked = ref<DeckCard[]>([])

// 輸入已抽到的牌。長度一直等於牌陣張數，index 就是位置順序，空位是 undefined，
// 使用者才能直接點某個位置把牌放上去，不必照順序一張一張加
const inputCards = ref<(InputCard | undefined)[]>([])

// 給像素夜景的抽牌事件：每多一張就劃一顆流星、逆位就雲遮月。
// 自動抽牌是一次出結果，沒有逐張事件，夜景只會跟著步驟明暗
const sceneDrawn = computed(() =>
  drawMode.value === 'input'
    ? inputCards.value.flatMap((card) => (card ? [card.orientation] : []))
    : picked.value.map((card) => card.orientation),
)

// 張數改變時補滿或截短，已經放好的牌留著
watch(
  targetCount,
  (count) => {
    inputCards.value = Array.from({ length: count }, (_, index) => inputCards.value[index])
  },
  { immediate: true },
)

function resetInputCards() {
  inputCards.value = Array.from({ length: targetCount.value }, () => undefined)
}

// 不指定牌陣時，使用者自己定義的位置。張數改變時補滿或截短，已填的內容留著
const customPositions = ref<CustomPosition[]>([])
watch(
  targetCount,
  (count) => {
    const next = Array.from({ length: count }, (_, index) => customPositions.value[index] ?? { label: '', prompt: '' })
    customPositions.value = next
  },
  { immediate: true },
)

// 拖曳換位：兩張牌互換，中間的牌不動（插入式搬移會把中間整排推移，不是使用者要的）。
// 位置定義留在原地，動的只有落在那個位置上的牌。
function reorderInputCards(from: number, to: number) {
  const list = inputCards.value
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return
  }
  const a = list[from]
  const b = list[to]
  list[from] = b
  list[to] = a
}

function updateCustomPosition(index: number, patch: Partial<CustomPosition>) {
  const current = customPositions.value[index]
  if (current) {
    customPositions.value[index] = { ...current, ...patch }
  }
}

// 全部留白就不送，後端會維持「無位置」的舊行為；只要有填就必須每一格都有名稱
const customPositionsParam = computed(() => {
  if (selectedSpread.value) {
    return undefined
  }
  const filled = customPositions.value.filter((item) => item.label.trim())
  if (filled.length !== customPositions.value.length || filled.length === 0) {
    return undefined
  }
  return customPositions.value.map((item) => ({ label: item.label.trim(), prompt: item.prompt.trim() }))
})

// ---- 步驟 3 的狀態 ----
const reading = ref<ReadingResponse | null>(null)
// 自動抽牌的結果先放這裡，等 StepDraw 把牌一張一張發到牌陣上，動畫跑完才進結果頁
const pendingAutoReading = ref<ReadingResponse | null>(null)
const narrationText = ref('')
const narrationStatus = ref<NarrationStatus>('idle')
const narrationError = ref('')
// 最近一次解讀有沒有存回紀錄（null＝還沒保存成紀錄，或後端沒回報）
const narrationSaved = ref<boolean | null>(null)
// 最近一次完整產生的解讀用的模型（自動保存、補存時一起送）
const narrationModel = ref('')
// 股市諮詢的行情與技術指標：結果頁一出來就查，AI 解讀時再換成 AI 用的那一份
const marketSnapshot = ref<MarketSnapshot | null>(null)
const marketStatus = ref<MarketStatus>('idle')
const marketError = ref('')
// 重複按「更新報價」或換了結果時，只採用最新一次的回應
let marketRequestId = 0
// 進行中的 AI 請求；中斷它會讓後端一併停止 AI 生成
let narrationController: AbortController | null = null

// 保存紀錄：預設不存，使用者在結果頁自己決定。存成功後記住 id，
// 之後產生的 AI 解讀才知道要存回哪一筆
const savedReadingId = ref('')
const saveStatus = ref<SaveStatus>('idle')
const saveError = ref('')

// 抽牌追問（v23）：針對同一件事再問、再抽補充牌，AI 把原牌陣和補充牌一起回答。
// 延伸回答寫完時如果還沒保存成紀錄，和 AI 解讀一樣自動保存（已登入才存）
const followUp = useFollowUps({
  reading,
  readingId: savedReadingId,
  domain: domainParam,
  // 只把完整寫完的解讀交給 AI 對照；寫到一半或已停止的不給
  baseNarration: computed(() => (narrationStatus.value === 'done' ? narrationText.value : '')),
  onNarrationDone: () => {
    if (isLoggedIn.value) return handleSaveReading()
  },
})

const errorMessage = ref('')
const isLoading = ref(false)
const isBootstrapping = ref(true)

// 結果回傳的 spread 只有基本欄位，排列圖需要完整定義（positions / layout）：用 key 查回來，自選牌用抽到的牌組一個
const resultSpread = computed(() => spreadForReading(spreads.value, reading.value))

// 後端狀態改由 top bar（App.vue）載入與顯示，這裡只載牌陣
async function bootstrap() {
  isBootstrapping.value = true
  errorMessage.value = ''

  try {
    const spreadResponse = await fetchSpreads()
    spreads.value = spreadResponse

    if (!spreadResponse.some((spread) => spread.key === selectedSpreadKey.value) && spreadResponse[0]) {
      selectedSpreadKey.value = spreadResponse[0].key
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '無法取得初始化資料'
  } finally {
    isBootstrapping.value = false
  }
}

// ---- 牌堆 ----

async function ensureCardsLoaded() {
  if (allCards.value.length > 0) {
    return
  }
  cardsError.value = ''
  try {
    allCards.value = await fetchCards()
  } catch (error) {
    cardsError.value = error instanceof Error ? error.message : '無法載入牌卡清單'
  }
}

// 洗牌：每張配一個亂數鍵再排序（這是均勻的；sort(() => Math.random() - 0.5) 不是）。
// 正逆位在這裡就決定，不能等使用者選完才抽，否則「手動」只是換個介面的自動抽牌。
function shuffleDeck() {
  deck.value = allCards.value
    .map((card) => ({ card, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map<DeckCard>(({ card }) => ({
      ...card,
      orientation: Math.random() > 0.5 ? 'upright' : 'reversed',
      picked: false,
    }))

  picked.value = []
}

async function setDrawMode(next: DrawMode) {
  drawMode.value = next
  errorMessage.value = ''

  if (next === 'fan' || next === 'input') {
    await ensureCardsLoaded()
  }
  if (next === 'fan' && deck.value.length === 0) {
    shuffleDeck()
  }
}

function pickFromDeck(index: number) {
  const card = deck.value[index]
  if (!card || card.picked || picked.value.length >= targetCount.value) {
    return
  }
  card.picked = true
  picked.value.push(card)
}

function undoPick() {
  const last = picked.value.pop()
  if (last) {
    last.picked = false
  }
}

// 指定位置放牌。同一張牌原本在別的位置就先清掉，不要同時出現兩次
function setInputCard(index: number, card: CardSummary) {
  const list = inputCards.value
  if (index < 0 || index >= list.length) {
    return
  }
  const existing = list.findIndex((item) => item?.id === card.id)
  if (existing >= 0) {
    list[existing] = undefined
  }
  list[index] = { ...card, orientation: 'upright' }
}

function removeInputCard(index: number) {
  inputCards.value[index] = undefined
}

function toggleInputOrientation(index: number) {
  const card = inputCards.value[index]
  if (card) {
    card.orientation = card.orientation === 'upright' ? 'reversed' : 'upright'
  }
}

// 股市諮詢的結果頁改成行情與技術分析，其他問題類型維持原本的塔羅結果頁
const isStockResult = computed(() => selectedDomain.value === 'stock')

// ---- 股市諮詢的行情 ----
async function loadMarket() {
  const question = reading.value && isStockResult.value ? reading.value.question : null
  if (question === null) {
    return
  }
  const requestId = (marketRequestId += 1)
  marketStatus.value = 'loading'
  marketError.value = ''
  try {
    const { snapshot } = await fetchMarketSnapshot(question)
    if (requestId === marketRequestId) {
      marketSnapshot.value = snapshot
      marketStatus.value = 'ready'
    }
  } catch (error) {
    if (requestId === marketRequestId) {
      marketError.value = error instanceof Error ? error.message : '行情暫時查不到，請稍後再試。'
      marketStatus.value = 'error'
    }
  }
}

// 進到股市諮詢的結果（新抽的、或登入回來還原的）就查行情
watch(reading, (current) => {
  if (current && isStockResult.value && !marketSnapshot.value) {
    void loadMarket()
  }
})

// ---- AI 解讀 ----

function cancelNarration() {
  narrationController?.abort()
  narrationController = null
}

async function loadNarration(current: ReadingResponse) {
  cancelNarration()
  const controller = new AbortController()
  narrationController = controller
  narrationText.value = ''
  narrationError.value = ''
  narrationSaved.value = null
  narrationModel.value = ''
  // 行情不清掉：AI 開始寫之前畫面上照樣有數字，收到 AI 用的那一份再換掉
  narrationStatus.value = 'loading'
  // 開始時已經保存過，後端寫完會自己存回那一筆；寫的過程中才保存的，要等完成後由前端補存
  const readingIdAtStart = savedReadingId.value

  try {
    const { model, saved } = await streamNarration(current, {
      signal: controller.signal,
      domain: domainParam.value,
      // 已經保存過才有 id；後端會在完整產生後把解讀存回那筆紀錄
      readingId: savedReadingId.value || undefined,
      onMarket: (snapshot) => {
        if (controller === narrationController) {
          // AI 用的是這一份，畫面跟著換成同一份，兩邊講的數字才會一致
          marketRequestId += 1
          marketSnapshot.value = snapshot
          marketStatus.value = 'ready'
          marketError.value = ''
        }
      },
      onDelta: (text) => {
        if (controller === narrationController) {
          narrationText.value += text
          narrationStatus.value = 'streaming'
        }
      },
    })
    if (controller === narrationController) {
      narrationStatus.value = 'done'
      narrationSaved.value = saved
      narrationModel.value = model || ''
      void autoSaveNarration(current, { readingIdAtStart, saved })
    }
  } catch (error) {
    // 被停止或被新的請求取代時，狀態已由呼叫端處理
    if (controller !== narrationController) {
      return
    }
    narrationError.value = error instanceof Error ? error.message : 'AI 解讀暫時無法使用'
    narrationStatus.value = 'error'
  } finally {
    if (controller === narrationController) {
      narrationController = null
    }
  }
}

const router = useRouter()
const route = useRoute()

// ---- 結果快照 ----
// 從結果頁離開去登入（或重新整理）會把元件卸載，抽到的牌就不見了。
// 用 sessionStorage 把結果暫存起來，回來時原樣還原；分頁關掉、登出就清掉。
// 太舊的快照不還原，免得隔很久回到這個分頁，看到的是上次的牌
const RESULT_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000

interface ResultSnapshot {
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

function saveResultSnapshot() {
  try {
    if (!reading.value) {
      sessionStorage.removeItem(RESULT_SNAPSHOT_KEY)
      return
    }
    const snapshot: ResultSnapshot = {
      reading: reading.value,
      question: question.value,
      domain: selectedDomain.value,
      narrationText: narrationText.value,
      narrationDone: narrationStatus.value === 'done',
      narrationModel: narrationModel.value,
      savedReadingId: savedReadingId.value,
      savedAt: Date.now(),
      followUps: followUp.rounds,
      // 只留完整寫完的延伸回答；寫到一半的重新整理後不還原
      followUpText: followUp.narrationStatus === 'done' ? followUp.narrationText : '',
      followUpModel: followUp.narrationModel,
      followUpAnswered: followUp.answeredRounds,
    }
    sessionStorage.setItem(RESULT_SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch {
    // 無痕視窗或容量不足時存不起來，就只是沒有還原功能，不影響其他流程
  }
}

function restoreResultSnapshot() {
  try {
    const raw = sessionStorage.getItem(RESULT_SNAPSHOT_KEY)
    if (!raw) {
      return false
    }
    const snapshot = JSON.parse(raw) as ResultSnapshot
    if (!snapshot?.reading?.cards?.length) {
      clearResultSnapshot()
      return false
    }
    if (!snapshot.savedAt || Date.now() - snapshot.savedAt > RESULT_SNAPSHOT_TTL_MS) {
      clearResultSnapshot()
      return false
    }

    reading.value = snapshot.reading
    question.value = snapshot.question || snapshot.reading.question || ''
    selectedDomain.value = snapshot.domain || ''
    narrationText.value = snapshot.narrationText || ''
    savedReadingId.value = snapshot.savedReadingId || ''
    saveStatus.value = snapshot.savedReadingId ? 'saved' : 'idle'
    saveError.value = ''
    // AI 寫到一半被中斷的文字也留著，狀態標成已停止，使用者可以再按一次繼續
    narrationModel.value = snapshot.narrationModel || ''
    followUp.restore({
      rounds: snapshot.followUps,
      narrationText: snapshot.followUpText,
      narrationModel: snapshot.followUpModel,
      answeredRounds: snapshot.followUpAnswered,
    })
    narrationStatus.value = snapshot.narrationText
      ? snapshot.narrationDone
        ? 'done'
        : 'stopped'
      : snapshot.reading.analysis
        ? 'ready'
        : 'idle'
    step.value = 3
    return true
  } catch {
    clearResultSnapshot()
    return false
  }
}

// 結果或 AI 文字一變就存檔，這樣重新整理也救得回來
watch(
  [reading, narrationText, narrationStatus, () => followUp.rounds.length, () => followUp.narrationStatus],
  saveResultSnapshot,
)

function requestNarration() {
  // AI 解讀限 admin 與被開通的會員；未登入時不擋按鈕，改把人帶去登入頁並記住現在的位置
  if (!isLoggedIn.value) {
    // 先把這次的結果存起來，登入回來才不會變成空白的第一步
    saveResultSnapshot()
    router.push({ path: '/login', query: { redirect: '/' } })
    return
  }

  // 已登入但沒被開通：畫面本來就不會給按鈕，這裡只是最後一道保險
  if (!canUseAi.value) {
    return
  }

  const isNarrating = narrationStatus.value === 'loading' || narrationStatus.value === 'streaming'
  if (reading.value && !isNarrating) {
    loadNarration(reading.value)
  }
}

function stopNarration() {
  cancelNarration()
  narrationStatus.value = narrationText.value ? 'stopped' : 'ready'
}

// ---- 保存紀錄 ----

// 自訂牌陣的位置含意只存在於這次結果裡，後端查不到，要一起送回去
function customPositionsOf(current: ReadingResponse) {
  if (current.spread.key !== 'custom') {
    return undefined
  }
  return current.cards.every((entry) => entry.position)
    ? current.cards.map((entry) => ({ label: entry.position!.label, prompt: entry.position!.prompt }))
    : undefined
}

// AI 解讀完成後自動保存（2026-11-12 使用者要求）：
// - 還沒保存過：直接建立一筆紀錄，連同這篇解讀
// - 開始前就保存過：後端已經存回那一筆（saved 為 true），不用再做
// - 寫的過程中才按保存（那次請求沒有紀錄 id），或後端存回失敗：用 PUT 補存到那一筆
// 原因：以前只有「先保存再分析」或「分析完再保存」才會存到解讀；分析途中按保存、或分析完離開頁面再回來保存，
// 畫面顯示已保存，紀錄裡卻沒有 AI 解讀
async function autoSaveNarration(current: ReadingResponse, { readingIdAtStart, saved }: { readingIdAtStart: string; saved: boolean | null }) {
  if (!isLoggedIn.value || reading.value !== current || !narrationText.value) return
  // 使用者剛按的保存還在送：等它完成後由 handleSaveReading 補存解讀
  if (saveStatus.value === 'saving') return
  if (readingIdAtStart && readingIdAtStart === savedReadingId.value && saved === true) return
  if (savedReadingId.value) {
    await syncNarrationToRecord(savedReadingId.value)
    return
  }
  await handleSaveReading()
}

// 把目前這篇完整的解讀存到指定的紀錄（帶上這組牌，後端確認是同一組才存）
async function syncNarrationToRecord(id: string) {
  const current = reading.value
  if (!current) return
  try {
    await updateReadingNarration(id, {
      text: narrationText.value,
      model: narrationModel.value || undefined,
      market: marketSnapshot.value,
      cards: current.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation })),
    })
    if (id === savedReadingId.value) narrationSaved.value = true
  } catch {
    if (id === savedReadingId.value) narrationSaved.value = false
  }
}

// 占卜結果預設不留存，按了才存（AI 解讀完成時也會自動呼叫）。未登入時先存快照再帶去登入頁，回來還是同一組牌。
async function handleSaveReading() {
  const current = reading.value
  if (!current || saveStatus.value === 'saving' || saveStatus.value === 'saved') {
    return
  }

  if (!isLoggedIn.value) {
    saveResultSnapshot()
    router.push({ path: '/login', query: { redirect: '/' } })
    return
  }

  saveStatus.value = 'saving'
  saveError.value = ''

  // 送出時解讀還沒完成（還在寫）：存好之後如果已經寫完，要補存解讀
  const includesNarration = narrationStatus.value === 'done' && Boolean(narrationText.value)
  // 送出當下的追問；存的過程中又追問或延伸回答才寫完的，存好之後補一次
  const sentFollowUps = followUp.rounds.length
  const sentFollowUpText = followUp.narrationStatus === 'done' && sentFollowUps > 0 ? followUp.narrationText : ''
  try {
    const { id } = await saveReadingRecord({
      question: current.question,
      cards: current.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation })),
      domain: domainParam.value,
      spreadKey: current.spread.key,
      positions: customPositionsOf(current),
      // 分析之後由後端重算，但 AI 解讀無法重算，已經產生好的要一起存
      narration: includesNarration
        ? { text: narrationText.value, model: narrationModel.value || undefined, market: marketSnapshot.value }
        : undefined,
      // 保存前已經追問過的補充牌與延伸回答一起存
      followUps: sentFollowUps > 0 ? toFollowUpPayload(followUp.rounds) : undefined,
      followUpNarration: sentFollowUpText ? { text: sentFollowUpText, model: followUp.narrationModel || undefined } : undefined,
    })
    // 存的過程中換了一組牌（重抽、重新開始）：這筆紀錄已經不是畫面上這一組，不要記成目前的
    if (reading.value !== current) return
    savedReadingId.value = id
    saveStatus.value = 'saved'
    if (includesNarration) {
      narrationSaved.value = true
    } else if (narrationStatus.value === 'done' && narrationText.value) {
      await syncNarrationToRecord(id)
    }
    const followUpTextNow = followUp.narrationStatus === 'done' ? followUp.narrationText : ''
    if (followUp.rounds.length !== sentFollowUps || followUpTextNow !== sentFollowUpText) {
      await followUp.syncToRecord(Boolean(followUpTextNow))
    } else if (sentFollowUpText) {
      followUp.synced = true
    }
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存失敗，請稍後再試一次'
    saveStatus.value = 'error'
  }
}

// ---- 流程 ----

function onReadingReady(result: ReadingResponse) {
  reading.value = result
  cancelNarration()
  followUp.reset()
  narrationText.value = ''
  narrationError.value = ''
  narrationStatus.value = result.analysis ? 'ready' : 'idle'
  narrationSaved.value = null
  narrationModel.value = ''
  marketSnapshot.value = null
  marketStatus.value = 'idle'
  marketError.value = ''
  marketRequestId += 1
  // 新的一次占卜是新的結果，保存狀態重來
  savedReadingId.value = ''
  saveStatus.value = 'idle'
  saveError.value = ''
  step.value = 3
}

async function goToDraw() {
  errorMessage.value = ''
  step.value = 2
  // 上一次抽到、還沒進結果頁的牌不要留到這一次
  pendingAutoReading.value = null
  // 換牌陣後張數可能對不上，已選的牌一律清掉重來
  picked.value = []
  resetInputCards()
  deck.value = []

  if (!selectedSpread.value && drawMode.value === 'auto') {
    // 自動抽牌需要牌陣，不指定牌陣時退到手動
    drawMode.value = 'fan'
  }
  await setDrawMode(drawMode.value)
}

async function handleAutoDraw() {
  if (!selectedSpread.value) {
    return
  }
  errorMessage.value = ''
  isLoading.value = true
  pendingAutoReading.value = null

  try {
    pendingAutoReading.value = await createReading({
      question: question.value.trim(),
      spreadKey: selectedSpreadKey.value,
      domain: domainParam.value,
    })
    void refreshHealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '抽牌失敗'
  } finally {
    isLoading.value = false
  }
}

function onAutoDealDone() {
  const result = pendingAutoReading.value
  pendingAutoReading.value = null
  if (result) {
    onReadingReady(result)
  }
}

async function handleManualSubmit() {
  const source =
    drawMode.value === 'fan'
      ? picked.value
      : inputCards.value.filter((card): card is InputCard => Boolean(card))
  if (source.length !== targetCount.value) {
    return
  }
  errorMessage.value = ''
  isLoading.value = true

  try {
    const cards: ManualCardPick[] = source.map((card) => ({ id: card.id, orientation: card.orientation }))
    onReadingReady(
      await createManualReading({
        question: question.value.trim(),
        cards,
        domain: domainParam.value,
        // 有牌陣就一起送，後端才會套上位置與關係對
        spreadKey: selectedSpreadKey.value || undefined,
        // 沒有牌陣時改送自訂位置
        positions: customPositionsParam.value,
      }),
    )
    void refreshHealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '解讀失敗'
  } finally {
    isLoading.value = false
  }
}

// 回到步驟 1：結果直接丟棄，不跳確認
function restart() {
  cancelNarration()
  followUp.reset()
  clearResultSnapshot()
  reading.value = null
  narrationText.value = ''
  narrationStatus.value = 'idle'
  narrationSaved.value = null
  marketSnapshot.value = null
  marketStatus.value = 'idle'
  marketError.value = ''
  marketRequestId += 1
  savedReadingId.value = ''
  saveStatus.value = 'idle'
  saveError.value = ''
  picked.value = []
  resetInputCards()
  deck.value = []
  step.value = 1
}

// 重抽：保留問題與牌陣，只清結果與已選的牌，牌堆重洗
async function redraw() {
  cancelNarration()
  followUp.reset()
  clearResultSnapshot()
  reading.value = null
  narrationText.value = ''
  narrationStatus.value = 'idle'
  narrationSaved.value = null
  marketSnapshot.value = null
  marketStatus.value = 'idle'
  marketError.value = ''
  marketRequestId += 1
  savedReadingId.value = ''
  saveStatus.value = 'idle'
  saveError.value = ''
  picked.value = []
  resetInputCards()
  step.value = 2

  if (drawMode.value === 'fan') {
    shuffleDeck()
  }
}

// 在占卜頁直接按登出時元件不會重新掛載，要自己回到步驟 1。
// 只接使用者主動登出；token 過期（401）時保留結果，讓人重新登入後還能保存
// restart 會保留問題方便重問；登出連問題一起清掉
const offLogout = onLogout(() => {
  restart()
  question.value = ''
  selectedDomain.value = ''
})
onBeforeUnmount(offLogout)

// 從別頁帶著問題進來（例如股市追蹤的「快速占卜」）：?q=問題&domain=類別&spread=牌陣。
// 開一次新的占卜（不還原上次的結果），填好步驟 1，再把網址的參數拿掉，重新整理時不會重複帶入
const PREFILL_DOMAINS: QuestionDomain[] = ['work', 'money', 'love', 'social', 'study', 'stock', 'general']
function applyQueryPrefill() {
  const { q, domain, spread } = route.query
  if (typeof q !== 'string' && typeof domain !== 'string' && typeof spread !== 'string') {
    return false
  }
  restart()
  if (typeof q === 'string') {
    question.value = q.slice(0, 200)
  }
  // 類別沒權限時（例如股市諮詢）由上面的 watch 退回自動判斷
  if (typeof domain === 'string' && PREFILL_DOMAINS.includes(domain as QuestionDomain)) {
    selectedDomain.value = domain as QuestionDomain
  }
  // 牌陣不存在時，bootstrap 載完清單會改用第一個
  if (typeof spread === 'string') {
    selectedSpreadKey.value = spread
  }
  void router.replace({ query: {} })
  return true
}

onMounted(() => {
  // 有帶入參數就從步驟 1 開始；否則先還原結果，還原成功的話會直接停在步驟 3。之後再去載牌陣與牌庫
  if (!applyQueryPrefill()) {
    restoreResultSnapshot()
  }
  bootstrap()
})

// 離開頁面時停止 AI 生成，避免繼續計費
onBeforeUnmount(cancelNarration)

// 把占卜流程交給 App 層的像素世界做反應；離開首頁就重設，別頁的背景才不會停在「抽牌中」
watchEffect(() => {
  sceneBus.step = step.value
  sceneBus.drawn = sceneDrawn.value
})
onBeforeUnmount(resetSceneBus)
</script>

<template>
  <!-- 滿版：撐滿 App 主內容區的高度，結果卡片（section）再吃掉步驟列以外的空間 -->
  <div class="flex min-h-full flex-col text-ink">
    <!-- 手機把左右內距收窄：外層、卡片三層內距疊起來會吃掉一半畫面寬，牌陣就排不下 -->
    <div class="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-4 px-0 py-2 sm:gap-6 sm:px-5 md:px-8">

      <!-- 其他頁各自有 h1，只有首頁沒有：訪客第一眼要知道這是什麼、會拿到什麼 -->
      <!-- 標題與步驟列直接疊在夜景上（沒有面板當底）：on-scene 讓它們白天也用黑夜的顏色 -->
      <header class="on-scene text-center">
        <h1 class="font-pixel text-[24px] text-ink">塔羅占卜</h1>
        <p class="mt-1 text-xs leading-6 text-ink-muted sm:text-sm">
          寫下問題、選一個牌陣，抽完牌會得到每張牌的牌義與整組牌的組合分析，也可以請 AI 解讀。
        </p>
      </header>

      <!-- 步驟指示只顯示目前走到哪，不能點。要回到前面一律用「重新開始」 -->
      <ol class="on-scene flex flex-wrap items-center justify-center gap-1 sm:gap-2" aria-label="占卜步驟">
        <template v-for="(item, index) in STEPS" :key="item.value">
          <li
            class="flex items-center gap-1.5 whitespace-nowrap border-2 px-2.5 py-1 font-pixel text-[12px] select-none sm:gap-2 sm:px-4 sm:py-1.5"
            :class="
              step === item.value
                ? 'border-accent-hue/50 bg-accent-hue/15 text-accent'
                : 'border-tint/10 text-ink-muted'
            "
            :aria-current="step === item.value ? 'step' : undefined"
          >
            <span
              class="flex h-4 w-4 items-center justify-center text-[12px] sm:h-5 sm:w-5"
              :class="step === item.value ? 'bg-accent-hue/90 text-slate-950' : 'bg-tint/10 text-ink-muted'"
            >
              {{ item.value }}
            </span>
            {{ item.label }}
          </li>
          <span v-if="index < STEPS.length - 1" aria-hidden="true" class="text-ink-muted/50">—</span>
        </template>
      </ol>

      <!-- 步驟 1 內容不多，收窄並置中；輸入已抽到的牌是左右並排、牌名要放得下，和步驟 3 一樣用整個寬度 -->
      <section
        class="w-full min-w-0 border-2 border-tint/10 bg-surface p-4 shadow-[4px_4px_0_var(--c-shade)] flex flex-1 flex-col sm:p-6"
        :class="step === 3 || (step === 2 && drawMode === 'input') ? '' : 'mx-auto max-w-2xl'"
      >
        <!-- 往下一步是往左推、回上一步是往右推；out-in 讓上一步先退場，版面不會同時擠兩份內容 -->
        <!--
          換步驟時淡入並輕輕上移。Transition 的子元素固定是這個 wrapper（用 step 當 key），
          不要直接包 v-if 鏈：元件的根節點前面只要有註解就會變成 fragment，class 套不上去。
          out-in 讓上一步先退場，版面不會同時擠兩份內容。
        -->
        <Transition
          mode="out-in"
          enter-active-class="transition duration-300 [transition-timing-function:steps(4)] motion-reduce:transition-none"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-200 [transition-timing-function:steps(4)] motion-reduce:transition-none"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div :key="step" class="flex flex-1 flex-col">
            <StepQuestion
              v-if="step === 1"
              v-model:question="question"
              v-model:domain="selectedDomain"
              v-model:spread-key="selectedSpreadKey"
              v-model:free-card-count="freeCardCount"
              :spreads="spreads"
              :disabled="isBootstrapping || spreads.length === 0"
              @next="goToDraw"
            />

            <StepDraw
              v-else-if="step === 2"
              :mode="drawMode"
              :spread="selectedSpread"
              :target-count="targetCount"
              :deck="deck"
              :picked="picked"
              :all-cards="allCards"
              :input-cards="inputCards"
              :card-search="cardSearch"
              :cards-error="cardsError"
              :custom-positions="customPositions"
              :auto-result="pendingAutoReading"
              :is-loading="isLoading"
              @update:mode="setDrawMode"
              @update:card-search="cardSearch = $event"
              @back="step = 1"
              @auto-draw="handleAutoDraw"
              @auto-deal-done="onAutoDealDone"
              @reshuffle="shuffleDeck"
              @pick="pickFromDeck"
              @undo-pick="undoPick"
              @set-input-card="setInputCard"
              @remove-input-card="removeInputCard"
              @toggle-input-orientation="toggleInputOrientation"
              @update-custom-position="updateCustomPosition"
              @reorder-input-cards="reorderInputCards"
              @submit="handleManualSubmit"
            />

            <StepResult
              v-else-if="reading"
              :reading="reading"
              :result-spread="resultSpread"
              :narration-status="narrationStatus"
              :narration-text="narrationText"
              :narration-error="narrationError"
              :narration-saved="narrationSaved"
              :stock-mode="isStockResult"
              :market="marketSnapshot"
              :market-status="marketStatus"
              :market-error="marketError"
              @refresh-market="loadMarket"
              :save-status="saveStatus"
              :save-error="saveError"
              :follow-up="followUp"
              @save-reading="handleSaveReading"
              @restart="restart"
              @redraw="redraw"
              @request-narration="requestNarration"
              @stop-narration="stopNarration"
            />
          </div>
        </Transition>

        <p v-if="errorMessage" class="mt-4 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-sm text-danger">
          {{ errorMessage }}
        </p>
      </section>
    </div>
  </div>
</template>
