<script setup lang="ts">
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import FanDeck from './FanDeck.vue'
import FlyingCard from './FlyingCard.vue'
import SpreadSlots from './SpreadSlots.vue'
import { imageUrl } from '../lib/api'
import { motionDuration, prefersReducedMotion, type CardPose } from '../lib/motion'
import type {
  CardSummary,
  CustomPosition,
  DeckCard,
  DrawMode,
  FanPhase,
  InputCard,
  ReadingResponse,
  SlotCard,
  Spread,
} from '../types'

const props = defineProps<{
  mode: DrawMode
  spread: Spread | null
  targetCount: number
  // 手動抽牌：洗好的牌堆與已依序選出的牌
  deck: DeckCard[]
  picked: DeckCard[]
  // 輸入已抽到的：全牌清單，與放在各個位置上的牌（空位是 undefined）
  allCards: CardSummary[]
  inputCards: (InputCard | undefined)[]
  cardSearch: string
  cardsError: string
  isLoading: boolean
  // 不指定牌陣時，使用者自己定義的位置；長度與 targetCount 一致
  customPositions: CustomPosition[]
  // 自動抽牌的結果。拿到之後才知道抽到什麼，動畫才有牌可以發；跑完通知外層進結果頁
  autoResult: ReadingResponse | null
}>()

const emit = defineEmits<{
  'update:mode': [value: DrawMode]
  'update:cardSearch': [value: string]
  back: []
  autoDraw: []
  reshuffle: []
  pick: [index: number]
  undoPick: []
  addInputCard: [card: CardSummary]
  setInputCard: [index: number, card: CardSummary]
  removeInputCard: [index: number]
  toggleInputOrientation: [index: number]
  updateCustomPosition: [index: number, patch: Partial<CustomPosition>]
  reorderInputCards: [from: number, to: number]
  autoDealDone: []
  submit: []
}>()

// 手動抽牌是這裡的主角（自己洗牌、切牌、挑牌），排在最前面；
// 自動抽牌走 /api/readings/draw，那支端點一定要牌陣，不指定牌陣時只能手動
const MODES = computed(() => [
  { key: 'fan' as const, label: '手動抽牌', enabled: true },
  { key: 'auto' as const, label: '自動抽牌', enabled: Boolean(props.spread) },
  { key: 'input' as const, label: '輸入已抽到的', enabled: true },
])

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
}

