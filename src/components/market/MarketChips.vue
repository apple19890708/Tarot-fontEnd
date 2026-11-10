<script setup lang="ts">
import { computed } from 'vue'
import { Bar } from 'vue-chartjs'
import HelpTip from '../HelpTip.vue'

import { axis, CHART_COLORS, formatNumber, legendOptions, shortDate } from '../../lib/marketChart'
import type { MarketChips, MarketValuation } from '../../types'

// 籌碼面（三大法人、融資）與估值。判讀文字由後端產生。
const props = defineProps<{
  chips?: MarketChips | null
  valuation?: MarketValuation | null
}>()

const data = computed(() => {
  const chips = props.chips
  if (!chips) return null
  return {
    labels: chips.dates.map(shortDate),
    datasets: [
      { label: '外資', data: chips.foreign, backgroundColor: CHART_COLORS.ma60 },
      { label: '投信', data: chips.trust, backgroundColor: CHART_COLORS.ma5 },
      { label: '自營商', data: chips.dealer, backgroundColor: CHART_COLORS.neutral },
    ],
  }
})

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: legendOptions(),
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
          `${ctx.dataset.label} ${formatNumber(ctx.parsed.y, 1)} ${props.chips?.unit ?? ''}`,
      },
    },
  },
  scales: {
    x: axis({ grid: { display: false } }),
    y: axis({ ticks: { color: CHART_COLORS.text, font: { size: 11 }, callback: (v: number | string) => formatNumber(Number(v), 0) } }),
  },
}))

function streakClass(value: number) {
  if (value > 0) return 'text-up'
  if (value < 0) return 'text-down'
  return 'text-ink-muted'
}

// 有同產業的百分位就以它為主（長條與主要文字），全市場的放在下面一行小字；舊版後端只有全市場
const valuationRows = computed(() => {
  const v = props.valuation
  if (!v) return []
  const industry = v.industry ?? null
  const row = (label: string, value: string, market: number | null, peer: number | null | undefined) => {
    const usePeer = industry !== null && peer !== null && peer !== undefined
    return {
      label,
      value,
      percentile: usePeer ? peer : market,
      text: usePeer ? `高於 ${peer}% 的同產業公司（${industry!.label}，${industry!.count} 家）` : market === null ? '' : `高於 ${market}% 的上市櫃公司`,
      marketText: usePeer && market !== null ? `全體上市櫃：高於 ${market}%` : '',
    }
  }
  return [
    row('本益比', v.pe === null ? '無' : `${formatNumber(v.pe)} 倍`, v.pe === null ? null : v.pePercentile, v.pe === null ? null : industry?.pePercentile),
    row('殖利率', v.dividendYield === null ? '—' : `${formatNumber(v.dividendYield)}%`, v.yieldPercentile, industry?.yieldPercentile),
    row('股價淨值比', v.pb === null ? '—' : `${formatNumber(v.pb)} 倍`, v.pbPercentile, industry?.pbPercentile),
  ]
})
</script>

<template>
  <div class="space-y-4">
    <section v-if="chips" class="space-y-3">
      <div>
        <h4 class="flex items-center gap-1.5 text-body font-semibold text-ink">
          {{ chips.scope === 'market' ? '三大法人（全市場）' : '三大法人與融資' }}
          <HelpTip term="chips" />
        </h4>
        <p class="mt-1 text-body text-ink-muted">
          單位：{{ chips.unit }}，正值買超、負值賣超。
          <template v-if="chips.latestOnly">上櫃股票的免費資料只有最新一日。</template>
        </p>
      </div>

      <ul v-if="chips.summary" class="space-y-1 text-body">
        <li v-for="part in [chips.summary.foreign, chips.summary.trust, chips.summary.dealer]" :key="part.name" :class="streakClass(part.total)">
          {{ part.text }}
          <!-- 佔同期成交量的比例：太小（不到 1%）的買賣超在操作建議裡不計分 -->
          <span v-if="part.volumePct !== null && part.volumePct !== undefined" class="text-caption tabular-nums text-ink-muted">
            （佔成交量 {{ formatNumber(Math.abs(part.volumePct), 1) }}%）
          </span>
        </li>
        <li
          v-if="chips.summary.margin"
          :class="chips.summary.margin.direction > 0 ? 'text-up' : chips.summary.margin.direction < 0 ? 'text-down' : 'text-ink-muted'"
        >
          {{ chips.summary.margin.text }}
        </li>
      </ul>

      <div v-if="data && chips.dates.length > 1" class="relative h-48 w-full min-w-0">
        <Bar :data="data" :options="options as never" />
      </div>

      <p v-if="chips.margin" class="text-body tabular-nums text-ink-muted">
        融資餘額 {{ formatNumber(chips.margin.balance, 0) }} 張
        <template v-if="chips.margin.shortBalance !== null">· 融券餘額 {{ formatNumber(chips.margin.shortBalance, 0) }} 張</template>
      </p>
    </section>

    <section v-if="valuation" class="space-y-2">
      <h4 class="flex items-center gap-1.5 text-body font-semibold text-ink">估值 <HelpTip term="valuation" /></h4>
      <div class="grid gap-2 sm:grid-cols-3">
        <div v-for="row in valuationRows" :key="row.label" class="border-2 border-tint/10 bg-tint/5 p-3">
          <p class="text-body text-ink-muted">{{ row.label }}</p>
          <p class="mt-1 text-subtitle font-semibold tabular-nums text-ink">{{ row.value }}</p>
          <template v-if="row.percentile !== null">
            <div class="mt-2 h-1.5 w-full bg-tint/10">
              <div class="h-1.5 bg-accent-hue/70" :style="{ width: `${row.percentile}%` }" />
            </div>
            <p class="mt-1 text-caption text-ink-muted">{{ row.text }}</p>
            <p v-if="row.marketText" class="text-caption text-ink-muted/80">{{ row.marketText }}</p>
          </template>
        </div>
      </div>
      <ul v-if="valuation.summary?.notes.length" class="space-y-1 text-body text-accent">
        <li v-for="note in valuation.summary.notes" :key="note">{{ note }}</li>
      </ul>
    </section>
  </div>
</template>
