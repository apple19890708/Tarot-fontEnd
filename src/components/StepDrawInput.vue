<script setup lang="ts" generic="C extends DrawableCard">
// 抽牌步驟的「輸入已抽到的牌」（2026-11-26 前端優化 9，從 StepDraw 拆出來）：
// 每個位置先排好，點一下跳出選牌視窗（CardPickerDialog）；選好的牌從按下的位置飛進那一格並翻面。
// 桌機可以拖曳調整順序；雷諾曼大藍圖改用照牌陣形狀排的格子（inputGrid）
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import CardPickerDialog from './CardPickerDialog.vue'
import CheckboxField from './CheckboxField.vue'
import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH, cardImageUrl, cardSrcset } from '../lib/cardStyle'
import { prefersReducedMotion, type CardPose } from '../lib/motion'
import { elementPose, useCardFlights } from '../lib/useCardFlights'
import type { CardPickerGroup, CustomPosition, DrawableCard, InputOf, SpreadShape } from '../types'

const props = defineProps<{
  spread: SpreadShape | null
  targetCount: number
  // 每個位置的名稱與代表什麼（牌陣定義或使用者自訂）
  slots: { label: string; prompt: string }[]
  // 全牌清單，與放在各個位置上的牌（空位是 undefined）
  allCards: C[]
  inputCards: (InputOf<C> | undefined)[]
  cardSearch: string
  cardsError: string
  customPositions: CustomPosition[]
  groupCards: (cards: C[], search: string) => CardPickerGroup<C>[]
  cardLabel?: (card: C) => string
  searchPlaceholder?: string
  hasOrientation: boolean
  // 照牌陣的格子排（雷諾曼大藍圖 9×4）
  inputGrid: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  'update:cardSearch': [value: string]
  setInputCard: [index: number, card: C]
  removeInputCard: [index: number]
  toggleInputOrientation: [index: number]
  updateCustomPosition: [index: number, patch: Partial<CustomPosition>]
  reorderInputCards: [from: number, to: number]
  submit: []
}>()

const labelOf = (card: C) => (props.cardLabel ? props.cardLabel(card) : card.nameZh)

const { landingIds, launch } = useCardFlights()

// ---- 從清單點選後，牌從按下的位置飛進對應的位置列並翻面 ----
// 位置列裡的縮圖框，依位置 index 放（v-for 的 ref 陣列不保證順序）
const inputThumbEls: HTMLElement[] = []

function setInputThumb(index: number, el: unknown) {
  if (el instanceof HTMLElement) {
    inputThumbEls[index] = el
  }
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

// isMobile 只用來決定能不能拖曳排序（手機的拖曳和捲動會互相干擾）
const MOBILE_QUERY = '(max-width: 767px)'
const isMobile = ref(typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches)
let mobileQuery: MediaQueryList | null = null

function onMobileChange(event: MediaQueryListEvent) {
  isMobile.value = event.matches
}

onMounted(() => {
  mobileQuery = window.matchMedia(MOBILE_QUERY)
  isMobile.value = mobileQuery.matches
  mobileQuery.addEventListener('change', onMobileChange)
})

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener('change', onMobileChange)
})

// ---- 選牌視窗 ----
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

// 視窗標題：格子模式的位置名稱本身就有編號（例如「3 遠行」），不再加「3.」。
// 關閉的淡出動畫期間 pickerIndex 已經是 null，照舊顯示第一個位置，不要變成空白
const pickerSlot = computed(() => props.slots[pickerIndex.value ?? 0])
const pickerTitle = computed(() => `${gridInput.value ? '' : `${(pickerIndex.value ?? 0) + 1}. `}${pickerSlot.value?.label ?? ''}`)

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

const selectedInputIds = computed(() => new Set(props.inputCards.filter(Boolean).map((card) => card!.id)))

// 這張牌已經放在別的位置上了（放在目前這個位置的不算，點它等於不換）
function usedElsewhere(card: C) {
  return selectedInputIds.value.has(card.id) && props.inputCards[pickerIndex.value ?? -1]?.id !== card.id
}

// 格子模式標出這張牌放在哪一格
function usedNote(card: C) {
  if (!gridInput.value || !usedElsewhere(card)) return null
  const at = props.inputCards.findIndex((item) => item?.id === card.id)
  return at >= 0 ? `已在第 ${at + 1} 格` : null
}

const inputFilled = computed(() => props.inputCards.filter(Boolean).length)
const inputEnough = computed(() => inputFilled.value === props.targetCount)

