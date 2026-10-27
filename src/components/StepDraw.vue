<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import FanDeck from './FanDeck.vue'
import FlyingCard from './FlyingCard.vue'
import { imageUrl } from '../lib/api'
import { prefersReducedMotion, type CardPose } from '../lib/motion'
import type { CardSummary, CustomPosition, DeckCard, DrawMode, Spread } from '../types'

const props = defineProps<{
  mode: DrawMode
  spread: Spread | null
  targetCount: number
  // 手動抽牌：洗好的牌堆與已依序選出的牌
  deck: DeckCard[]
  picked: DeckCard[]
  // 輸入已抽到的：全牌清單與已挑選的牌
  allCards: CardSummary[]
  inputCards: (CardSummary & { orientation: 'upright' | 'reversed' })[]
  cardSearch: string
  cardsError: string
  isLoading: boolean
  // 不指定牌陣時，使用者自己定義的位置；長度與 targetCount 一致
  customPositions: CustomPosition[]
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
  removeInputCard: [index: number]
  toggleInputOrientation: [index: number]
  updateCustomPosition: [index: number, patch: Partial<CustomPosition>]
  reorderInputCards: [from: number, to: number]
  submit: []
}>()

// 自動抽牌走 /api/readings/draw，那支端點一定要牌陣；不指定牌陣時只能手動
const MODES = computed(() => [
  { key: 'auto' as const, label: '自動抽牌', enabled: Boolean(props.spread) },
  { key: 'fan' as const, label: '手動抽牌', enabled: true },
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

// ---- 手動抽牌的飛牌動畫 ----
// 資料照常立刻更新（選取／收回），動畫只是在最上層放一張替身飛過去；
// 飛行期間把終點那張藏起來，抵達後再出現。
const fanRef = ref<InstanceType<typeof FanDeck> | null>(null)
// 位置格裡放牌圖的框，依 index 存放（v-for 的 ref 陣列不保證順序）
const slotBoxes: HTMLElement[] = []

function setSlotBox(index: number, el: unknown) {
  if (el instanceof HTMLElement) {
    slotBoxes[index] = el
  }
}

interface Flight {
  key: number
  card: DeckCard
  from: CardPose
  to: CardPose
  reveal: boolean
}

const flights = ref<Flight[]>([])
let flightKey = 0

// 正在飛往位置格的牌（位置格先不顯示）與正在飛回扇形的牌（扇形先不顯示）
const landingIds = computed(() => new Set(flights.value.filter((f) => f.reveal).map((f) => f.card.id)))
const returningIds = computed(() => new Set(flights.value.filter((f) => !f.reveal).map((f) => f.card.id)))

function slotPose(index: number, card: DeckCard, fromRotation: number): CardPose | null {
  const box = slotBoxes[index]
  if (!box) {
    return null
  }
  const rect = box.getBoundingClientRect()
  // 逆位在位置格裡是倒過來的；從扇形的哪一側飛來，就往那一側轉半圈，不要繞遠路
  const rotation = card.orientation === 'reversed' ? (fromRotation < 0 ? -180 : 180) : 0
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: box.offsetWidth,
    height: box.offsetHeight,
    rotation,
  }
}

function launch(card: DeckCard, from: CardPose | null, to: CardPose | null, reveal: boolean) {
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
  launch(card, from, slotPose(slotIndex, card, from?.rotation ?? 0), true)
}

async function onUndoPick() {
  const slotIndex = props.picked.length - 1
  const card = props.picked[slotIndex]
  if (!card) {
    return
  }
  const deckIndex = props.deck.findIndex((item) => item.id === card.id)
  const fanPose = fanRef.value?.cardPose(deckIndex) ?? null
  const from = slotPose(slotIndex, card, fanPose?.rotation ?? 0)
  emit('undoPick')
  if (prefersReducedMotion()) {
    return
  }
  launch(card, from, fanPose, false)
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

const pickedEnough = computed(() => props.picked.length === props.targetCount)
const inputEnough = computed(() => props.inputCards.length === props.targetCount)

const selectedInputIds = computed(() => new Set(props.inputCards.map((card) => card.id)))

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
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-3">
      <button
        class="cursor-pointer text-sm text-stone-400 transition hover:text-stone-100"
        type="button"
        @click="emit('back')"
      >
        ← 回到問題
      </button>
      <span class="text-xs text-stone-400">
        {{ spread ? `${spread.name}・${targetCount} 張` : `不指定牌陣・${targetCount} 張` }}
      </span>
    </div>

    <!-- Tailwind 不會產生動態組出來的 class，欄數寫死 -->
    <div class="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-black/20 p-1">
      <button
        v-for="tab in MODES"
        :key="tab.key"
        class="cursor-pointer whitespace-nowrap rounded-full px-1 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-sm"
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
    <div v-if="mode === 'auto'" class="space-y-4">
      <p class="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-stone-200/80">
        由系統抽出 {{ targetCount }} 張牌並決定正逆位，直接填入{{ spread?.name }}的各個位置。
      </p>
      <button
        class="w-full cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        :disabled="isLoading"
        @click="emit('autoDraw')"
      >
        {{ isLoading ? '抽牌中…' : '開始占卜' }}
      </button>
    </div>

    <!-- 二、手動抽牌：扇形牌堆 -->
    <div v-else-if="mode === 'fan'" class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-stone-200/85">
          已選 {{ picked.length }} / {{ targetCount }} 張
        </p>
        <div class="flex gap-2">
          <button
            class="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs text-stone-200 transition hover:bg-white/10 disabled:opacity-40"
            type="button"
            :disabled="picked.length === 0"
            @click="onUndoPick"
          >
            收回最後一張
          </button>
          <button
            class="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs text-stone-200 transition hover:bg-white/10"
            type="button"
            @click="emit('reshuffle')"
          >
            重新洗牌
          </button>
        </div>
      </div>

      <FanDeck
        ref="fanRef"
        :deck="deck"
        :can-pick="!pickedEnough"
        :hidden-ids="returningIds"
        @pick="onPick"
      />

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

      <!-- 已放入牌陣的位置 -->
      <!-- 每格尺寸固定：選牌前後高度不變，下方的按鈕才不會跟著跳 -->
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="(label, index) in positionLabels"
          :key="label + index"
          class="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl border px-2 py-2 text-center"
          :class="picked[index] ? 'border-amber-200/40 bg-amber-100/8' : 'border-dashed border-white/15 bg-black/10'"
        >
          <span class="text-[11px] text-stone-400">{{ index + 1 }}. {{ label }}</span>
          <!-- 佔位點與牌圖疊在同一個固定大小的框裡，替換時不會有兩個同時撐開版面 -->
          <!-- 飛牌途中先藏起牌圖，替身抵達時才出現 -->
          <span
            :ref="(el) => setSlotBox(index, el)"
            class="relative h-12 w-8"
            :class="picked[index] && landingIds.has(picked[index].id) ? 'invisible' : ''"
          >
            <span
              v-if="!picked[index]"
              class="absolute inset-0 flex items-center justify-center text-stone-600"
            >·</span>
            <!-- 剛抽到的牌淡入並放大一下，讓人看得出牌是飛到哪個位置 -->
            <Transition
              enter-active-class="transition duration-300 ease-out"
              enter-from-class="opacity-0 scale-50"
              enter-to-class="opacity-100 scale-100"
            >
              <img
                v-if="picked[index] && imageUrl(picked[index].image)"
                :src="imageUrl(picked[index].image)"
                :alt="picked[index].nameZh"
                class="absolute inset-0 h-12 w-8 rounded object-cover"
                :class="{ 'rotate-180': picked[index].orientation === 'reversed' }"
              />
            </Transition>
          </span>
          <!-- 牌名與正逆位兩行，沒選牌時也先佔好高度 -->
          <span class="h-[1.6rem] text-[10px] leading-tight text-stone-300">
            <template v-if="picked[index]">
              {{ picked[index].nameZh }}
              <span class="block text-stone-500">
                {{ picked[index].orientation === 'upright' ? '正位' : '逆位' }}
              </span>
            </template>
          </span>
        </li>
      </ul>

      <button
        class="w-full cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        :disabled="isLoading || !pickedEnough"
        @click="emit('submit')"
      >
        {{ isLoading ? '解讀中…' : pickedEnough ? '看結果' : `還要再選 ${targetCount - picked.length} 張` }}
      </button>
    </div>

    <!-- 三、輸入已抽到的牌 -->
    <div v-else class="space-y-4">
      <p class="text-sm text-stone-200/85">
        已輸入 {{ inputCards.length }} / {{ targetCount }} 張，順序即為位置順序，可以拖曳調整。
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
          <ol class="mt-3 space-y-1.5">
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

        <ul v-if="inputCards.length > 0" class="space-y-2">
          <li
            v-for="(card, index) in inputCards"
            :key="card.id"
            class="flex items-center gap-3 rounded-2xl border bg-white/5 p-2 transition"
            :class="[
              dropIndex === index ? 'border-amber-200/60 bg-amber-100/8' : 'border-white/10',
              dragIndex === index ? 'opacity-40' : '',
            ]"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="onDragOver(index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
          >
            <!-- 只放位置名稱。說明已經在上方的位置區列過，這裡再寫一次字太多 -->
            <span class="w-24 shrink-0 text-[11px] leading-tight text-stone-300">
              {{ positionLabels[index] }}
            </span>
            <span class="shrink-0 cursor-grab select-none text-stone-500 active:cursor-grabbing" title="拖曳調整順序">
              ⠿
            </span>
            <img
              v-if="imageUrl(card.image)"
              :src="imageUrl(card.image)"
              :alt="card.nameZh"
              class="h-12 w-8 rounded object-cover"
              :class="{ 'rotate-180': card.orientation === 'reversed' }"
            />
            <span class="min-w-0 flex-1 truncate text-sm text-stone-100">{{ card.nameZh }}</span>
            <button
              class="cursor-pointer rounded-full border border-white/15 px-2 py-1 text-xs text-stone-200 transition hover:bg-white/10"
              type="button"
              @click="emit('toggleInputOrientation', index)"
            >
              {{ card.orientation === 'upright' ? '正位' : '逆位' }}
            </button>
            <button
              class="cursor-pointer rounded-full px-2 py-1 text-xs text-rose-200/80 transition hover:bg-rose-300/10"
              type="button"
              title="移除"
              @click="emit('removeInputCard', index)"
            >
              ✕
            </button>
          </li>
        </ul>
        <p v-else class="rounded-3xl border border-dashed border-white/15 bg-black/10 px-4 py-6 text-center text-sm text-stone-400">
          從旁邊的清單點選你抽到的牌，依序加入
        </p>
        </div>

        <div class="space-y-2 md:sticky md:top-4">
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
          <div class="max-h-56 space-y-3 overflow-y-auto pr-1 md:max-h-[30rem]">
            <div v-for="group in cardGroups" :key="group.key">
              <p class="sticky top-0 bg-slate-950/80 py-1 text-xs uppercase tracking-[0.2em] text-stone-400">
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
                  :disabled="selectedInputIds.has(card.id) || inputCards.length >= targetCount"
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
        {{ isLoading ? '解讀中…' : inputEnough ? '看結果' : `還要再輸入 ${targetCount - inputCards.length} 張` }}
      </button>
    </div>
  </div>
</template>
