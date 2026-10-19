<script setup lang="ts">
import { computed } from 'vue'

import type { DeckCard } from '../types'

// 攤成扇形的牌背。使用者看不到是什麼牌，點了才翻到牌陣上。
const props = defineProps<{
  deck: DeckCard[]
  // 還能不能再選（選滿牌陣張數就停）
  canPick: boolean
}>()

const emit = defineEmits<{ pick: [index: number] }>()

// 扇形展開的總角度。半徑由 --fan-r 控制，在不同斷點給不同值（見 template）
const FAN_ANGLE = 116

// 每張牌的角度：平均分布在 ±(FAN_ANGLE / 2) 之間
const angles = computed(() => {
  const count = props.deck.length
  if (count <= 1) {
    return [0]
  }
  const step = FAN_ANGLE / (count - 1)
  return props.deck.map((_, index) => -FAN_ANGLE / 2 + step * index)
})

function onPick(index: number) {
  if (!props.canPick || props.deck[index]?.picked) {
    return
  }
  emit('pick', index)
}
</script>

<template>
  <!--
    扇形排列：每張牌的 transform-origin 設在卡片下方 --fan-r 的位置，
    旋轉時就會沿著弧線擺開。半徑越大、弧越平；手機半徑小，牌會疊得比較密。
  -->
  <div
    class="relative mx-auto w-full select-none [--fan-r:190px] sm:[--fan-r:260px] lg:[--fan-r:330px]"
    :class="'h-[180px] sm:h-[240px] lg:h-[300px]'"
  >
    <button
      v-for="(card, index) in deck"
      :key="card.id"
      type="button"
      class="absolute left-1/2 top-2 w-[38px] origin-[50%_var(--fan-r)] transition-transform duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/70 motion-reduce:transition-none sm:w-[50px] lg:w-[62px]"
      :class="[
        card.picked
          ? 'pointer-events-none opacity-25'
          : canPick
            ? 'cursor-pointer hover:z-50 hover:[transform:translateX(-50%)_rotate(var(--deg))_translateY(-16px)] focus-visible:z-50 focus-visible:[transform:translateX(-50%)_rotate(var(--deg))_translateY(-16px)]'
            : 'cursor-not-allowed',
      ]"
      :style="{
        // --deg 存角度，hover 時才能在原本的 rotate 後面再接 translateY；
        // 只寫 translateY 會把 rotate 覆寫掉，整張牌會瞬間轉正。
        '--deg': `${angles[index]}deg`,
        transform: 'translateX(-50%) rotate(var(--deg))',
        zIndex: index,
      }"
      :aria-label="card.picked ? `第 ${index + 1} 張，已選取` : `選第 ${index + 1} 張牌`"
      :disabled="card.picked || !canPick"
      @click="onPick(index)"
    >
      <!-- 牌背：不顯示牌名也不顯示正逆位 -->
      <span
        class="flex aspect-[2/3] items-center justify-center rounded-md border border-amber-200/25 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 shadow-lg shadow-black/50"
      >
        <span class="text-[13px] leading-none text-amber-200/35">✦</span>
      </span>
    </button>
  </div>
</template>