// 選牌器的分組由外面決定（塔羅依大牌與花色、雷諾曼依牌號），這裡只負責畫
const cardGroups = computed(() => props.groupCards(props.allCards, props.cardSearch))
</script>

<template>
  <div class="space-y-4">
    <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
    <p class="text-sm text-ink-soft/85">
      已輸入 {{ inputFilled }} / {{ targetCount }} 張。
      <template v-if="gridInput">照實體牌攤開的樣子，一格一格輸入（一格是一個宮位）；點有牌的格子可以換牌，✕ 清除。</template>
      <template v-else>
        <span class="hidden md:inline">順序即為位置順序，可以拖曳調整。</span>
        <span class="md:hidden">點一下位置就可以挑牌。</span>
      </template>
    </p>

    <div class="space-y-4">
      <!-- 有牌陣：每個位置代表什麼已經寫在下面每一列裡，這裡只留牌陣說明 -->
      <div v-if="spread" class="border-2 border-tint/10 bg-sink/15 p-4">
        <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
        <p class="text-xs uppercase tracking-[0.2em] text-ink-muted">{{ spread.name }}・位置順序</p>
        <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
        <p class="mt-1 text-xs leading-5 text-ink-muted/90">{{ spread.description }}</p>
      </div>

      <!-- 不指定牌陣：位置含意由使用者自己定義，留白就只當成「第 N 張」 -->
      <div v-else class="space-y-2 border-2 border-tint/10 bg-sink/15 p-4">
        <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
        <p class="text-xs uppercase tracking-[0.2em] text-ink-muted">自訂位置含意</p>
        <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
        <p class="text-xs leading-5 text-ink-muted/90">
          可以自己定義每張牌代表什麼（例如「我的想法」「對方的想法」）。留白就只當成第 N 張，不影響解讀。
        </p>
        <div v-for="(_, index) in slots" :key="index" class="flex flex-wrap items-center gap-2">
          <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
          <span class="flex h-5 w-5 shrink-0 items-center justify-center text-[11px]" :class="inputCards[index] ? 'bg-accent-hue/80 text-slate-950' : 'bg-tint/10 text-ink-muted'"
          >
            {{ index + 1 }}
          </span>
          <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
          <input class="w-28 shrink-0 border-2 border-tint/10 bg-tint/5 px-3 py-1.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40"
            :value="customPositions[index]?.label ?? ''"
            type="text"
            maxlength="20"
            placeholder="位置名稱"
            @input="emit('updateCustomPosition', index, { label: ($event.target as HTMLInputElement).value })"
          />
          <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
          <input class="min-w-[8rem] flex-1 border-2 border-tint/10 bg-tint/5 px-3 py-1.5 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40"
            :value="customPositions[index]?.prompt ?? ''"
            type="text"
            maxlength="120"
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
                    :srcset="cardSrcset(inputCards[index]!.image)"
                    sizes="28px"
                    :width="CARD_IMAGE_WIDTH" :height="CARD_IMAGE_HEIGHT"
                    decoding="async"
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
          <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
          <span class="w-16 shrink-0 text-[11px] leading-tight text-ink-muted md:w-28" :title="slot.prompt || undefined">
            {{ index + 1 }}. {{ slot.label }}
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
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
                :srcset="cardSrcset(inputCards[index]!.image)"
                sizes="28px"
                :width="CARD_IMAGE_WIDTH" :height="CARD_IMAGE_HEIGHT"
                decoding="async"
                :alt="inputCards[index]!.nameZh"
                class="absolute inset-0 h-full w-full object-cover"
                :class="{ 'rotate-180': hasOrientation && inputCards[index]!.orientation === 'reversed' }"
              />
              <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
              <span class="absolute inset-0 flex items-center justify-center border-2 border-dashed border-tint/20 text-ink-muted/50"
                v-else
                aria-hidden="true"
              >
                ＋
              </span>
            </span>
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
            <span v-if="inputCards[index]" class="min-w-0 flex-1 truncate text-sm text-ink">
              {{ labelOf(inputCards[index]!) }}
            </span>
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
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

    <CardPickerDialog
      :open="pickerIndex !== null"
      :title="pickerTitle"
      :prompt="pickerSlot?.prompt ?? ''"
      :groups="cardGroups"
      :search="cardSearch"
      :error="cardsError"
      :placeholder="searchPlaceholder"
      :current-id="inputCards[pickerIndex ?? 0]?.id"
      :label-of="labelOf"
      :is-used-elsewhere="usedElsewhere"
      :used-note="usedNote"
      @close="closePicker"
      @choose="chooseCard"
      @update:search="emit('update:cardSearch', $event)"
    />
  </div>
</template>
