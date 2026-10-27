<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useRouter } from 'vue-router'

import StepDraw from '../components/StepDraw.vue'
import StepQuestion from '../components/StepQuestion.vue'
import StepResult from '../components/StepResult.vue'
import {
  createManualReading,
  createReading,
  fetchCards,
  fetchSpreads,
  saveReadingRecord,
  streamNarration,
} from '../lib/api'
import { canUseAi, isLoggedIn, onLogout } from '../lib/auth'
import { refreshHealth } from '../lib/health'
import { clearResultSnapshot, RESULT_SNAPSHOT_KEY } from '../lib/resultSnapshot'
import type {
  CardSummary,
  CustomPosition,
  DeckCard,
  DrawMode,
  ManualCardPick,
  NarrationStatus,
  QuestionDomain,
  ReadingResponse,
  SaveStatus,
  Spread,
} from '../types'

// ---- 步驟 ----
// 1 問題（問題核心與牌陣）→ 2 抽牌（自動／手動／輸入）→ 3 結果（可加問 AI）
const step = ref<1 | 2 | 3>(1)

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

// 未選時不送這個欄位，讓後端自己判斷
const domainParam = computed(() => selectedDomain.value || undefined)
const selectedSpread = computed(
  () => spreads.value.find((spread) => spread.key === selectedSpreadKey.value) || null,
)
const targetCount = computed(() => selectedSpread.value?.cardCount ?? freeCardCount.value)

// ---- 步驟 2 的狀態 ----
const drawMode = ref<DrawMode>('auto')
const allCards = ref<CardSummary[]>([])
const cardsError = ref('')
const cardSearch = ref('')

// 手動抽牌：洗好的牌堆與依序選出的牌
const deck = ref<DeckCard[]>([])
const picked = ref<DeckCard[]>([])

// 輸入已抽到的牌
const inputCards = ref<(CardSummary & { orientation: 'upright' | 'reversed' })[]>([])

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
  if (!a || !b) {
    return
  }
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
const narrationText = ref('')
const narrationStatus = ref<NarrationStatus>('idle')
const narrationError = ref('')
// 進行中的 AI 請求；中斷它會讓後端一併停止 AI 生成
let narrationController: AbortController | null = null

// 保存紀錄：預設不存，使用者在結果頁自己決定。存成功後記住 id，
// 之後產生的 AI 解讀才知道要存回哪一筆
const savedReadingId = ref('')
const saveStatus = ref<SaveStatus>('idle')
const saveError = ref('')

const errorMessage = ref('')
const isLoading = ref(false)
const isBootstrapping = ref(true)

// 結果回傳的 spread 只有基本欄位，排列圖需要完整定義（positions / layout），所以用 key 查回來
const resultSpread = computed(
  () => spreads.value.find((spread) => spread.key === reading.value?.spread.key) || null,
)

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

function addInputCard(card: CardSummary) {
  if (inputCards.value.length >= targetCount.value || inputCards.value.some((item) => item.id === card.id)) {
    return
  }
  inputCards.value.push({ ...card, orientation: 'upright' })
}

function removeInputCard(index: number) {
  inputCards.value.splice(index, 1)
}

