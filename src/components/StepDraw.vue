<script setup lang="ts" generic="C extends DrawableCard">
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import CheckboxField from './CheckboxField.vue'
import FanDeck from './FanDeck.vue'
import FlyingCard from './FlyingCard.vue'
import SpreadSlots from './SpreadSlots.vue'
import { cardImageUrl } from '../lib/cardStyle'
import { motionDuration, prefersReducedMotion, type CardPose } from '../lib/motion'
import type {
  AutoDealResult,
  CardPickerGroup,
  CustomPosition,
  DeckOf,
  DrawableCard,
  DrawMode,
  FanPhase,
  InputOf,
  SlotCard,
  SpreadShape,
} from '../types'

// v27：牌的型別是泛型（塔羅 CardSummary、雷諾曼 LenormandDrawCard），選牌器分組由外面傳入（lib/cardGroups.ts）；
// orientations 為 false（雷諾曼）時不顯示正逆位、不能切換；modes 給了就只開放那幾種抽牌方式
// 布林 prop 沒傳時 Vue 會當成 false（不是 undefined），塔羅沒傳 orientations 就會被當成沒有正逆位；預設要寫成 true（2026-11-25 回歸測試抓到）
const props = withDefaults(defineProps<{
  mode: DrawMode
  spread: SpreadShape | null
  targetCount: number
  // 手動抽牌：洗好的牌堆與已依序選出的牌
  deck: DeckOf<C>[]
  picked: DeckOf<C>[]
  // 輸入已抽到的：全牌清單，與放在各個位置上的牌（空位是 undefined）
  allCards: C[]
  inputCards: (InputOf<C> | undefined)[]
  cardSearch: string
  cardsError: string
  isLoading: boolean
  // 不指定牌陣時，使用者自己定義的位置；長度與 targetCount 一致
  customPositions: CustomPosition[]
  // 自動抽牌的結果。拿到之後才知道抽到什麼，動畫才有牌可以發；跑完通知外層進結果頁
  autoResult: AutoDealResult | null
  // 選牌器的分組與按鈕文字
  groupCards: (cards: C[], search: string) => CardPickerGroup<C>[]
  cardLabel?: (card: C) => string
  searchPlaceholder?: string
  // 有沒有正逆位（沒給就是有）
  orientations?: boolean
  // 這個牌陣能用的抽牌方式（沒給就照舊：自動抽牌要有牌陣）
  modes?: DrawMode[]
  // 輸入模式照牌陣的格子排（雷諾曼大藍圖 9×4，v27 階段 5）；沒給就是原本一列一個位置的清單
  inputGrid?: boolean
}>(), { orientations: true })

const hasOrientation = computed(() => props.orientations)
const labelOf = (card: C) => (props.cardLabel ? props.cardLabel(card) : card.nameZh)

const emit = defineEmits<{
  'update:mode': [value: DrawMode]
  'update:cardSearch': [value: string]
  back: []
  autoDraw: []
  reshuffle: []
  pick: [index: number]
  undoPick: []
  setInputCard: [index: number, card: C]
  removeInputCard: [index: number]
  toggleInputOrientation: [index: number]
  updateCustomPosition: [index: number, patch: Partial<CustomPosition>]
  reorderInputCards: [from: number, to: number]
  autoDealDone: []
  submit: []
}>()

// 手動抽牌是這裡的主角（自己洗牌、切牌、挑牌），排在最前面；
// 自動抽牌走 /api/readings/draw，那支端點一定要牌陣，不指定牌陣時只能手動
const MODES = computed(() => {
  const allowed = (key: DrawMode) => (props.modes ? props.modes.includes(key) : key !== 'auto' || Boolean(props.spread))
  return [
    { key: 'fan' as const, label: '手動抽牌', enabled: allowed('fan') },
    { key: 'auto' as const, label: '自動抽牌', enabled: allowed('auto') },
    { key: 'input' as const, label: '輸入已抽到的', enabled: allowed('input') },
  ]
})

// 有牌陣就用牌陣定義，否則用使用者自訂的；兩者都沒有才退回「第 N 張」
const slots = computed(() =>
  props.spread
    ? props.spread.positions.map((position) => ({ label: position.label, prompt: position.prompt }))
    : Array.from({ length: props.targetCount }, (_, index) => ({
        label: props.customPositions[index]?.label?.trim() || `第 ${index + 1} 張`,
        prompt: props.customPositions[index]?.prompt?.trim() || '',
      })),
)

const positionLabels = computed(() => slots.value.map((slot) => slot.label))

// 手動抽牌的切牌落數：自由牌陣（不指定牌陣）或 5 張以上的牌陣切兩落，其餘切三落
const pileCount = computed<2 | 3>(() => (!props.spread || props.targetCount >= 5 ? 2 : 3))

// 扇形目前的階段；位置格等切完牌、開始發牌時才顯示
const fanPhase = ref<FanPhase>('shuffling')
const showSlots = computed(() => fanPhase.value === 'dealing' || fanPhase.value === 'ready')

