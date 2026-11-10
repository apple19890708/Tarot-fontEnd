<script setup lang="ts">
import { computed } from 'vue'
import ListPager from '../ListPager.vue'
import { usePaged } from '../../lib/usePaged'
import { Bar } from 'vue-chartjs'

import HelpTip from '../HelpTip.vue'
import { stripePattern } from '../../lib/chartPattern'
import { axis, CHART_COLORS, formatNumber, formatSigned, legendOptions } from '../../lib/marketChart'
import type { IncomeForecastCheck } from '../../types'

// 預估準不準（v20，2026-11-10 使用者要求）：正式公布（證交所公告或實際除息）後，拿之前的推估來比。
// 每檔一張小圖（不同股票的每股股利差很多，例如 7 元和 0.8 元，放同一張圖小的會看不見）：每個月兩根，
// 預估（斜線，和每月預估圖的「推估」同一個畫法）、實際（實線）。數字都是後端記下的
const props = defineProps<{ checks: IncomeForecastCheck[] }>()

const groups = computed(() => {
  const map = new Map<string, IncomeForecastCheck[]>()
  for (const check of props.checks) {
    if (!map.has(check.symbol)) map.set(check.symbol, [])
    map.get(check.symbol)!.push(check)
  }
  return [...map.values()].map((list) => {
    const errors = list.map((c) => c.errorPct).filter((v): v is number => v !== null)
    return {
      symbol: list[0]!.symbol,
      code: list[0]!.code ?? list[0]!.symbol,
      name: list[0]!.name,
      list,
      // 平均誤差（絕對值，看準不準）與平均偏向（正的＝平均高估）
      data: chartData(list),
      options: chartOptions(list),
      meanAbs: errors.length ? errors.reduce((sum, v) => sum + Math.abs(v), 0) / errors.length : null,
      bias: errors.length ? errors.reduce((sum, v) => sum + v, 0) / errors.length : null,
    }
  })
})

const monthLabel = (month: string) => `${month.slice(2, 4)}/${Number(month.slice(5))}`

function chartData(list: IncomeForecastCheck[]) {
  return {
    labels: list.map((c) => monthLabel(c.month)),
    datasets: [
      { label: '預估', data: list.map((c) => c.estimate), backgroundColor: stripePattern(CHART_COLORS.radar, CHART_COLORS.radarFill), borderColor: CHART_COLORS.radar, borderWidth: 1, borderRadius: 3 },
      { label: '實際', data: list.map((c) => c.actual), backgroundColor: CHART_COLORS.radar, borderRadius: 3 },
    ],
  }
}
function chartOptions(list: IncomeForecastCheck[]) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: legendOptions(),
      tooltip: {
        callbacks: {
          title: (rows: { dataIndex: number }[]) => {
            const c = list[rows[0]?.dataIndex ?? -1]
            return c ? `${c.month.slice(0, 4)} 年 ${Number(c.month.slice(5))} 月` : ''
          },
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => `${ctx.dataset.label} 每股 ${formatNumber(ctx.parsed.y, 4)}`,
          footer: (rows: { dataIndex: number }[]) => {
            const c = list[rows[0]?.dataIndex ?? -1]
            return c?.errorPct !== null && c?.errorPct !== undefined ? `預估${c.errorPct >= 0 ? '高' : '低'}了 ${formatNumber(Math.abs(c.errorPct), 1)}%` : ''
          },
        },
      },
    },
    scales: {
      x: axis({ grid: { display: false }, ticks: { color: CHART_COLORS.text, maxRotation: 0, autoSkip: true, font: { size: 11 } } }),
      y: axis({ beginAtZero: true, ticks: { color: CHART_COLORS.text, maxTicksLimit: 4, font: { size: 11 } } }),
    },
  }
}
// 分頁（股票多的時候；每頁筆數記住）
const { items: pageGroups, page, pageSize, total } = usePaged(groups, 'income-forecast')
// 平均誤差的顏色：10% 以內綠、30% 以上黃
const accuracyClass = (value: number | null) => (value === null ? 'text-ink-muted' : value <= 10 ? 'text-ok' : value >= 30 ? 'text-warn' : 'text-ink-soft')
</script>

<template>
  <section class="space-y-2">
    <p class="flex items-center gap-1 text-body text-ink-muted">預估準不準（正式公布後的比較）<HelpTip term="forecastCheck" /></p>
    <p v-if="!groups.length" class="border-2 border-dashed border-tint/15 px-3 py-3 text-body text-ink-muted">
      從現在開始記下每個月的推估，等證交所公告或實際除息後，這裡會畫出「預估 vs 實際」。第一組比較要等下一次正式公布。
    </p>
    <div v-else class="grid gap-2 lg:grid-cols-2">
      <article v-for="group in pageGroups" :key="group.symbol" class="space-y-1.5 border-2 border-tint/10 bg-tint/5 p-3">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3">
          <p>
            <span class="font-semibold text-ink">{{ group.name }}</span>
            <span class="ml-2 text-caption tabular-nums text-ink-muted">{{ group.code }}</span>
          </p>
          <p class="text-caption text-ink-muted">
            {{ group.list.length }} 次，平均差
            <span class="tabular-nums font-semibold" :class="accuracyClass(group.meanAbs)">{{ group.meanAbs === null ? '—' : `${formatNumber(group.meanAbs, 1)}%` }}</span>
            <template v-if="group.bias !== null">（偏{{ group.bias >= 0 ? '高' : '低' }} {{ formatSigned(group.bias, '%') }}）</template>
          </p>
        </div>
        <div class="h-40">
          <Bar :data="group.data" :options="group.options as never" />
        </div>
      </article>
    </div>
    <ListPager v-if="groups.length" v-model:page="page" v-model:page-size="pageSize" :total="total" />
  </section>
</template>