function toggleInputOrientation(index: number) {
  const card = inputCards.value[index]
  if (card) {
    card.orientation = card.orientation === 'upright' ? 'reversed' : 'upright'
  }
}

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
  narrationStatus.value = 'loading'

  try {
    await streamNarration(current, {
      signal: controller.signal,
      domain: domainParam.value,
      // 已經保存過才有 id；後端會在完整產生後把解讀存回那筆紀錄
      readingId: savedReadingId.value || undefined,
      onDelta: (text) => {
        if (controller === narrationController) {
          narrationText.value += text
          narrationStatus.value = 'streaming'
        }
      },
    })
    if (controller === narrationController) {
      narrationStatus.value = 'done'
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
  // 已經保存成紀錄的話，登入回來不要又變成沒存過
  savedReadingId: string
  savedAt: number
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
      savedReadingId: savedReadingId.value,
      savedAt: Date.now(),
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
    narrationStatus.value = snapshot.narrationText
      ? 'stopped'
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
watch([reading, narrationText], saveResultSnapshot)

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

// 占卜結果預設不留存，按了才存。未登入時先存快照再帶去登入頁，回來還是同一組牌。
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

  try {
    const { id } = await saveReadingRecord({
      question: current.question,
      cards: current.cards.map((entry) => ({ id: entry.card.id, orientation: entry.orientation })),
      domain: domainParam.value,
      spreadKey: current.spread.key,
      positions: customPositionsOf(current),
      // 分析之後由後端重算，但 AI 解讀無法重算，已經產生好的要一起存
      narration:
        narrationStatus.value === 'done' && narrationText.value ? { text: narrationText.value } : undefined,
    })
    savedReadingId.value = id
    saveStatus.value = 'saved'
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : '保存失敗，請稍後再試一次'
    saveStatus.value = 'error'
  }
}

// ---- 流程 ----

function onReadingReady(result: ReadingResponse) {
  reading.value = result
  cancelNarration()
  narrationText.value = ''
  narrationError.value = ''
  narrationStatus.value = result.analysis ? 'ready' : 'idle'
  // 新的一次占卜是新的結果，保存狀態重來
  savedReadingId.value = ''
  saveStatus.value = 'idle'
  saveError.value = ''
  step.value = 3
}

async function goToDraw() {
  errorMessage.value = ''
  step.value = 2
  // 換牌陣後張數可能對不上，已選的牌一律清掉重來
  picked.value = []
  inputCards.value = []
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

  try {
    onReadingReady(
      await createReading({
        question: question.value.trim(),
        spreadKey: selectedSpreadKey.value,
        domain: domainParam.value,
      }),
    )
    void refreshHealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '抽牌失敗'
  } finally {
    isLoading.value = false
  }
}

async function handleManualSubmit() {
  const source = drawMode.value === 'fan' ? picked.value : inputCards.value
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
  clearResultSnapshot()
  reading.value = null
  narrationText.value = ''
  narrationStatus.value = 'idle'
  savedReadingId.value = ''
  saveStatus.value = 'idle'
  saveError.value = ''
  picked.value = []
  inputCards.value = []
  deck.value = []
  step.value = 1
}

// 重抽：保留問題與牌陣，只清結果與已選的牌，牌堆重洗
async function redraw() {
  cancelNarration()
  clearResultSnapshot()
  reading.value = null
  narrationText.value = ''
  narrationStatus.value = 'idle'
  savedReadingId.value = ''
  saveStatus.value = 'idle'
  saveError.value = ''
  picked.value = []
  inputCards.value = []
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

onMounted(() => {
  // 先還原結果，再去載牌陣與牌庫；還原成功的話會直接停在步驟 3
  restoreResultSnapshot()
  bootstrap()
})

// 離開頁面時停止 AI 生成，避免繼續計費
onBeforeUnmount(cancelNarration)
</script>

<template>
  <!-- 滿版：撐滿 App 主內容區的高度，結果卡片（section）再吃掉步驟列以外的空間 -->
  <div class="flex min-h-full flex-col text-stone-100">
    <div class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-2 md:px-8">

      <!-- 步驟指示只顯示目前走到哪，不能點。要回到前面一律用「重新開始」 -->
      <ol class="flex flex-wrap items-center justify-center gap-1 sm:gap-2" aria-label="占卜步驟">
        <template v-for="(item, index) in STEPS" :key="item.value">
          <li
            class="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs select-none sm:gap-2 sm:px-4 sm:py-1.5 sm:text-sm"
            :class="
              step === item.value
                ? 'border-amber-200/50 bg-amber-200/15 text-amber-50'
                : 'border-white/10 text-stone-400'
            "
            :aria-current="step === item.value ? 'step' : undefined"
          >
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full text-xs"
              :class="step === item.value ? 'bg-amber-200/90 text-slate-950' : 'bg-white/10 text-stone-300'"
            >
              {{ item.value }}
            </span>
            {{ item.label }}
          </li>
          <span v-if="index < STEPS.length - 1" aria-hidden="true" class="text-stone-600">—</span>
        </template>
      </ol>

      <!-- 步驟 1 內容不多，收窄並置中；輸入已抽到的牌是左右並排、牌名要放得下，和步驟 3 一樣用整個寬度 -->
      <section
        class="w-full rounded-[2rem] border border-white/10 bg-slate-950/45 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur flex-1"
        :class="step === 3 || (step === 2 && drawMode === 'input') ? '' : 'mx-auto max-w-2xl'"
      >
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
          :is-loading="isLoading"
          @update:mode="setDrawMode"
          @update:card-search="cardSearch = $event"
          @back="step = 1"
          @auto-draw="handleAutoDraw"
          @reshuffle="shuffleDeck"
          @pick="pickFromDeck"
          @undo-pick="undoPick"
          @add-input-card="addInputCard"
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
          :save-status="saveStatus"
          :save-error="saveError"
          @save-reading="handleSaveReading"
          @restart="restart"
          @redraw="redraw"
          @request-narration="requestNarration"
          @stop-narration="stopNarration"
        />

        <p v-if="errorMessage" class="mt-4 rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {{ errorMessage }}
        </p>
      </section>
    </div>
  </div>
</template>