// ---- 手動抽牌的飛牌動畫 ----
// 資料照常立刻更新（選取／收回），動畫只是在最上層放一張替身飛過去；
// 飛行期間把終點那張藏起來，抵達後再出現。
const fanRef = ref<InstanceType<typeof FanDeck> | null>(null)
const fanSlotsRef = ref<InstanceType<typeof SpreadSlots> | null>(null)
const autoSlotsRef = ref<InstanceType<typeof SpreadSlots> | null>(null)

interface Flight {
  key: number
  card: SlotCard
  from: CardPose
  to: CardPose
  reveal: boolean
}

const flights = ref<Flight[]>([])
let flightKey = 0

// 正在飛往位置格的牌（位置格先不顯示）與正在飛回扇形的牌（扇形先不顯示）
const landingIds = computed(() => new Set(flights.value.filter((f) => f.reveal).map((f) => f.card.id)))
const returningIds = computed(() => new Set(flights.value.filter((f) => !f.reveal).map((f) => f.card.id)))

function slotPose(
  slots: InstanceType<typeof SpreadSlots> | null,
  index: number,
  card: SlotCard,
  fromRotation: number,
): CardPose | null {
  const pose = slots?.poseOf(index) ?? null
  if (!pose) {
    return null
  }
  // 逆位在位置格裡是倒過來的；從哪一側飛來就往那一側轉半圈，不要繞遠路
  return { ...pose, rotation: card.orientation === 'reversed' ? (fromRotation < 0 ? -180 : 180) : 0 }
}

function launch(card: SlotCard, from: CardPose | null, to: CardPose | null, reveal: boolean) {
  if (!from || !to) {
    return
  }
  flights.value.push({ key: (flightKey += 1), card, from, to, reveal })
}

function landFlight(key: number) {
  flights.value = flights.value.filter((flight) => flight.key !== key)
}

async function onPick(index: number) {
  const card = props.deck[index]
  const slotIndex = props.picked.length
  const from = fanRef.value?.cardPose(index) ?? null
  emit('pick', index)
  if (!card || prefersReducedMotion()) {
    return
  }
  // 等位置格更新後再量終點
  await nextTick()
  launch(card, from, slotPose(fanSlotsRef.value, slotIndex, card, from?.rotation ?? 0), true)
}

async function onUndoPick() {
  const slotIndex = props.picked.length - 1
  const card = props.picked[slotIndex]
  if (!card) {
    return
  }
  const deckIndex = props.deck.findIndex((item) => item.id === card.id)
  const fanPose = fanRef.value?.cardPose(deckIndex) ?? null
  const from = slotPose(fanSlotsRef.value, slotIndex, card, fanPose?.rotation ?? 0)
  emit('undoPick')
  if (prefersReducedMotion()) {
    return
  }
  launch(card, from, fanPose, false)
}

// ---- 輸入已抽到的牌：從清單點選後，牌從按下的位置飛進對應的位置列並翻面 ----
// 位置列裡的縮圖框，依位置 index 放（v-for 的 ref 陣列不保證順序）
const inputThumbEls: HTMLElement[] = []

function setInputThumb(index: number, el: unknown) {
  if (el instanceof HTMLElement) {
    inputThumbEls[index] = el
  }
}

function elementPose(el: Element | null | undefined): CardPose | null {
  if (!el) {
    return null
  }
  const rect = el.getBoundingClientRect()
  return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, width: rect.width, height: rect.height, rotation: 0 }
}

// 清單裡的按鈕是長條形，替身要是一張牌：以按鈕中心為起點、大小與終點的縮圖相同
async function flyInputCard(card: C, index: number, source: Element | null) {
  const target = elementPose(inputThumbEls[index])
  const button = elementPose(source)
  if (!target || !button || prefersReducedMotion()) {
    return
  }
  const from: CardPose = { ...target, cx: button.cx, cy: button.cy }
  // 等位置列換上新牌（縮圖框的大小不變，終點可以先量）
  await nextTick()
  launch({ ...card, orientation: 'upright' }, from, target, true)
}


// ---- 自動抽牌的動畫 ----
// 按下之後要等後端回傳才知道抽到什麼，所以先洗牌佔住這段等待；
// 結果回來後再一張一張從牌堆飛到牌陣位置上翻開，看起來像是當場發牌。
type AutoPhase = 'idle' | 'shuffling' | 'dealing' | 'done'

const autoPhase = ref<AutoPhase>('idle')
const autoDeckEl = ref<HTMLElement | null>(null)
// 已經發到位置上的牌；飛行途中就先放進來，位置格會等替身抵達才顯示
const autoLanded = ref<(SlotCard | undefined)[]>([])

let autoShuffle: gsap.core.Timeline | null = null

