<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'

import { axis, CHART_COLORS, legendOptions } from '../../lib/marketChart'
import type { MarketPrediction } from '../../types'

// 機器學習：今天每個特徵把「上漲機率」往哪邊推（正值偏漲、負值偏跌）
const props = defineProps<{
  prediction: MarketPrediction
}>()

const factors = computed(() =>
  props.prediction.factors
    .filter((factor) => factor.contribution !== null)
    .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0)),
)

const data = computed(() => ({
  labels: factors.value.map((factor) => factor.plain || factor.label),
  datasets: [
    {
      label: '今天的影響（往右偏漲、往左偏跌）',
      data: factors.value.map((factor) => factor.contribution),
      backgroundColor: factors.value.map((factor) => ((factor.contribution ?? 0) >= 0 ? CHART_COLORS.up : CHART_COLORS.down)),
      borderRadius: 2,
    },
  ],
}))

// computed：軸線與圖例的顏色跟著日夜模式換
const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: { legend: legendOptions() },
  scales: {
    x: axis(),
    y: axis({ grid: { display: false } }),
  },
}))
</script>

<template>
  <div class="relative h-72 w-full min-w-0">
    <Bar :data="data" :options="options as never" />
  </div>
</template>
