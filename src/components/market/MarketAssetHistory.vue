<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Line } from 'vue-chartjs'

import { fetchAssetHistory } from '../../lib/api'
import { axis, CHART_COLORS, formatNumber, formatSigned, legendOptions, shortDate } from '../../lib/marketChart'
import SkeletonBlock from '../SkeletonBlock.vue'
import type { MarketAssetHistory } from '../../types'

// 資產走勢：每天台股收盤後記一筆總資產（美股用當天匯率換成台幣），
// 上圖是總資產與投入成本，下圖是時間加權報酬率和加權指數、標普 500 的同期漲跌比較
const history = ref<MarketAssetHistory | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')

async function load() {
  status.value = 'loading'
  error.value = ''
  try {
    history.value = await fetchAssetHistory()
    status.value = 'ready'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '資產走勢暫時讀不到。'
    status.value = 'error'
  }
}
onMounted(load)

const points = computed(() => history.value?.points ?? [])
const latest = computed(() => points.value[points.value.length - 1] ?? null)
// 顏色寫在函式裡（不存成常數），computed 呼叫時才會跟著日夜模式換
const benchmarkColor = (key: string) => ({ twii: CHART_COLORS.ma5, gspc: CHART_COLORS.ma60 })[key] ?? CHART_COLORS.baseline

const xAxis = () => axis({
  ticks: { color: CHART_COLORS.text, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 }, callback(this: { getLabelForValue: (v: number) => string }, value: number | string) {
    return shortDate(this.getLabelForValue(Number(value)))
  } },
})

const valueData = computed(() => ({
  labels: points.value.map((p) => p.date),
  datasets: [
    { label: '總資產', data: points.value.map((p) => p.value), borderColor: CHART_COLORS.price, backgroundColor: CHART_COLORS.price, borderWidth: 2, pointRadius: 0, tension: 0.15 },
    { label: '投入成本', data: points.value.map((p) => p.cost), borderColor: CHART_COLORS.baseline, backgroundColor: CHART_COLORS.baseline, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, tension: 0 },
  ],
}))

const returnData = computed(() => ({
  labels: points.value.map((p) => p.date),
  datasets: [
    { label: '我的報酬率', data: points.value.map((p) => p.returnPct), borderColor: CHART_COLORS.up, backgroundColor: CHART_COLORS.up, borderWidth: 2, pointRadius: 0, tension: 0.15 },
    ...(history.value?.benchmarks ?? [])
      .filter((b) => b.points.length)
      .map((b) => ({
        label: b.label,
        data: b.points.map((p) => p.returnPct),
        borderColor: benchmarkColor(b.key),
        backgroundColor: benchmarkColor(b.key),
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
      })),
  ],
}))

function options(suffix: string, digits: number) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: legendOptions(),
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label} ${formatNumber(ctx.parsed.y, digits)}${suffix}`,
        },
      },
    },
    scales: { x: xAxis(), y: axis({ position: 'right' as const }) },
  }
}
const valueOptions = computed(() => options(' 元', 0))
const returnOptions = computed(() => options('%', 2))

// 和大盤比：最後一天的差距
const comparisons = computed(() =>
  (history.value?.benchmarks ?? [])
    .map((b) => {
      const last = b.points[b.points.length - 1]?.returnPct
      return last === null || last === undefined || !latest.value ? null : { label: b.label, diff: latest.value.returnPct - last }
    })
    .filter((c) => c !== null),
)
</script>

<template>
  <div class="space-y-3">
    <!-- 載入中：摘要列與兩張圖 -->
    <div v-if="status === 'loading'" class="space-y-3">
      <SkeletonBlock class="h-4 w-72 max-w-full rounded-none" />
      <SkeletonBlock class="h-48 w-full rounded-none" />
      <SkeletonBlock class="h-48 w-full rounded-none" />
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 text-body text-danger">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-3 py-1 text-button font-pixel" @click="load">重試</button>
    </div>

    <p v-else-if="points.length < 2" class="text-body text-ink-muted">
      每天台股收盤後（14:00 以後）會記一筆總資產，累積兩天以上才畫得出走勢。
      <template v-if="points.length === 1">目前有 {{ points[0]!.date }} 一筆。</template>
    </p>

    <template v-else>
      <p class="flex flex-wrap gap-x-4 gap-y-1 text-body tabular-nums text-ink-muted">
        <span>
          {{ points[0]!.date }} 起的報酬率
          <span class="font-semibold" :class="latest!.returnPct >= 0 ? 'text-up' : 'text-down'">{{ formatSigned(latest!.returnPct, '%') }}</span>
        </span>
        <span v-for="c in comparisons" :key="c!.label">
          {{ c!.diff >= 0 ? '贏' : '輸' }}{{ c!.label }}
          <span :class="c!.diff >= 0 ? 'text-up' : 'text-down'">{{ formatNumber(Math.abs(c!.diff)) }} 個百分點</span>
        </span>
      </p>
      <div class="h-48">
        <Line :data="valueData" :options="valueOptions" aria-label="總資產與投入成本走勢" role="img" />
      </div>
      <div class="h-48">
        <Line :data="returnData" :options="returnOptions" aria-label="報酬率和大盤比較" role="img" />
      </div>
      <p class="text-caption text-ink-muted">
        報酬率用時間加權計算：加碼或賣出不算賺賠，股利算報酬，才能和指數直接比較。美股依當天匯率換成台幣。
      </p>
    </template>
  </div>
</template>