function stopAutoShuffle() {
  autoShuffle?.kill()
  autoShuffle = null
  // 牌堆一直掛在畫面上，停在擺動到一半的角度會看起來歪掉，收回正中
  const el = autoDeckEl.value
  if (el) {
    gsap.to(el, { x: 0, y: 0, rotation: 0, duration: motionDuration(0.2), ease: 'steps(5)', overwrite: 'auto' })
  }
}

// 還沒按「抽牌」時，牌堆緩緩上下浮動、微微擺頭，讓人知道這疊牌在等著被抽
function startAutoIdle() {
  autoShuffle?.kill()
  autoShuffle = null
  const el = autoDeckEl.value
  if (!el || prefersReducedMotion()) {
    return
  }
  autoShuffle = gsap
    .timeline({ repeat: -1, yoyo: true })
    .to(el, { y: -8, rotation: 2, duration: 1.6, ease: 'steps(8)' })
    .to(el, { y: 0, rotation: -2, duration: 1.6, ease: 'steps(8)' })
}

watch([autoDeckEl, autoPhase], ([el, phase]) => {
  if (el && phase === 'idle') {
    startAutoIdle()
  }
})

function startAutoShuffle() {
  stopAutoShuffle()
  const el = autoDeckEl.value
  if (!el || prefersReducedMotion()) {
    return
  }
  // 左右擺動並微微傾斜，表示牌還在洗
  autoShuffle = gsap
    .timeline({ repeat: -1, yoyo: true })
    .to(el, { x: -7, rotation: -4, duration: 0.26, ease: 'steps(5)' })
    .to(el, { x: 7, rotation: 4, duration: 0.52, ease: 'steps(5)' })
}

function autoDeckPose(): CardPose | null {
  const el = autoDeckEl.value
  if (!el) {
    return null
  }
  const rect = el.getBoundingClientRect()
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: el.offsetWidth,
    height: el.offsetHeight,
    rotation: 0,
  }
}

function delay(seconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, motionDuration(seconds) * 1000))
}

function onAutoDraw() {
  if (autoPhase.value !== 'idle') {
    return
  }
  autoLanded.value = []
  autoPhase.value = 'shuffling'
  emit('autoDraw')
  void nextTick(startAutoShuffle)
}

async function runAutoDeal(result: AutoDealResult) {
  stopAutoShuffle()
  autoPhase.value = 'dealing'
  // 等位置格畫出來才量得到終點
  await nextTick()

  const cards: SlotCard[] = result.cards.map((entry, index) => ({
    // 同一次占卜不會有重複的牌，但位置才是這裡的身分，所以把 index 一起帶上
    id: `${entry.card.id}-${index}`,
    nameZh: entry.card.nameZh,
    image: entry.card.image ?? '',
    orientation: entry.orientation ?? 'upright',
  }))

  for (const [index, card] of cards.entries()) {
    launch(card, autoDeckPose(), slotPose(autoSlotsRef.value, index, card, 0), true)
    // 量不到位置時 launch 會略過動畫，這裡照樣把牌放上去，不要卡住流程
    autoLanded.value = cards.slice(0, index + 1)
    await delay(0.17)
  }
  // 最後一張飛完再停一下，讓人看清楚整個牌陣
  await delay(0.9)
  finishAutoDeal()
}

function finishAutoDeal() {
  autoPhase.value = 'done'
  emit('autoDealDone')
}

function resetAuto() {
  stopAutoShuffle()
  autoPhase.value = 'idle'
  autoLanded.value = []
}

watch(
  () => props.autoResult,
  (result) => {
    if (!result || autoPhase.value === 'dealing' || autoPhase.value === 'done') {
      return
    }
    if (prefersReducedMotion()) {
      finishAutoDeal()
      return
    }
    void runAutoDeal(result)
  },
)

// 抽牌失敗：沒有結果、也不在載入中，就把牌堆收起來讓使用者再按一次
watch(
  () => props.isLoading,
  (loading) => {
    if (!loading && autoPhase.value === 'shuffling' && !props.autoResult) {
      resetAuto()
    }
  },
)

// 切去別的抽牌方式再切回來時，從頭開始
watch(() => props.mode, () => {
  resetAuto()
  closePicker()
})

onBeforeUnmount(stopAutoShuffle)

// 拖曳調整牌的順序。位置名稱固定在原地不跟著動，移動的是落在那個位置上的牌。
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox 要有資料才會真的開始拖曳
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number) {
  if (dragIndex.value !== null && dragIndex.value !== index) {
    dropIndex.value = index
  }
}

function onDrop(index: number) {
  const from = dragIndex.value
  if (from !== null && from !== index) {
    emit('reorderInputCards', from, index)
  }
  dragIndex.value = null
  dropIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

// ---- 選牌視窗 ----
// 點某個位置才跳出選牌視窗，選完就關掉。手機是滿版，桌機是置中的視窗。
// 原本桌機在右側常駐一份 78 張的清單，佔掉半個版面，改成和手機一樣的流程。
// isMobile 現在只用來決定能不能拖曳排序（手機的拖曳和捲動會互相干擾）。
const MOBILE_QUERY = '(max-width: 767px)'
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
let mobileQuery: MediaQueryList | null = null

function onMobileChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches
}

