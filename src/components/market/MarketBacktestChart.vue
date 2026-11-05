<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'

import { axis, CHART_COLORS, formatSigned, legendOptions } from '../../lib/marketChart'
import type { MarketBacktest } from '../../types'

// 訊號回測：每個訊號過去首次出現後 5／10／20 日的上漲機率，第一組是「任意一天買進」的基準
const props = defineProps<{
  backtest: MarketBacktest
}>()

const rows = computed(() => [
  {
    name: '基準（任意一天）',
    count: null as number | null,
    sufficient: true,
    horizons: props.backtest.baseline,
  },
  ...props.backtest.signals.map((signal) => ({
    name: `${signal.label} ${signal.value}`,
    count: signal.occurrences,
    sufficient: signal.sufficient,
    horizons: signal.horizons,
  })),
])

const data = computed(() => ({
  labels: rows.value.map((row) => (row.sufficient ? row.name : `${row.name}（樣本少）`)),
  datasets: props.backtest.horizons.map((days, h) => ({
    label: `${days} 日後上漲機率`,
    data: rows.value.map((row) => row.horizons[h]?.winRate ?? null),
    backgroundColor: CHART_COLORS.horizons[h],
    borderRadius: 2,
  })),
}))

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: legendOptions,
    tooltip: {
      callbacks: {
        label: (ctx: { datasetIndex: number; dataIndex: number; parsed: { x: number | null } }) => {
          const row = rows.value[ctx.dataIndex]
          const stat = row?.horizons[ctx.datasetIndex]
          const avg = stat ? `，平均 ${formatSigned(stat.avgReturn, '%')}` : ''
          return `${props.backtest.horizons[ctx.datasetIndex]} 日上漲 ${ctx.parsed.x ?? '—'}%${avg}`
        },
      },
    },
  },
  scales: {
    x: axis({ min: 0, max: 100, ticks: { color: CHART_COLORS.text, callback: (v: number | string) => `${v}%` } }),
    y: axis({ grid: { display: false } }),
  },
}))

// 每個訊號一列約 2.2rem，至少 14rem
const height = computed(() => `${Math.max(14, rows.value.length * 2.6 + 4)}rem`)
</script>

<template>
  <div class="relative w-full min-w-0" :style="{ height }">
    <Bar :data="data" :options="options as never" />
  </div>
</template>
