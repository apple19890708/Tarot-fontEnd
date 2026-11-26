<script setup lang="ts">
// 雷諾曼占卜（v27「靜謐花園雷諾曼」，52 張、沒有正逆位）。權限由路由 meta.lenormand 在 router.beforeEach 擋，這裡不再判斷。
// 三步驟流程和塔羅共用 useReadingFlow；這頁自己的部分：
// - 問題類型不含股市、多了健康與家庭；可以選「代表我的牌」（紳士或淑女，大藍圖必填）
// - 抽牌方式依牌陣的 drawModes；沒有正逆位；選牌器 1～36、37～52 兩組，可以用牌號搜尋；花園牌背
// - 結果頁：排列圖、逐張牌義（/cards 快取）、組合分析、撲克花色
// - 保存紀錄（階段 6）：結果預設不存，按了才存進雷諾曼紀錄；換結果、重抽、重新開始時保存狀態重來
// - AI 解讀（階段 7）：照塔羅首頁的做法，解讀完整寫完時還沒保存就自動保存（連同解讀）；
//   已保存的帶紀錄 id，後端寫完會存回那一筆。解讀寫到一半按保存：等寫完再連同解讀一起存
//   （後端沒有事後補存解讀的 API），停止或失敗就只存牌
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import StepDraw from '../components/StepDraw.vue'
import StepQuestion from '../components/StepQuestion.vue'
import LenormandResult from '../components/lenormand/LenormandResult.vue'
import { createLenormandManualReading, drawLenormandReading, fetchLenormandCards, fetchLenormandSpreads, saveLenormandReading } from '../lib/api'
import { lenormandCardGroups, lenormandCardLabel } from '../lib/cardGroups'
import { LENORMAND_DOMAIN_OPTIONS, SIGNIFICATOR_OPTIONS } from '../lib/lenormandLabels'
import { installLenormandCardBack, installPixelCardBack } from '../lib/pixelArt'
import { useSceneSync } from '../lib/sceneBus'
import { useLenormandNarration } from '../lib/useLenormandNarration'
import { READING_STEPS as STEPS, useReadingFlow } from '../lib/useReadingFlow'
import type {
  DrawMode,
  LenormandCard,
  LenormandDomain,
  LenormandDrawCard,
  LenormandPlayingCardGuide,
  LenormandReadingRequest,
  LenormandReadingResponse,
  LenormandSignificator,
  LenormandSpread,
  SaveStatus,
} from '../types'

// 花園牌背：要在子元件畫出牌背之前換好；離開這頁換回塔羅的
installLenormandCardBack()
onBeforeUnmount(installPixelCardBack)

// 大藍圖（36 張）在階段 5 開放；這裡留著清單，之後有還不能用的牌陣再放進來
const HIDDEN_SPREADS = new Set<string>()
// 照牌陣格子輸入實體牌的牌陣（大藍圖 9×4：一格一個宮位）
const GRID_INPUT_SPREADS = new Set(['grand-tableau'])
const ALL_DRAW_MODES: DrawMode[] = ['fan', 'auto', 'input']

// ---- 步驟 1 的狀態 ----
const question = ref('')
const selectedDomain = ref<LenormandDomain | ''>('')
// SelectField 的值是字串：'' 不指定、'28' 紳士、'29' 淑女
const significatorValue = ref('')

const significator = computed<LenormandSignificator | undefined>(() =>
  significatorValue.value === '28' ? 28 : significatorValue.value === '29' ? 29 : undefined,
)

function requestBase(spread: LenormandSpread): LenormandReadingRequest {
  return {
    question: question.value.trim(),
    spreadKey: spread.key,
    domain: selectedDomain.value || undefined,
    significator: significator.value,
  }
}

// 抽牌步驟用的牌：id 轉成字串，才能和塔羅共用抽牌元件
function toDrawCard(card: LenormandCard): LenormandDrawCard {
  return { id: String(card.id), number: card.id, nameZh: card.nameZh, nameEn: card.nameEn, image: card.image }
}

const flow = useReadingFlow<LenormandSpread, LenormandDrawCard, LenormandReadingResponse>({
  defaultSpreadKey: 'theme-3',
  fetchSpreads: async () => (await fetchLenormandSpreads()).spreads.filter((spread) => !HIDDEN_SPREADS.has(spread.key)),
  loadCards: async () => (await fetchLenormandCards()).cards.map(toDrawCard),
  orientations: false,
  // 舊版後端沒有 drawModes 時三種都給
  modesFor: (spread) => spread?.drawModes ?? ALL_DRAW_MODES,
  drawAuto: (spread) => drawLenormandReading(requestBase(spread)),
  drawManual: (source, spread) => {
    if (!spread) throw new Error('請先選擇牌陣。')
    return createLenormandManualReading({ ...requestBase(spread), cards: source.map((card) => card.number) })
  },
  onResult: () => {
    resetSave()
    narration.reset(true)
    void loadMeanings()
  },
  onReset: () => {
    resetSave()
    narration.reset(false)
  },
})