// 桌機可以按 Esc 關掉選牌視窗
function onPickerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && pickerIndex.value !== null) {
    closePicker()
  }
}

onMounted(() => {
  mobileQuery = window.matchMedia(MOBILE_QUERY)
  isMobile.value = mobileQuery.matches
  mobileQuery.addEventListener('change', onMobileChange)
  window.addEventListener('keydown', onPickerKeydown)
})

// 正在選牌的位置；null 表示沒開視窗
const pickerIndex = ref<number | null>(null)

function openPicker(index: number) {
  // 每次重新開始找，不要延續上一個位置的關鍵字
  emit('update:cardSearch', '')
  pickerIndex.value = index
}

function closePicker() {
  pickerIndex.value = null
}

function chooseCard(card: C, event: MouseEvent) {
  const index = pickerIndex.value
  if (index === null) {
    return
  }
  // 起點要在視窗關閉前量
  const source = event.currentTarget as Element | null
  const alreadyThere = props.inputCards[index]?.id === card.id
  emit('setInputCard', index, card)
  if (!alreadyThere) {
    void flyInputCard(card, index, source)
  }
  closePicker()
  // 格子模式（大藍圖 36 張）：照著實體牌一張一張輸入，選完直接跳到下一個空格
  if (gridInput.value && autoAdvance.value) {
    const next = nextEmptyIndex(index)
    if (next !== null) void nextTick(() => openPicker(next))
  }
}

// ---- 格子模式（v27 大藍圖）----
// 牌陣有網格、而且外面要求照格子排時才用；位置座標照牌陣定義，一格就是一個宮位
const gridInput = computed(() => Boolean(props.inputGrid && props.spread?.grid))
const gridColumns = computed(() => props.spread?.grid?.cols ?? 1)
// 選完自動跳到下一個空格（預設開）
const autoAdvance = ref(true)

// 從 index 之後找下一個空格，找到最後再從頭找；全部填滿時是 null
function nextEmptyIndex(index: number) {
  const total = props.inputCards.length
  for (let step = 1; step < total; step += 1) {
    const candidate = (index + step) % total
    if (!props.inputCards[candidate]) return candidate
  }
  return null
}

// 這張牌放在哪一格（選牌器標示「已在第 N 格」用）
function usedSlotNumber(card: C) {
  const at = props.inputCards.findIndex((item) => item?.id === card.id)
  return at >= 0 ? at + 1 : null
}

// 這張牌已經放在別的位置上了（放在目前這個位置的不算，點它等於不換）
function usedElsewhere(card: C) {
  return selectedInputIds.value.has(card.id) && props.inputCards[pickerIndex.value ?? -1]?.id !== card.id
}

// 視窗打開時擋住背景捲動，不然手指滑清單會連背後的頁面一起動
watch(pickerIndex, (index) => {
  document.body.style.overflow = index === null ? '' : 'hidden'
})

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', onMobileChange)
  window.removeEventListener('keydown', onPickerKeydown)
  document.body.style.overflow = ''
})

const pickedEnough = computed(() => props.picked.length === props.targetCount)
const inputFilled = computed(() => props.inputCards.filter(Boolean).length)
const inputEnough = computed(() => inputFilled.value === props.targetCount)

const selectedInputIds = computed(() => new Set(props.inputCards.filter(Boolean).map((card) => card!.id)))

// 選牌器的分組由外面決定（塔羅依大牌與花色、雷諾曼依牌號），這裡只負責畫
const cardGroups = computed(() => props.groupCards(props.allCards, props.cardSearch))
</script>

