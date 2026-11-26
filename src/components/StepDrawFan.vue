<script setup lang="ts" generic="C extends DrawableCard">
// 抽牌步驟的「手動抽牌」：扇形牌堆，自己洗牌、切牌、挑牌（2026-11-26 前端優化 9，從 StepDraw 拆出來）。
// 選到的牌從扇形飛到位置格、收回時飛回扇形（替身牌由 StepDraw 統一畫，見 useCardFlights）
import { computed, nextTick, ref } from 'vue'

import FanDeck from './FanDeck.vue'
import SpreadSlots from './SpreadSlots.vue'
import { prefersReducedMotion } from '../lib/motion'
import { slotPose, useCardFlights } from '../lib/useCardFlights'
import type { DeckOf, DrawableCard, FanPhase } from '../types'

const props = defineProps<{
  // 洗好的牌堆與已依序選出的牌
  deck: DeckOf<C>[]
  picked: DeckOf<C>[]
  targetCount: number
  positionLabels: string[]
  // 切牌的落數：自由牌陣或 5 張以上切兩落，其餘切三落
  pileCount: 2 | 3
  hasOrientation: boolean
  isLoading: boolean
}>()

const emit = defineEmits<{
  pick: [index: number]
  undoPick: []
  reshuffle: []
  submit: []
}>()

const { landingIds, returningIds, launch } = useCardFlights()

// 扇形目前的階段；位置格等切完牌、開始發牌時才顯示
const fanPhase = ref<FanPhase>('shuffling')
const showSlots = computed(() => fanPhase.value === 'dealing' || fanPhase.value === 'ready')

const fanRef = ref<InstanceType<typeof FanDeck> | null>(null)
const fanSlotsRef = ref<InstanceType<typeof SpreadSlots> | null>(null)

const pickedEnough = computed(() => props.picked.length === props.targetCount)

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
</script>

<template>
  <div class="flex flex-1 flex-col space-y-4">
    <!-- 手機寬度放不下一整列，讓按鈕整顆換行而不是把字擠成兩行 -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
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
</template>