function startAutoShuffle() {
  stopAutoShuffle()
  const el = autoDeckEl.value
  if (!el || prefersReducedMotion()) {
    return
  }
  // 左右擺動並微微傾斜，表示牌還在洗
  autoShuffle = gsap
    .timeline({ repeat: -1, yoyo: true })
    .to(el, { x: -7, rotation: -4, duration: 0.26, ease: 'power1.inOut' })
    .to(el, { x: 7, rotation: 4, duration: 0.52, ease: 'power1.inOut' })
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

async function runAutoDeal(result: ReadingResponse) {
  stopAutoShuffle()
  autoPhase.value = 'dealing'
  // 等位置格畫出來才量得到終點
  await nextTick()

  const cards: SlotCard[] = result.cards.map((entry, index) => ({
    // 同一次占卜不會有重複的牌，但位置才是這裡的身分，所以把 index 一起帶上
    id: `${entry.card.id}-${index}`,
    nameZh: entry.card.nameZh,
    image: entry.card.image ?? '',
    orientation: entry.orientation,
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

// ---- 手機的選牌視窗 ----
// 手機放不下「位置清單 ＋ 常駐選牌清單」，改成點某個位置才跳出滿版的選牌視窗，
// 選完就關掉；桌機維持左右並排，清單一直看得到。
const MOBILE_QUERY = '(max-width: 767px)'
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
let mobileQuery: MediaQueryList | null = null

function onMobileChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches
  if (!isMobile.value) {
    pickerIndex.value = null
  }
}

onMounted(() => {
  mobileQuery = window.matchMedia(MOBILE_QUERY)
  isMobile.value = mobileQuery.matches
  mobileQuery.addEventListener('change', onMobileChange)
})

// 正在選牌的位置；null 表示沒開視窗
const pickerIndex = ref<number | null>(null)

function openPicker(index: number) {
  if (!isMobile.value) {
    return
  }
  // 每次重新開始找，不要延續上一個位置的關鍵字
  emit('update:cardSearch', '')
  pickerIndex.value = index
}

function closePicker() {
  pickerIndex.value = null
}

function chooseCard(card: CardSummary) {
  const index = pickerIndex.value
  if (index === null) {
    return
  }
  emit('setInputCard', index, card)
  closePicker()
}

// 這張牌已經放在別的位置上了（放在目前這個位置的不算，點它等於不換）
function usedElsewhere(card: CardSummary) {
  return selectedInputIds.value.has(card.id) && props.inputCards[pickerIndex.value ?? -1]?.id !== card.id
}

// 視窗打開時擋住背景捲動，不然手指滑清單會連背後的頁面一起動
watch(pickerIndex, (index) => {
  document.body.style.overflow = index === null ? '' : 'hidden'
})

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', onMobileChange)
  document.body.style.overflow = ''
})

const pickedEnough = computed(() => props.picked.length === props.targetCount)
const inputFilled = computed(() => props.inputCards.filter(Boolean).length)
const inputEnough = computed(() => inputFilled.value === props.targetCount)

const selectedInputIds = computed(() => new Set(props.inputCards.filter(Boolean).map((card) => card!.id)))

// 宮廷牌由後端的 kind 判斷（編號在不同牌組不一致）；
// 舊版後端沒有這個欄位時，退回用小牌編號 11～14 粗略判斷
function isCourt(card: CardSummary) {
  return card.kind ? card.kind === 'court' : card.arcanaType === 'minor' && card.number >= 11
}

// 依搜尋字串過濾，再依大牌／四花色分組。
// 每個花色裡數字牌在上、宮廷牌另起一排接在下面：同花色的牌放在一起好找，
// 宮廷牌又和一到十的進程分開一排，不會混在一起。
const cardGroups = computed(() => {
  const keyword = props.cardSearch.trim().toLowerCase()
  const match = (card: CardSummary) =>
    !keyword ||
    card.nameZh.toLowerCase().includes(keyword) ||
    (card.nameEn || '').toLowerCase().includes(keyword)

  // 數字牌一排五張（一到十剛好兩排），宮廷牌一排四張（侍者到國王剛好一排）
  const groups: { key: string; label: string; cards: CardSummary[]; courts: CardSummary[] }[] = [
    { key: 'major', label: '大阿爾克那', cards: [], courts: [] },
    { key: 'wands', label: '權杖', cards: [], courts: [] },
    { key: 'cups', label: '聖杯', cards: [], courts: [] },
    { key: 'swords', label: '寶劍', cards: [], courts: [] },
    { key: 'pentacles', label: '錢幣', cards: [], courts: [] },
  ]
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]))

  props.allCards.filter(match).forEach((card) => {
    if (card.arcanaType === 'major') {
      byKey.major?.cards.push(card)
      return
    }
    const bucket = byKey[card.suit ?? '']
    if (isCourt(card)) {
      bucket?.courts.push(card)
    } else {
      bucket?.cards.push(card)
    }
  })

  return groups.filter((group) => group.cards.length > 0 || group.courts.length > 0)
})
</script>