<template>
  <!-- 撐滿步驟卡片的高度，手動抽牌時牌堆才能在剩下的空間置中 -->
  <div class="flex flex-1 flex-col space-y-5">
    <!-- 飛行中的替身牌：自動抽牌與手動抽牌共用（teleport 到 body，不受這裡的版面影響） -->
    <FlyingCard
      v-for="flight in flights"
      :key="flight.key"
      :image="cardImageUrl(flight.card.image)"
      :alt="flight.card.nameZh"
      :from="flight.from"
      :to="flight.to"
      :reveal="flight.reveal"
      @done="landFlight(flight.key)"
    />
    <div class="flex items-center justify-between gap-3">
      <button
        class="cursor-pointer text-[14px] text-ink-muted transition hover:text-ink sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        type="button"
        @click="emit('back')"
      >
        ← 回到問題
      </button>
      <span class="text-[11px] text-ink-muted sm:text-xs">
        {{ spread ? `${spread.name}・${targetCount} 張` : `不指定牌陣・${targetCount} 張` }}
      </span>
    </div>

    <!-- Tailwind 不會產生動態組出來的 class，欄數寫死 -->
    <div class="grid grid-cols-3 gap-1 border-2 border-tint/10 bg-sink/20 p-1">
      <button
        v-for="tab in MODES"
        :key="tab.key"
        class="cursor-pointer whitespace-nowrap px-1 py-2 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        :class="mode === tab.key ? 'bg-accent-hue/90 text-slate-950' : 'text-ink-muted hover:text-ink'"
        type="button"
        :disabled="!tab.enabled"
        @click="emit('update:mode', tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>
    <p v-if="!spread" class="text-xs leading-5 text-ink-muted">
      自動抽牌需要牌陣才知道要放在哪些位置，不指定牌陣時請用手動抽牌或自行輸入。
    </p>

    <!-- 一、自動抽牌 -->
    <!--
      牌堆、牌陣空位、按鈕從一開始就排好：按下後牌堆洗牌等後端回應，
      結果回來再一張一張飛到牌陣位置上翻開。各階段版面不變，畫面不會跳。
    -->
    <div v-if="mode === 'auto'" class="flex flex-1 flex-col space-y-4">
      <p class="border-2 border-tint/10 bg-tint/5 px-4 py-3 text-sm leading-7 text-ink-soft">
        由系統抽出 {{ targetCount }} 張牌{{ hasOrientation ? '並決定正逆位' : '' }}，直接填入{{ spread?.name }}的各個位置。
      </p>

      <div class="flex flex-1 flex-col justify-center space-y-4 sm:space-y-5">
        <div class="flex h-24 items-center justify-center sm:h-[7.5rem]">
          <div ref="autoDeckEl" class="relative h-[4.5rem] w-12">
            <!-- 等待抽牌時牌堆後面一圈淡淡的光暈，跟著呼吸明暗 -->
            <span
              v-if="autoPhase === 'idle'"
              class="absolute -inset-3 animate-pulse bg-accent-hue/15 motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span
              v-for="layer in 3"
              :key="layer"
              class="absolute inset-0 border-2 border-accent-hue/20 [background-image:var(--pixel-card-back)] [background-size:100%_100%] [image-rendering:pixelated]"
              :style="{ transform: `translateY(${(3 - layer) * 2}px)` }"
            />
            <span
              class="relative flex h-full w-full items-center justify-center border-2 border-accent-hue/30 [background-image:var(--pixel-card-back)] [background-size:100%_100%] [image-rendering:pixelated] shadow-lg shadow-black/50"
            >
              <span class="text-[13px] leading-none text-warn/50">✦</span>
            </span>
          </div>
        </div>

        <SpreadSlots
          ref="autoSlotsRef"
          :labels="positionLabels"
          :cards="autoLanded"
          :hidden-ids="landingIds"
          :show-orientation="hasOrientation"
          :grid="spread?.grid"
          :layouts="spread?.positions.map((position) => position.layout)"
        />
      </div>

      <!-- 按下後按鈕留在原地改顯示進度，版面高度不變 -->
      <button
        class="w-full cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 py-3 text-[14px] font-medium text-accent transition hover:bg-accent-hue/25 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        type="button"
        :disabled="isLoading || autoPhase !== 'idle'"
        aria-live="polite"
        @click="onAutoDraw"
      >
        {{ autoPhase === 'idle' ? '抽牌' : autoPhase === 'shuffling' ? '洗牌中…' : '正在把牌放上牌陣' }}
      </button>
    </div>

    <!-- 二、手動抽牌：扇形牌堆 -->
    <div v-else-if="mode === 'fan'" class="flex flex-1 flex-col space-y-4">
      <!-- 手機寬度放不下一整列，讓按鈕整顆換行而不是把字擠成兩行 -->
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p class="text-xs text-ink-soft/85 sm:text-sm">
          已選 {{ picked.length }} / {{ targetCount }} 張
        </p>
        <div class="flex gap-2">
          <button
            class="cursor-pointer whitespace-nowrap border-2 border-tint/15 px-2.5 py-1 text-[14px] text-ink-soft transition hover:bg-tint/10 disabled:opacity-40 sm:px-3 sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            :disabled="picked.length === 0"
            @click="onUndoPick"
          >
            收回最後一張
          </button>
          <button
            class="cursor-pointer whitespace-nowrap border-2 border-tint/15 px-2.5 py-1 text-[14px] text-ink-soft transition hover:bg-tint/10 sm:px-3 sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="emit('reshuffle')"
          >
            重新洗牌
          </button>
        </div>
      </div>

      <!-- 牌堆、按鈕與位置格在剩下的空間裡垂直置中，上面那一列維持在頂端 -->
      <div class="flex flex-1 flex-col justify-center space-y-4">
      <FanDeck
        ref="fanRef"
        :deck="deck"
        :can-pick="!pickedEnough"
        :hidden-ids="returningIds"
        :pile-count="pileCount"
        @pick="onPick"
        @phase="fanPhase = $event"
      />

      <!-- 洗牌會一直循環，使用者覺得可以了再按 -->
      <div v-if="fanPhase === 'shuffling'" class="flex justify-center pt-2">
        <button
          type="button"
          class="cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-6 py-2 text-[14px] font-medium text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
          @click="fanRef?.cut()"
        >
          切牌
        </button>
      </div>

      <!-- 已放入牌陣的位置：洗牌、切牌時先不顯示，牌攤開後才淡入 -->
      <Transition
        enter-active-class="transition duration-300 [transition-timing-function:steps(4)]"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
      >
        <SpreadSlots
          v-if="showSlots"
          ref="fanSlotsRef"
          :labels="positionLabels"
          :cards="picked"
          :hidden-ids="landingIds"
          :show-orientation="hasOrientation"
        />
      </Transition>

      <!-- 和位置格一樣，切完牌才出現 -->
      <button
        v-if="showSlots"
        class="w-full cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 py-3 text-[14px] font-medium text-accent transition hover:bg-accent-hue/25 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        type="button"
        :disabled="isLoading || !pickedEnough"
        @click="emit('submit')"
      >
        {{ isLoading ? '解讀中…' : pickedEnough ? '看結果' : `還要再選 ${targetCount - picked.length} 張` }}
      </button>
      </div>
    </div>

    <!-- 三、輸入已抽到的牌 -->
    <div v-else class="space-y-4">
      <p class="text-sm text-ink-soft/85">
        已輸入 {{ inputFilled }} / {{ targetCount }} 張。
        <template v-if="gridInput">照實體牌攤開的樣子，一格一格輸入（一格是一個宮位）；點有牌的格子可以換牌，✕ 清除。</template>
        <template v-else>
          <span class="hidden md:inline">順序即為位置順序，可以拖曳調整。</span>
          <span class="md:hidden">點一下位置就可以挑牌。</span>
        </template>
      </p>

      <!-- 左右並排：左邊是位置與已輸入的牌，右邊是選牌清單。
           以前選牌排在最下面，每加一張都要捲到底。768px 以下寬度不夠分欄，改回上下排列。
           右欄要放得下一排五張、四個字的牌名，所以給得比左欄寬鬆。 -->
      <div class="space-y-4">
        <!-- 有牌陣：每個位置代表什麼已經寫在下面每一列裡，這裡只留牌陣說明 -->
        <div v-if="spread" class="border-2 border-tint/10 bg-sink/15 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-ink-muted">{{ spread.name }}・位置順序</p>
          <p class="mt-1 text-xs leading-5 text-ink-muted/90">{{ spread.description }}</p>
        </div>

        <!-- 不指定牌陣：位置含意由使用者自己定義，留白就只當成「第 N 張」 -->
        <div v-else class="space-y-2 border-2 border-tint/10 bg-sink/15 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-ink-muted">自訂位置含意</p>
          <p class="text-xs leading-5 text-ink-muted/90">
            可以自己定義每張牌代表什麼（例如「我的想法」「對方的想法」）。留白就只當成第 N 張，不影響解讀。
          </p>
          <div v-for="(_, index) in slots" :key="index" class="flex flex-wrap items-center gap-2">
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center text-[11px]"
              :class="inputCards[index] ? 'bg-accent-hue/80 text-slate-950' : 'bg-tint/10 text-ink-muted'"
            >
              {{ index + 1 }}
            </span>
            <input
              :value="customPositions[index]?.label ?? ''"
              type="text"
              maxlength="20"
              class="w-28 shrink-0 border-2 border-tint/10 bg-tint/5 px-3 py-1.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40"
              placeholder="位置名稱"
              @input="emit('updateCustomPosition', index, { label: ($event.target as HTMLInputElement).value })"
            />
            <input
              :value="customPositions[index]?.prompt ?? ''"
              type="text"
              maxlength="120"
              class="min-w-[8rem] flex-1 border-2 border-tint/10 bg-tint/5 px-3 py-1.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40"
              placeholder="這個位置代表什麼（選填）"
              @input="emit('updateCustomPosition', index, { prompt: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>

        <!--
          格子模式（雷諾曼大藍圖 9×4）：照牌陣的形狀排，一格一個宮位，點一格就跳出選牌視窗；
          手機放不下 9 欄，整塊左右捲動（每格至少 5rem：4.5rem 時兩位數宮位的名稱會被 ✕ 擠掉），外面的版面不跟著撐開
        -->
        <div v-if="gridInput" class="space-y-2">
          <CheckboxField v-model="autoAdvance">選完自動跳到下一個空格</CheckboxField>
          <div class="-mx-1 overflow-x-auto px-1 pb-1">
            <ul
              class="grid gap-1.5"
              :style="{ gridTemplateColumns: `repeat(${gridColumns}, minmax(5rem, 1fr))` }"
              aria-label="大藍圖的格子"
            >
              <li
                v-for="(slot, index) in slots"
                :key="index"
                class="relative min-w-0"
                :style="spread?.positions[index]?.layout ? { gridColumn: spread.positions[index]!.layout!.col, gridRow: spread.positions[index]!.layout!.row } : undefined"
              >
                <button
                  type="button"
                  class="flex w-full cursor-pointer flex-col items-center gap-1 border-2 px-1 py-1.5 text-center transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
                  :class="inputCards[index] ? 'border-accent-hue/40 bg-accent-hue/8' : 'border-dashed border-tint/20 bg-tint/5'"
                  :aria-label="`${slot.label}：${inputCards[index] ? labelOf(inputCards[index]!) : '還沒選牌'}`"
                  @click="openPicker(index)"
                >
                  <!-- 有牌時右上角有 ✕，宮位名稱讓出位置，才不會被蓋住（2026-11-25 手機截圖發現） -->
                  <span class="w-full truncate text-caption text-ink-muted" :class="inputCards[index] ? 'pr-4 text-left' : ''">{{ slot.label }}</span>
                  <span class="relative h-12 w-7 shrink-0">
                    <img
                      v-if="inputCards[index] && cardImageUrl(inputCards[index]!.image)"
                      :src="cardImageUrl(inputCards[index]!.image)"
                      :alt="inputCards[index]!.nameZh"
                      class="absolute inset-0 h-full w-full object-cover"
                    />
                    <span v-else class="absolute inset-0 flex items-center justify-center text-ink-muted" aria-hidden="true">＋</span>
                  </span>
                  <span class="w-full truncate text-caption" :class="inputCards[index] ? 'text-ink' : 'text-ink-muted'">
                    {{ inputCards[index] ? labelOf(inputCards[index]!) : '選牌' }}
                  </span>
                </button>
                <button
                  v-if="inputCards[index]"
                  type="button"
                  class="absolute right-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center bg-surface/90 text-caption text-ink-soft transition hover:text-danger active:translate-x-[1px] active:translate-y-[1px]"
                  :aria-label="`清除${slot.label}的牌`"
                  title="清除這一格"
                  @click="emit('removeInputCard', index)"
                >
                  ✕
                </button>
              </li>
            </ul>
          </div>
        </div>

        <!-- 每個位置都先排好，還沒放牌的位置也看得到；點一下就跳出選牌視窗。桌機排成兩欄，省下高度 -->
        <ul v-else class="grid gap-2 md:grid-cols-2">
          <li
            v-for="(slot, index) in slots"
            :key="index"
            class="flex items-center gap-2 border-2 bg-tint/5 p-2 transition md:gap-3"
            :class="[
              dropIndex === index ? 'border-accent-hue/60 bg-accent-hue/8' : 'border-tint/10',
              dragIndex === index ? 'opacity-40' : '',
            ]"
            :draggable="!isMobile && Boolean(inputCards[index])"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <!-- 位置名稱與這個位置代表什麼。說明太長時截成兩行，完整文字放在 title -->
            <span class="w-16 shrink-0 text-[11px] leading-tight text-ink-muted md:w-28" :title="slot.prompt || undefined">
              {{ index + 1 }}. {{ slot.label }}
              <span v-if="slot.prompt" class="mt-0.5 line-clamp-2 text-[10px] leading-tight text-ink-muted">
                {{ slot.prompt }}
              </span>
            </span>

            <span
              v-if="!isMobile"
              class="shrink-0 cursor-grab select-none text-ink-muted active:cursor-grabbing"
              title="拖曳調整順序"
            >
              ⠿
            </span>

            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-1 text-left transition hover:bg-tint/5 active:translate-x-[2px] active:translate-y-[2px]"
              @click="openPicker(index)"
            >
              <!-- 固定大小的縮圖框：飛牌的終點。替身飛行期間只留虛線框，抵達後才換成牌圖 -->
              <span :ref="(el) => setInputThumb(index, el)" class="relative h-12 w-7 shrink-0">
                <img
                  v-if="inputCards[index] && cardImageUrl(inputCards[index]!.image) && !landingIds.has(inputCards[index]!.id)"
                  :src="cardImageUrl(inputCards[index]!.image)"
                  :alt="inputCards[index]!.nameZh"
                  class="absolute inset-0 h-full w-full object-cover"
                  :class="{ 'rotate-180': hasOrientation && inputCards[index]!.orientation === 'reversed' }"
                />
                <span
                  v-else
                  class="absolute inset-0 flex items-center justify-center border-2 border-dashed border-tint/20 text-ink-muted/50"
                  aria-hidden="true"
                >
                  ＋
                </span>
              </span>
              <span v-if="inputCards[index]" class="min-w-0 flex-1 truncate text-sm text-ink">
                {{ labelOf(inputCards[index]!) }}
              </span>
              <span v-else class="min-w-0 flex-1 truncate text-sm text-ink-muted">
                點一下選牌
              </span>
            </button>

            <template v-if="inputCards[index]">
              <button
                v-if="hasOrientation"
                class="cursor-pointer border-2 border-tint/15 px-2 py-1 text-[14px] text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
                type="button"
                @click="emit('toggleInputOrientation', index)"
              >
                {{ inputCards[index]!.orientation === 'upright' ? '正位' : '逆位' }}
              </button>
              <button
                class="cursor-pointer px-2 py-1 text-[14px] text-up-ink transition hover:bg-up-hue/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
                type="button"
                title="移除"
                @click="emit('removeInputCard', index)"
              >
                ✕
              </button>
            </template>
          </li>
        </ul>
      </div>

      <button
        class="w-full cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 py-3 text-[14px] font-medium text-accent transition hover:bg-accent-hue/25 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        type="button"
        :disabled="isLoading || !inputEnough"
        @click="emit('submit')"
      >
        {{ isLoading ? '解讀中…' : inputEnough ? '看結果' : `還要再輸入 ${targetCount - inputFilled} 張` }}
      </button>

      <!--
        選牌視窗：點某個位置才打開，選完就關掉。手機滿版；桌機是置中的視窗，點背景或按 Esc 關閉。
        teleport 到 body，不然外層卡片的 會把 fixed 定位困在卡片裡。
      -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition duration-200 [transition-timing-function:steps(4)] motion-reduce:transition-none"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition duration-150 [transition-timing-function:steps(4)] motion-reduce:transition-none"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="pickerIndex !== null"
            class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-overlay md:p-6"
            @click.self="closePicker"
          >
          <div
            class="flex h-full w-full flex-col bg-surface text-ink md:h-auto md:max-h-[85vh] md:max-w-3xl md:border-2 md:border-tint/15"
            role="dialog"
            aria-modal="true"
            aria-label="選一張牌"
          >
            <div class="flex items-start justify-between gap-3 border-b border-tint/10 px-4 py-3">
              <div class="min-w-0">
                <p class="text-[10px] uppercase tracking-[0.2em] text-ink-muted">選一張牌</p>
                <p class="truncate text-sm font-medium text-ink">
                  <!-- 格子模式的位置名稱本身就有編號（例如「3 遠行」），不再加「3.」 -->
                  {{ gridInput ? '' : `${(pickerIndex ?? 0) + 1}. ` }}{{ slots[pickerIndex ?? 0]?.label }}
                </p>
                <p v-if="slots[pickerIndex ?? 0]?.prompt" class="truncate text-[11px] text-ink-muted">
                  {{ slots[pickerIndex ?? 0]?.prompt }}
                </p>
              </div>
              <button
                type="button"
                class="-mr-1 shrink-0 cursor-pointer border-2 border-tint/10 px-3 py-1.5 text-[14px] text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
                @click="closePicker"
              >
                關閉
              </button>
            </div>

            <div class="space-y-2 px-4 pt-3">
              <input
                :value="cardSearch"
                type="search"
                class="w-full border-2 border-tint/10 bg-tint/5 px-4 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40"
                :placeholder="searchPlaceholder ?? '搜尋牌名…'"
                @input="emit('update:cardSearch', ($event.target as HTMLInputElement).value)"
              />
              <p v-if="cardsError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-sm text-danger">
                {{ cardsError }}
              </p>
            </div>

            <!-- 只有這一段捲動，標題與搜尋框固定在上面 -->
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
              <div v-for="group in cardGroups" :key="group.key">
                <p
                  class="sticky top-0 z-10 -mx-4 bg-surface px-4 pb-1.5 pt-3 text-xs uppercase tracking-[0.2em] text-ink-muted"
                >
                  {{ group.label }}
                </p>
                <!-- 每組可以再分幾排（塔羅：數字牌一排五張、宮廷牌一排四張；手機一律一排兩張），排法見 lib/cardGroups.ts -->
                <div
                  v-for="row in group.rows"
                  :key="row.key"
                  class="grid gap-1.5 pt-1.5"
                  :class="row.cols"
                >
                  <button
                    v-for="card in row.cards"
                    :key="card.id"
                    class="cursor-pointer truncate border-2 px-2 py-2 text-center text-[14px] transition disabled:cursor-not-allowed disabled:opacity-40 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
                    :class="inputCards[pickerIndex ?? 0]?.id === card.id
                      ? 'border-accent-hue/40 bg-accent-hue/20 text-accent'
                      : 'border-tint/10 bg-tint/5 text-ink-soft hover:bg-tint/10'"
                    type="button"
                    :title="labelOf(card)"
                    :disabled="usedElsewhere(card)"
                    @click="chooseCard(card, $event)"
                  >
                    {{ labelOf(card) }}
                    <span v-if="gridInput && usedElsewhere(card)" class="block text-caption">已在第 {{ usedSlotNumber(card) }} 格</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>