const {
  step,
  spreads,
  selectedSpreadKey,
  selectedSpread,
  targetCount,
  availableModes,
  reading,
  pendingAutoReading,
  errorMessage,
  isLoading,
  isBootstrapping,
  bootstrap,
  setDrawMode,
  goToDraw,
  handleAutoDraw,
  onAutoDealDone,
  handleManualSubmit,
  restart,
  redraw,
  backToQuestion,
} = flow

const {
  drawMode,
  allCards,
  cardsError,
  cardSearch,
  deck,
  picked,
  inputCards,
  customPositions,
  reorderInputCards,
  updateCustomPosition,
  shuffleDeck,
  pickFromDeck,
  undoPick,
  setInputCard,
  removeInputCard,
  toggleInputOrientation,
} = flow.draw

const significatorRequired = computed(() => Boolean(selectedSpread.value?.requiresSignificator))

// 背景和塔羅首頁同一套：步驟 2 窗戶變暗、每抽一張劃一顆流星（雷諾曼沒有逆位，不會雲遮月）
useSceneSync(step, flow.draw.sceneDrawn)

// ---- 步驟 3：牌義與花色解說表（/cards，api.ts 快取，同一次瀏覽只載一次）----
const cardsById = ref(new Map<number, LenormandCard>())
const playingCardGuide = ref<LenormandPlayingCardGuide | null>(null)
const meaningsLoading = ref(false)
const meaningsError = ref('')

async function loadMeanings() {
  if (cardsById.value.size || meaningsLoading.value) return
  meaningsLoading.value = true
  meaningsError.value = ''
  try {
    const { cards, playingCardGuide: guide } = await fetchLenormandCards()
    cardsById.value = new Map(cards.map((card) => [card.id, card]))
    playingCardGuide.value = guide
  } catch (error) {
    meaningsError.value = error instanceof Error ? error.message : '牌義載入失敗，請重新整理再試一次。'
  } finally {
    meaningsLoading.value = false
  }
}

// ---- 保存紀錄（3-13）----
// 只存輸入（牌號、問題、牌陣、代表牌）與完整寫完的 AI 解讀，分析之後讀取時由後端重算
const saveStatus = ref<SaveStatus>('idle')
const saveError = ref('')
// 保存成功後的紀錄 id：之後的 AI 解讀帶上它，後端寫完會存回這一筆
const savedId = ref('')
// 解讀寫到一半時按了保存：等解讀結束再存
let pendingSave = false

function resetSave() {
  saveStatus.value = 'idle'
  saveError.value = ''
  savedId.value = ''
  pendingSave = false
}

// ---- AI 解讀（3-14）----
const narration = useLenormandNarration({
  reading,
  readingId: savedId,
  onDone: (result) => {
    // 開始時就是紀錄：後端已經存回那一筆（沒存成時 saved 是 false，AI 區會說明）
    if (result.readingIdAtStart) return
    // 還沒保存（或寫到一半按了保存）：照塔羅，完整寫完就自動連同解讀保存
    if (saveStatus.value !== 'saved') void performSave()
  },
})
const narrating = computed(() => narration.status.value === 'loading' || narration.status.value === 'streaming')
// 寫到一半按了保存，結果停止或失敗：只存牌
watch(narration.status, (status) => {
  if (pendingSave && (status === 'stopped' || status === 'error')) void performSave()
})

function handleSave() {
  if (!reading.value || saveStatus.value === 'saving' || saveStatus.value === 'saved') return
  saveError.value = ''
  if (narrating.value) {
    pendingSave = true
    saveStatus.value = 'saving'
    return
  }
  void performSave()
}

async function performSave() {
  const current = reading.value
  if (!current) return
  pendingSave = false
  saveStatus.value = 'saving'
  saveError.value = ''
  const includeNarration = narration.status.value === 'done' && Boolean(narration.text.value)
  try {
    const { id } = await saveLenormandReading({
      question: current.question,
      spreadKey: current.spread.key,
      // 使用者自己選的問題類型才送；由問題文字判斷的讓後端重新判斷
      domain: current.analysis.domain.source === 'selected' ? (current.analysis.domain.key ?? undefined) : undefined,
      significator: current.significator ?? undefined,
      cards: current.cards.map((entry) => entry.card.id),
      mode: current.mode,
      narration: includeNarration ? { text: narration.text.value, model: narration.model.value || undefined } : undefined,
    })
    // 存的過程中換了一組牌（重抽、重新開始）：這筆紀錄已經不是畫面上這一組
    if (reading.value !== current) return
    savedId.value = id
    saveStatus.value = 'saved'
    if (includeNarration) narration.saved.value = true
  } catch (error) {
    if (reading.value !== current) return
    saveError.value = error instanceof Error ? error.message : '保存失敗，請稍後再試一次'
    saveStatus.value = 'error'
  }
}

