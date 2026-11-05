<script setup lang="ts">
import { computed } from 'vue'

// 迷你走勢圖：只畫收盤價折線，期間漲就紅、跌就綠（台灣習慣）
const props = defineProps<{ values: number[] }>()

const WIDTH = 120
const HEIGHT = 36

const points = computed(() => {
  const values = props.values
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((value, i) => {
      const x = (i / (values.length - 1)) * WIDTH
      const y = HEIGHT - 2 - ((value - min) / span) * (HEIGHT - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const rising = computed(() => {
  const first = props.values[0]
  const last = props.values[props.values.length - 1]
  return first !== undefined && last !== undefined && last >= first
})
</script>

<template>
  <svg
    v-if="points"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    preserveAspectRatio="none"
    class="h-9 w-full"
    role="img"
    :aria-label="rising ? '近期走勢向上' : '近期走勢向下'"
  >
    <polyline
      :points="points"
      fill="none"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
      stroke-linejoin="round"
      :class="rising ? 'stroke-rose-300' : 'stroke-emerald-300'"
    />
  </svg>
  <div v-else class="h-9 w-full" />
</template>
