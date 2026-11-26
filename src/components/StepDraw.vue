<script setup lang="ts" generic="C extends DrawableCard">
import { computed } from 'vue'

import FlyingCard from './FlyingCard.vue'
import StepDrawAuto from './StepDrawAuto.vue'
import StepDrawFan from './StepDrawFan.vue'
import StepDrawInput from './StepDrawInput.vue'
import { cardImageUrl } from '../lib/cardStyle'
import { provideCardFlights } from '../lib/useCardFlights'
import type {
  AutoDealResult,
  CardPickerGroup,
  CustomPosition,
  DeckOf,
  DrawableCard,
  DrawMode,
  InputOf,
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

// 三種抽牌方式拆成三個子元件（2026-11-26 前端優化 9，原本這個檔近千行）：
// 自動抽牌 StepDrawAuto、手動抽牌 StepDrawFan、輸入已抽到的牌 StepDrawInput（選牌視窗是 CardPickerDialog）。
// 切換方式時子元件會卸載，切回來從頭開始（原本是在這裡 watch mode 重設自動抽牌、關掉選牌視窗）。
// 飛行中的替身牌三種方式共用，畫在這裡（useCardFlights）
const { flights, landFlight } = provideCardFlights()
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
      <!-- 抽牌、解讀還在進行時不能回去（2026-11-26 前端優化 2）；觸控目標至少 44px 高（優化 10） -->
      <button
        class="-ml-2 inline-flex min-h-11 cursor-pointer items-center px-2 font-pixel text-button text-ink-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-[2px] active:translate-y-[2px]"
        type="button"
        :disabled="isLoading"
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
    <StepDrawAuto
      v-if="mode === 'auto'"
      :spread="spread"
      :target-count="targetCount"
      :position-labels="positionLabels"
      :has-orientation="hasOrientation"
      :is-loading="isLoading"
      :auto-result="autoResult"
      @auto-draw="emit('autoDraw')"
      @auto-deal-done="emit('autoDealDone')"
    />

    <!-- 二、手動抽牌：扇形牌堆 -->
    <StepDrawFan
      v-else-if="mode === 'fan'"
      :deck="deck"
      :picked="picked"
      :target-count="targetCount"
      :position-labels="positionLabels"
      :pile-count="pileCount"
      :has-orientation="hasOrientation"
      :is-loading="isLoading"
      @pick="emit('pick', $event)"
      @undo-pick="emit('undoPick')"
      @reshuffle="emit('reshuffle')"
      @submit="emit('submit')"
    />

    <!-- 三、輸入已抽到的牌 -->
    <StepDrawInput
      v-else
      :spread="spread"
      :target-count="targetCount"
      :slots="slots"
      :all-cards="allCards"
      :input-cards="inputCards"
      :card-search="cardSearch"
      :cards-error="cardsError"
      :custom-positions="customPositions"
      :group-cards="groupCards"
      :card-label="cardLabel"
      :search-placeholder="searchPlaceholder"
      :has-orientation="hasOrientation"
      :input-grid="inputGrid"
      :is-loading="isLoading"
      @update:card-search="emit('update:cardSearch', $event)"
      @set-input-card="(index, card) => emit('setInputCard', index, card)"
      @remove-input-card="emit('removeInputCard', $event)"
      @toggle-input-orientation="emit('toggleInputOrientation', $event)"
      @update-custom-position="(index, patch) => emit('updateCustomPosition', index, patch)"
      @reorder-input-cards="(from, to) => emit('reorderInputCards', from, to)"
      @submit="emit('submit')"
    />
  </div>
</template>