// 結果頁的排列圖用完整的牌陣定義（位置座標）
const resultSpread = computed(() => spreads.value.find((spread) => spread.key === reading.value?.spread.key) ?? null)

// 換牌陣時，新牌陣不需要代表牌就保留原本的選擇；需要時沒選會在按鈕上擋
watch(selectedSpreadKey, () => {
  errorMessage.value = ''
})

onMounted(bootstrap)
</script>

<template>
  <div class="flex min-h-full flex-col text-ink">
    <div class="mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col gap-4 px-0 py-2 sm:gap-6 sm:px-5 md:px-8">
      <!-- 標題與步驟列直接疊在背景上（沒有面板當底）：on-scene 讓它們白天也用黑夜的顏色 -->
      <header class="on-scene text-center">
        <h1 class="font-pixel text-display text-ink">雷諾曼占卜</h1>
        <p class="mt-1 text-caption text-ink-muted">
          靜謐花園雷諾曼．52 張牌、沒有正逆位。寫下問題、選一個牌陣，抽完牌會得到每張牌的牌義、牌與牌的組合分析和撲克花色。
        </p>
      </header>

      <!-- 步驟指示只顯示目前走到哪，不能點。要回到前面一律用「重新開始」 -->
      <ol class="on-scene flex flex-wrap items-center justify-center gap-1 sm:gap-2" aria-label="占卜步驟">
        <template v-for="(item, index) in STEPS" :key="item.value">
          <li
            class="flex items-center gap-1.5 whitespace-nowrap border-2 px-2.5 py-1 font-pixel text-caption select-none sm:gap-2 sm:px-4 sm:py-1.5"
            :class="step === item.value ? 'border-accent-hue/50 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted'"
            :aria-current="step === item.value ? 'step' : undefined"
          >
            <span
              class="flex h-4 w-4 items-center justify-center sm:h-5 sm:w-5"
              :class="step === item.value ? 'bg-accent-hue text-on-selected' : 'bg-tint/10 text-ink-muted'"
            >
              {{ item.value }}
            </span>
            {{ item.label }}
          </li>
          <span v-if="index < STEPS.length - 1" aria-hidden="true" class="text-ink-muted">—</span>
        </template>
      </ol>

      <!-- 步驟 1 內容不多，收窄並置中；輸入實體牌與結果頁用整個寬度 -->
      <section
        class="flex w-full min-w-0 flex-1 flex-col border-2 border-tint/10 bg-surface p-4 shadow-[4px_4px_0_var(--c-shade)] sm:p-6"
        :class="step === 3 || (step === 2 && drawMode === 'input') ? '' : 'mx-auto max-w-2xl'"
      >
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
              v-model:significator="significatorValue"
              :spreads="spreads"
              :disabled="isBootstrapping || spreads.length === 0"
              :domain-options="LENORMAND_DOMAIN_OPTIONS"
              domain-hint="指定類型會決定這次要特別看哪一張主題牌；留著自動判斷則由問題文字推測。"
              :allow-free-spread="false"
              :significator-options="SIGNIFICATOR_OPTIONS"
              :significator-required="significatorRequired"
              :significator-hint="
                significatorRequired
                  ? '選一張代表你自己的牌，不用和性別一致。大藍圖以這張牌為中心解讀，一定要選。'
                  : '選一張代表你自己的牌，不用和性別一致；分析會看這張牌出現在哪裡、看向哪裡。這個牌陣可以不選。'
              "
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
              :group-cards="lenormandCardGroups"
              :card-label="lenormandCardLabel"
              search-placeholder="搜尋牌名或牌號…"
              :orientations="false"
              :modes="availableModes"
              :input-grid="GRID_INPUT_SPREADS.has(selectedSpreadKey)"
              @update:mode="setDrawMode"
              @update:card-search="cardSearch = $event"
              @back="backToQuestion"
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

            <LenormandResult
              v-else-if="reading"
              :reading="reading"
              :spread="resultSpread"
              :cards-by-id="cardsById"
              :guide="playingCardGuide"
              :meanings-loading="meaningsLoading"
              :meanings-error="meaningsError"
              :save-status="saveStatus"
              :save-error="saveError"
              :narration="{
                status: narration.status.value,
                text: narration.text.value,
                error: narration.error.value,
                saved: narration.saved.value,
                isRecord: Boolean(savedId),
              }"
              @request-narration="narration.request"
              @stop-narration="narration.stop"
              @save-reading="handleSave"
              @restart="restart"
              @redraw="redraw"
            />
          </div>
        </Transition>

        <p v-if="errorMessage" class="mt-4 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
          {{ errorMessage }}
        </p>
      </section>
    </div>
  </div>
</template>
