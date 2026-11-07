<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'

import { axis, CHART_COLORS, formatNumber, legendOptions, shortDate } from '../../lib/marketChart'
import type { MarketStrategies } from '../../types'

// 策略回測的資金曲線：起點都是 100，含交易成本
const props = defineProps<{
  strategies: MarketStrategies
}>()

const data = computed(() => {
  const [first] = props.strategies.strategies
  return {
    labels: (first?.curve ?? []).map((point) => point.date),
    datasets: props.strategies.strategies.map((strategy) => ({
      label: strategy.label,
      data: strategy.curve.map((point) => point.value),
      borderColor: CHART_COLORS.strategies[strategy.key] ?? CHART_COLORS.price,
      backgroundColor: CHART_COLORS.strategies[strategy.key] ?? CHART_COLORS.price,
      // 買進持有當作對照組，用虛線
      borderDash: strategy.key === 'buyHold' ? [6, 4] : [],
      borderWidth: strategy.key === 'buyHold' ? 1.5 : 2,
      pointRadius: 0,
      tension: 0.15,
    })),
  }
})

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: legendOptions(),
    tooltip: {
      callbacks: {
        title: (items: { label: string }[]) => items[0]?.label ?? '',
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label} ${formatNumber(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: axis({
      ticks: {
        color: CHART_COLORS.text,
        maxTicksLimit: 6,
        maxRotation: 0,
        font: { size: 11 },
        callback(this: { getLabelForValue: (v: number) => string }, value: number | string) {
          // 跨好幾年，顯示到年／月
          const label = this.getLabelForValue(Number(value))
          return /^\d{4}-\d{2}/.test(label) ? label.slice(0, 7).replace('-', '/') : shortDate(label)
        },
      },
    }),
    y: axis({ position: 'right' as const }),
  },
}))
</script>

<template>
  <div class="relative h-64 w-full min-w-0 sm:h-72">
    <Line :data="data" :options="options as never" />
  </div>
</template>
