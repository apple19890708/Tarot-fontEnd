<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import FanDeck from './FanDeck.vue'
import SkeletonBlock from './SkeletonBlock.vue'
import SpreadSlots from './SpreadSlots.vue'
import { fetchCards } from '../lib/api'
import type { CardSummary, DeckCard, FanPhase, ManualCardPick } from '../types'

// 追問的補充牌自己抽（2026-11-13 使用者要求「邏輯跟手動抽牌那邊一樣」）：
// 洗牌 → 切牌 → 選一落 → 從扇形裡點牌，正逆位在洗牌時就決定（同 HomeView 的 shuffleDeck）。
// 桌上已有的牌（原牌陣與之前的補充牌）不放進牌堆。選滿張數後按確定，交給外層送到後端。
const props = defineProps<{
  count: number
  // 桌上已經有的牌 id，不能再抽到
  excludeIds: string[]
  busy: boolean
}>()
const emit = defineEmits<{ submit: [picks: ManualCardPick[]]; cancel: [] }>()

// 全牌清單只抓一次，同一頁之後的追問共用
let cardsCache: CardSummary[] | null = null

const allCards = ref<CardSummary[]>([])
const loadError = ref('')
const deck = ref<DeckCard[]>([])
const picked = ref<DeckCard[]>([])
const fanRef = ref<InstanceType<typeof FanDeck> | null>(null)
const fanPhase = ref<FanPhase>('shuffling')
const showSlots = computed(() => fanPhase.value === 'dealing' || fanPhase.value === 'ready')

const pickedEnough = computed(() => picked.value.length >= props.count)
const labels = computed(() => Array.from({ length: props.count }, (_, index) => `補充牌 ${index + 1}`))

// 洗牌：每張配一個亂數鍵再排序（均勻），正逆位在這裡就決定
function shuffle() {
  const excluded = new Set(props.excludeIds)
  deck.value = allCards.value
    .filter((card) => !excluded.has(card.id))
    .map((card) => ({ card, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map<DeckCard>(({ card }) => ({ ...card, orientation: Math.random() > 0.5 ? 'upright' : 'reversed', picked: false }))
  picked.value = []
}

async function load() {
  loadError.value = ''
  try {
    cardsCache ??= await fetchCards()
    allCards.value = cardsCache
    shuffle()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '無法載入牌卡清單'
  }
}
onMounted(load)

function pick(index: number) {
  const card = deck.value[index]
  if (!card || card.picked || pickedEnough.value) return
  card.picked = true
  picked.value.push(card)
}

function undo() {
  const last = picked.value.pop()
  if (last) last.picked = false
}

// 張數改少了：多選的收回去
watch(
  () => props.count,
  (count) => {
    while (picked.value.length > count) undo()
  },
)

function submit() {
  if (!pickedEnough.value || props.busy) return
  emit(
    'submit',
    picked.value.map((card) => ({ id: card.id, orientation: card.orientation })),
  )
}
</script>

<template>
  <!-- 手機不加外框與內距：已經在追問區的框裡，再包一層扇形能用的寬度少將近 30px（2026-11-14 使用者回報扇形太小） -->
  <div class="min-w-0 space-y-4 sm:border-2 sm:border-tint/10 sm:bg-sink/30 sm:p-4">
    <p v-if="loadError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-caption text-danger">
      {{ loadError }}
      <button type="button" class="ml-2 cursor-pointer underline" @click="load">再試一次</button>
    </p>

    <template v-else-if="deck.length > 0">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p class="text-caption text-ink-soft">已選 {{ picked.length }} / {{ count }} 張</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="h-8 cursor-pointer whitespace-nowrap border-2 border-tint/15 px-3 text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40 font-pixel"
            :disabled="picked.length === 0 || busy"
            @click="undo"
          >
            收回最後一張
          </button>
          <button
            type="button"
            class="h-8 cursor-pointer whitespace-nowrap border-2 border-tint/15 px-3 text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40 font-pixel"
            :disabled="busy"
            @click="shuffle"
          >
            重新洗牌
          </button>
        </div>
      </div>

      <FanDeck
        ref="fanRef"
        :deck="deck"
        :can-pick="!pickedEnough && !busy"
        :pile-count="2"
        @pick="pick"
        @phase="fanPhase = $event"
      />

      <!-- 洗牌會一直循環，使用者覺得可以了再按 -->
      <div v-if="fanPhase === 'shuffling'" class="flex justify-center">
        <button
          type="button"
          class="h-9 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-6 text-button font-medium text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
          @click="fanRef?.cut()"
        >
          切牌
        </button>
      </div>

      <SpreadSlots v-if="showSlots" :labels="labels" :cards="picked" />

      <div class="flex flex-wrap gap-2">
        <!-- 兩種字疊在同一格，送出中按鈕不變寬 -->
        <button
          v-if="showSlots"
          type="button"
          class="grid h-9 flex-1 cursor-pointer items-center border-2 border-accent-hue/40 bg-accent-hue/15 px-5 text-button font-medium text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-60 font-pixel"
          :disabled="!pickedEnough || busy"
          @click="submit"
        >
          <span class="[grid-area:1/1]" :class="busy ? 'invisible' : ''" :aria-hidden="busy">
            {{ pickedEnough ? '用這幾張追問' : `還要再選 ${count - picked.length} 張` }}
          </span>
          <span class="[grid-area:1/1]" :class="busy ? '' : 'invisible'" :aria-hidden="!busy">送出中…</span>
        </button>
        <button
          type="button"
          class="h-9 cursor-pointer border-2 border-tint/15 px-4 text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-40 font-pixel"
          :disabled="busy"
          @click="emit('cancel')"
        >
          取消
        </button>
      </div>
    </template>

    <!-- 牌卡清單載入中：扇形的位置先放同高的骨架 -->
    <SkeletonBlock v-else class="h-48 w-full" />
  </div>
</template>
