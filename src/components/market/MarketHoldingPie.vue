<script setup lang="ts">
import { computed } from 'vue'
import { Doughnut } from 'vue-chartjs'

import { CHART_COLORS, formatNumber, formatSigned } from '../../lib/marketChart'

// 持股的成本與獲利圓餅圖。
// 賺錢時：成本 + 獲利 = 市值；虧損時：剩下的市值 + 虧損 = 成本。中間顯示報酬率
const props = defineProps<{ cost: number; pnl: number; currency: string }>()

const COST_COLOR = 'rgba(214,211,209,0.35)'

const segments = computed(() => {
  if (props.pnl >= 0) {
    return [
      { label: '總成本', value: props.cost, color: COST_COLOR },
      { label: '總獲利', value: props.pnl, color: CHART_COLORS.up },
    ]
  }
  return [
    { label: '剩餘市值', value: props.cost + props.pnl, color: COST_COLOR },
    { label: '總虧損', value: -props.pnl, color: CHART_COLORS.down },
  ]
})

const pnlPct = computed(() => (props.cost ? (props.pnl / props.cost) * 100 : 0))

const data = computed(() => ({
  labels: segments.value.map((s) => s.label),
  datasets: [
    {
      data: segments.value.map((s) => Math.max(s.value, 0)),
      backgroundColor: segments.value.map((s) => s.color),
      borderColor: '#0f1526',
      borderWidth: 2,
    },
  ],
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  animation: { duration: 300 },
  plugins: {
    // 圖例改用旁邊的文字，畫面比較清楚
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { label: string; parsed: number }) => `${ctx.label} ${formatNumber(ctx.parsed, 0)} ${props.currency}`,
      },
    },
  },
}
</script>

<template>
  <div class="flex items-center gap-4">
    <div class="relative h-28 w-28 shrink-0">
      <Doughnut :data="data" :options="options" aria-label="持股成本與獲利圓餅圖" role="img" />
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span class="text-[10px] text-stone-500">報酬率</span>
        <span class="text-sm font-semibold tabular-nums" :class="pnl >= 0 ? 'text-rose-300' : 'text-emerald-300'">
          {{ formatSigned(pnlPct, '%') }}
        </span>
      </div>
    </div>
    <ul class="min-w-0 space-y-1.5 text-xs tabular-nums">
      <li v-for="segment in segments" :key="segment.label" class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 shrink-0" :style="{ backgroundColor: segment.color }" />
        <span class="text-stone-400">{{ segment.label }}</span>
        <span class="text-stone-100">{{ formatNumber(segment.value, 0) }}</span>
      </li>
    </ul>
  </div>
</template>