<template>
  <!-- 撐滿步驟卡片的高度，手動抽牌時牌堆才能在剩下的空間置中 -->
  <div class="flex flex-1 flex-col space-y-5">
    <!-- 飛行中的替身牌：自動抽牌與手動抽牌共用（teleport 到 body，不受這裡的版面影響） -->
    <FlyingCard
      v-for="flight in flights"
      :key="flight.key"
      :image="imageUrl(flight.card.image)"
      :alt="flight.card.nameZh"
      :from="flight.from"
      :to="flight.to"
      :reveal="flight.reveal"
      @done="landFlight(flight.key)"
    />
    <div class="flex items-center justify-between gap-3">
      <button
        class="cursor-pointer text-xs text-stone-400 transition hover:text-stone-100 sm:text-sm"
        type="button"
        @click="emit('back')"
      >
        ← 回到問題
      </button>
      <span class="text-[11px] text-stone-400 sm:text-xs">
        {{ spread ? `${spread.name}・${targetCount} 張` : `不指定牌陣・${targetCount} 張` }}
      </span>
    </div>

    <!-- Tailwind 不會產生動態組出來的 class，欄數寫死 -->
    <div class="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-black/20 p-1">
      <button
        v-for="tab in MODES"
        :key="tab.key"
        class="cursor-pointer whitespace-nowrap rounded-full px-1 py-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-sm"
        :class="mode === tab.key ? 'bg-amber-200/90 text-slate-950' : 'text-stone-300/80 hover:text-stone-100'"
        type="button"
        :disabled="!tab.enabled"
        @click="emit('update:mode', tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>
    <p v-if="!spread" class="text-xs leading-5 text-stone-400">
      自動抽牌需要牌陣才知道要放在哪些位置，不指定牌陣時請用手動抽牌或自行輸入。
    </p>

    <!-- 一、自動抽牌 -->
    <div v-if="mode === 'auto'" class="flex flex-1 flex-col space-y-4">
      <template v-if="autoPhase === 'idle'">
        <p class="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-stone-200/80">
          由系統抽出 {{ targetCount }} 張牌並決定正逆位，直接填入{{ spread?.name }}的各個位置。
        </p>
        <button
          class="w-full cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          :disabled="isLoading"
          @click="onAutoDraw"
        >
          開始占卜
        </button>
      </template>

      <!-- 洗牌等後端回應，結果回來後一張一張飛到牌陣位置上翻開 -->
      <div v-else class="flex flex-1 flex-col justify-center space-y-5">
        <div class="flex h-[7.5rem] items-center justify-center">
          <div ref="autoDeckEl" class="relative h-[4.5rem] w-12">
            <span
              v-for="layer in 3"
              :key="layer"
              class="absolute inset-0 rounded-md border border-amber-200/20 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950"
              :style="{ transform: `translateY(${(3 - layer) * 2}px)` }"
            />
            <span
              class="relative flex h-full w-full items-center justify-center rounded-md border border-amber-200/30 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 shadow-lg shadow-black/50"
            >
              <span class="text-[13px] leading-none text-amber-200/50">✦</span>
            </span>
          </div>
        </div>

        <p class="text-center text-xs tracking-[0.2em] text-amber-100/70" aria-live="polite">
          {{ autoPhase === 'shuffling' ? '洗牌中…' : '正在把牌放上牌陣' }}
        </p>

        <SpreadSlots ref="autoSlotsRef" :labels="positionLabels" :cards="autoLanded" :hidden-ids="landingIds" />
      </div>
    </div>

    <!-- 二、手動抽牌：扇形牌堆 -->
    <div v-else-if="mode === 'fan'" class="flex flex-1 flex-col space-y-4">
      <!-- 手機寬度放不下一整列，讓按鈕整顆換行而不是把字擠成兩行 -->
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p class="text-xs text-stone-200/85 sm:text-sm">
          已選 {{ picked.length }} / {{ targetCount }} 張
        </p>
        <div class="flex gap-2">
          <button
            class="cursor-pointer whitespace-nowrap rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-stone-200 transition hover:bg-white/10 disabled:opacity-40 sm:px-3 sm:text-xs"
            type="button"
            :disabled="picked.length === 0"
            @click="onUndoPick"
          >
            收回最後一張
          </button>
          <button
            class="cursor-pointer whitespace-nowrap rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-stone-200 transition hover:bg-white/10 sm:px-3 sm:text-xs"
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
          class="cursor-pointer rounded-full border border-amber-200/40 bg-amber-200/15 px-6 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/25"
          @click="fanRef?.cut()"
        >
          切牌
        </button>
      </div>

      <!-- 已放入牌陣的位置：洗牌、切牌時先不顯示，牌攤開後才淡入 -->
      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
      >
        <SpreadSlots
          v-if="showSlots"
          ref="fanSlotsRef"
          :labels="positionLabels"
          :cards="picked"
          :hidden-ids="landingIds"
        />
      </Transition>

      <!-- 和位置格一樣，切完牌才出現 -->
      <button
        v-if="showSlots"
        class="w-full cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
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
      <p class="text-sm text-stone-200/85">
        已輸入 {{ inputFilled }} / {{ targetCount }} 張。
        <span class="hidden md:inline">順序即為位置順序，可以拖曳調整。</span>
        <span class="md:hidden">點一下位置就可以挑牌。</span>
      </p>

      <!-- 左右並排：左邊是位置與已輸入的牌，右邊是選牌清單。
           以前選牌排在最下面，每加一張都要捲到底。768px 以下寬度不夠分欄，改回上下排列。
           右欄要放得下一排五張、四個字的牌名，所以給得比左欄寬鬆。 -->
      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div class="space-y-4">
        <!-- 有牌陣：先把每個位置代表什麼攤開，否則使用者不知道該依什麼順序輸入 -->
        <div v-if="spread" class="rounded-3xl border border-white/10 bg-black/15 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-stone-400">{{ spread.name }}・位置順序</p>
          <p class="mt-1 text-xs leading-5 text-stone-400/90">{{ spread.description }}</p>
          <!-- 手機每個位置的說明已經寫在下面那一列裡，這裡就不重複 -->
          <ol class="mt-3 hidden space-y-1.5 md:block">
            <li
              v-for="(slot, index) in slots"
              :key="index"
              class="flex gap-2 text-sm leading-6"
              :class="inputCards[index] ? 'text-stone-100' : 'text-stone-400'"
            >
              <span
                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
                :class="inputCards[index] ? 'bg-amber-200/80 text-slate-950' : 'bg-white/10 text-stone-400'"
              >
                {{ index + 1 }}
              </span>
              <span>
                <span class="font-medium">{{ slot.label }}</span>
                <span v-if="slot.prompt" class="ml-1 text-[11px] text-stone-400/80">{{ slot.prompt }}</span>
              </span>
            </li>
          </ol>
        </div>

        <!-- 不指定牌陣：位置含意由使用者自己定義，留白就只當成「第 N 張」 -->
        <div v-else class="space-y-2 rounded-3xl border border-white/10 bg-black/15 p-4">
          <p class="text-xs uppercase tracking-[0.2em] text-stone-400">自訂位置含意</p>
          <p class="text-xs leading-5 text-stone-400/90">
            可以自己定義每張牌代表什麼（例如「我的想法」「對方的想法」）。留白就只當成第 N 張，不影響解讀。
          </p>
          <div v-for="(_, index) in slots" :key="index" class="flex flex-wrap items-center gap-2">
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]"
              :class="inputCards[index] ? 'bg-amber-200/80 text-slate-950' : 'bg-white/10 text-stone-400'"
            >
              {{ index + 1 }}
            </span>
            <input
              :value="customPositions[index]?.label ?? ''"
              type="text"
              maxlength="20"
              class="w-28 shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-stone-50 outline-none transition placeholder:text-stone-400/60 focus:border-amber-200/40"
              placeholder="位置名稱"
              @input="emit('updateCustomPosition', index, { label: ($event.target as HTMLInputElement).value })"
            />
            <input
              :value="customPositions[index]?.prompt ?? ''"
              type="text"
              maxlength="120"
              class="min-w-[8rem] flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-stone-50 outline-none transition placeholder:text-stone-400/60 focus:border-amber-200/40"
              placeholder="這個位置代表什麼（選填）"
              @input="emit('updateCustomPosition', index, { prompt: ($event.target as HTMLInputElement).value })"
            />
          </div>
        </div>

        <!-- 每個位置都先排好，還沒放牌的位置也看得到；手機點一下就跳出選牌視窗 -->
        <ul class="space-y-2">
          <li
            v-for="(slot, index) in slots"
            :key="index"
            class="flex items-center gap-2 rounded-2xl border bg-white/5 p-2 transition md:gap-3"
            :class="[
              dropIndex === index ? 'border-amber-200/60 bg-amber-100/8' : 'border-white/10',
              dragIndex === index ? 'opacity-40' : '',
            ]"
            :draggable="!isMobile && Boolean(inputCards[index])"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <!-- 位置名稱。手機把這個位置代表什麼也寫在這裡，上面那份清單就不用再看一次 -->
            <span class="w-16 shrink-0 text-[11px] leading-tight text-stone-300 md:w-24">
              {{ index + 1 }}. {{ slot.label }}
              <span v-if="slot.prompt" class="mt-0.5 block text-[10px] leading-tight text-stone-500 md:hidden">
                {{ slot.prompt }}
              </span>
            </span>

            <span
              v-if="!isMobile"
              class="shrink-0 cursor-grab select-none text-stone-500 active:cursor-grabbing"
              title="拖曳調整順序"
            >
              ⠿
            </span>

            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left transition"
              :class="isMobile ? 'cursor-pointer hover:bg-white/5' : 'cursor-default'"
              @click="openPicker(index)"
            >
              <img
                v-if="inputCards[index] && imageUrl(inputCards[index]!.image)"
                :src="imageUrl(inputCards[index]!.image)"
                :alt="inputCards[index]!.nameZh"
                class="h-12 w-8 shrink-0 rounded object-cover"
                :class="{ 'rotate-180': inputCards[index]!.orientation === 'reversed' }"
              />
              <span
                v-else
                class="flex h-12 w-8 shrink-0 items-center justify-center rounded border border-dashed border-white/20 text-stone-600"
                aria-hidden="true"
              >
                ＋
              </span>
              <span v-if="inputCards[index]" class="min-w-0 flex-1 truncate text-sm text-stone-100">
                {{ inputCards[index]!.nameZh }}
              </span>
              <span v-else class="min-w-0 flex-1 truncate text-sm text-stone-500">
                {{ isMobile ? '點一下選牌' : '從右邊的清單選牌' }}
              </span>
            </button>

            <template v-if="inputCards[index]">
              <button
                class="cursor-pointer rounded-full border border-white/15 px-2 py-1 text-xs text-stone-200 transition hover:bg-white/10"
                type="button"
                @click="emit('toggleInputOrientation', index)"
              >
                {{ inputCards[index]!.orientation === 'upright' ? '正位' : '逆位' }}
              </button>
              <button
                class="cursor-pointer rounded-full px-2 py-1 text-xs text-rose-200/80 transition hover:bg-rose-300/10"
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

        <!-- 手機不常駐這份清單，改由選牌視窗顯示 -->
        <div class="hidden space-y-2 md:block md:sticky md:top-4">
          <input
            :value="cardSearch"
            type="search"
            class="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-50 outline-none transition placeholder:text-stone-400/60 focus:border-amber-200/40"
            placeholder="搜尋牌名…"
            @input="emit('update:cardSearch', ($event.target as HTMLInputElement).value)"
          />
          <p v-if="cardsError" class="rounded-2xl border border-rose-200/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
            {{ cardsError }}
          </p>
          <!-- 捲動區用不透明底色，sticky 的分組標題才能完全蓋住捲到後面的牌，中間不留縫 -->
          <div class="max-h-[30rem] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 px-2 pb-2">
            <div v-for="group in cardGroups" :key="group.key">
              <p
                class="sticky top-0 z-10 -mx-2 bg-slate-950 px-2 pb-1.5 pt-3 text-xs uppercase tracking-[0.2em] text-stone-400"
              >
                {{ group.label }}
              </p>
              <!-- 數字牌（或大牌）一排五張，宮廷牌接在下面一排四張；手機放不下牌名，一律一排兩張 -->
              <div
                v-for="row in [
                  { key: 'cards', cols: 'grid-cols-2 sm:grid-cols-5', cards: group.cards },
                  { key: 'courts', cols: 'grid-cols-2 sm:grid-cols-4', cards: group.courts },
                ].filter((item) => item.cards.length > 0)"
                :key="row.key"
                class="grid gap-1.5 pt-1.5"
                :class="row.cols"
              >
                <button
                  v-for="card in row.cards"
                  :key="card.id"
                  class="cursor-pointer truncate rounded-xl border px-2 py-1.5 text-center text-sm transition disabled:cursor-not-allowed disabled:opacity-40"
                  :class="selectedInputIds.has(card.id)
                    ? 'border-amber-200/40 bg-amber-200/20 text-amber-50'
                    : 'border-white/10 bg-white/5 text-stone-200 hover:bg-white/10'"
                  type="button"
                  :title="card.nameZh"
                  :disabled="selectedInputIds.has(card.id) || inputEnough"
                  @click="emit('addInputCard', card)"
                >
                  {{ card.nameZh }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        class="w-full cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        :disabled="isLoading || !inputEnough"
        @click="emit('submit')"
      >
        {{ isLoading ? '解讀中…' : inputEnough ? '看結果' : `還要再輸入 ${targetCount - inputFilled} 張` }}
      </button>

      <!--
        手機的選牌視窗：點某個位置才打開，選完就關掉。
        teleport 到 body，不然外層卡片的 backdrop-blur 會把 fixed 定位困在卡片裡。
      -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="pickerIndex !== null"
            class="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-stone-100"
            role="dialog"
            aria-modal="true"
            aria-label="選一張牌"
          >
            <div class="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div class="min-w-0">
                <p class="text-[10px] uppercase tracking-[0.2em] text-stone-400">選一張牌</p>
                <p class="truncate text-sm font-medium text-stone-50">
                  {{ (pickerIndex ?? 0) + 1 }}. {{ slots[pickerIndex ?? 0]?.label }}
                </p>
                <p v-if="slots[pickerIndex ?? 0]?.prompt" class="truncate text-[11px] text-stone-400/80">
                  {{ slots[pickerIndex ?? 0]?.prompt }}
                </p>
              </div>
              <button
                type="button"
                class="-mr-1 shrink-0 cursor-pointer rounded-xl border border-white/10 px-3 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
                @click="closePicker"
              >
                關閉
              </button>
            </div>

            <div class="space-y-2 px-4 pt-3">
              <input
                :value="cardSearch"
                type="search"
                class="w-full rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-50 outline-none transition placeholder:text-stone-400/60 focus:border-amber-200/40"
                placeholder="搜尋牌名…"
                @input="emit('update:cardSearch', ($event.target as HTMLInputElement).value)"
              />
              <p v-if="cardsError" class="rounded-2xl border border-rose-200/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
                {{ cardsError }}
              </p>
            </div>

            <!-- 只有這一段捲動，標題與搜尋框固定在上面 -->
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
              <div v-for="group in cardGroups" :key="group.key">
                <p
                  class="sticky top-0 z-10 -mx-4 bg-neutral-950 px-4 pb-1.5 pt-3 text-xs uppercase tracking-[0.2em] text-stone-400"
                >
                  {{ group.label }}
                </p>
                <div
                  v-for="row in [
                    { key: 'cards', cards: group.cards },
                    { key: 'courts', cards: group.courts },
                  ].filter((item) => item.cards.length > 0)"
                  :key="row.key"
                  class="grid grid-cols-2 gap-1.5 pt-1.5"
                >
                  <button
                    v-for="card in row.cards"
                    :key="card.id"
                    class="cursor-pointer truncate rounded-xl border px-2 py-2 text-center text-sm transition disabled:cursor-not-allowed disabled:opacity-40"
                    :class="inputCards[pickerIndex ?? 0]?.id === card.id
                      ? 'border-amber-200/40 bg-amber-200/20 text-amber-50'
                      : 'border-white/10 bg-white/5 text-stone-200'"
                    type="button"
                    :title="card.nameZh"
                    :disabled="usedElsewhere(card)"
                    @click="chooseCard(card)"
                  >
                    {{ card.nameZh }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>
