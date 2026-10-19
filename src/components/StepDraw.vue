<script setup lang="ts">
import { computed, ref } from 'vue'

import FanDeck from './FanDeck.vue'
import { imageUrl } from '../lib/api'
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

// 依搜尋字串過濾，再依大牌／四花色分組
const cardGroups = computed(() => {
  const keyword = props.cardSearch.trim().toLowerCase()
  const match = (card: CardSummary) =>
    !keyword ||
    card.nameZh.toLowerCase().includes(keyword) ||
    (card.nameEn || '').toLowerCase().includes(keyword)

  const groups: { key: string; label: string; cards: CardSummary[] }[] = [
    { key: 'major', label: '大阿爾克那', cards: [] },
    { key: 'wands', label: '權杖', cards: [] },
    { key: 'cups', label: '聖杯', cards: [] },
    { key: 'swords', label: '寶劍', cards: [] },
    { key: 'pentacles', label: '錢幣', cards: [] },
  ]
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]))

  props.allCards.filter(match).forEach((card) => {
    const bucket = card.arcanaType === 'major' ? byKey.major : byKey[card.suit ?? '']
    bucket?.cards.push(card)
  })

  return groups.filter((group) => group.cards.length > 0)
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
        class="cursor-pointer rounded-full px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-35"
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
            @click="emit('undoPick')"
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

      <FanDeck :deck="deck" :can-pick="!pickedEnough" @pick="emit('pick', $event)" />

      <!-- 已放入牌陣的位置 -->
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="(label, index) in positionLabels"
          :key="label + index"
          class="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl border px-2 py-2 text-center"
          :class="picked[index] ? 'border-amber-200/40 bg-amber-100/8' : 'border-dashed border-white/15 bg-black/10'"
        >
          <span class="text-[11px] text-stone-400">{{ index + 1 }}. {{ label }}</span>
          <img
            v-if="picked[index] && imageUrl(picked[index].image)"
            :src="imageUrl(picked[index].image)"
            :alt="picked[index].nameZh"
            class="h-12 w-8 rounded object-cover"
            :class="{ 'rotate-180': picked[index].orientation === 'reversed' }"
          />
          <span v-else class="flex h-12 w-8 items-center justify-center text-stone-600">·</span>
          <span v-if="picked[index]" class="text-[10px] leading-tight text-stone-300">
            {{ picked[index].nameZh }}
            <span class="block text-stone-500">
              {{ picked[index].orientation === 'upright' ? '正位' : '逆位' }}
            </span>
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
           以前選牌排在最下面，每加一張都要捲到底。768px 以下寬度不夠分欄，改回上下排列。 -->
      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start">
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
              <div class="flex flex-wrap gap-1.5 pt-1">
                <button
                  v-for="card in group.cards"
                  :key="card.id"
                  class="cursor-pointer rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40"
                  :class="selectedInputIds.has(card.id)
                    ? 'border-amber-200/40 bg-amber-200/20 text-amber-50'
                    : 'border-white/10 bg-white/5 text-stone-200 hover:bg-white/10'"
                  type="button"
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
