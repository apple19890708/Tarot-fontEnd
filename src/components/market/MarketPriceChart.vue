<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'

import { axis, CHART_COLORS, formatNumber, legendOptions, shortDate } from '../../lib/marketChart'
import type { MarketAnalysis, MarketChart } from '../../types'

// 價格走勢：收盤價與 MA5／MA20／MA60，加上最近的支撐與壓力虛線，下方是成交量
const props = defineProps<{
  chart: MarketChart
  analysis?: MarketAnalysis | null
}>()

const nearestSupport = computed(() => props.analysis?.supports[0] ?? null)
const nearestResistance = computed(() => props.analysis?.resistances[0] ?? null)

function line(label: string, data: (number | null)[], color: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'line' as const,
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 1.5,
    pointRadius: 0,
    tension: 0.2,
    spanGaps: true,
    yAxisID: 'y',
    ...extra,
  }
}

const data = computed(() => {
  const { chart } = props
  const flat = (value: number) => chart.dates.map(() => value)
  const datasets: Record<string, unknown>[] = [
    line('收盤', chart.close, CHART_COLORS.price, { borderWidth: 2, order: 1 }),
    line('MA5', chart.ma5, CHART_COLORS.ma5, { order: 2 }),
    line('MA20', chart.ma20, CHART_COLORS.ma20, { order: 3 }),
    line('MA60', chart.ma60, CHART_COLORS.ma60, { order: 4 }),
  ]
  if (nearestResistance.value) {
    datasets.push(
      line(`壓力 ${formatNumber(nearestResistance.value.price)}`, flat(nearestResistance.value.price), CHART_COLORS.up, {
        borderDash: [6, 4],
        borderWidth: 1,
        order: 5,
      }),
    )
  }
  if (nearestSupport.value) {
    datasets.push(
      line(`支撐 ${formatNumber(nearestSupport.value.price)}`, flat(nearestSupport.value.price), CHART_COLORS.down, {
        borderDash: [6, 4],
        borderWidth: 1,
        order: 6,
      }),
    )
  }
  datasets.push({
    type: 'bar' as const,
    label: '成交量',
    data: chart.volume,
    backgroundColor: CHART_COLORS.volume,
    yAxisID: 'volume',
    order: 10,
  })
  return { labels: chart.dates.map(shortDate), datasets }
})

const options = computed(() => {
  // 成交量只佔下方約四分之一，不擋住價格線
  const maxVolume = Math.max(0, ...props.chart.volume.map((v) => v ?? 0))
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: legendOptions,
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            ctx.dataset.label === '成交量'
              ? `成交量 ${formatNumber(ctx.parsed.y, 0)}`
              : `${ctx.dataset.label?.split(' ')[0]} ${formatNumber(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: axis({ ticks: { color: CHART_COLORS.text, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } } }),
      y: axis({ position: 'right' as const }),
      volume: { display: false, beginAtZero: true, max: maxVolume * 4 || undefined },
    },
  }
})
</script>

<template>
  <div class="relative h-64 w-full min-w-0 sm:h-72">
    <!-- 價格線與成交量混合：用 Bar 元件，價格的 dataset 指定 type: 'line' -->
    <Bar :data="data as never" :options="options as never" />
  </div>
</template>
