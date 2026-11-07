<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Line } from 'vue-chartjs'

import { fetchFuturesChart, fetchIndexChart } from '../../lib/api'
import { axis, CHART_COLORS, formatNumber, formatSigned } from '../../lib/marketChart'
import { useScrollLock } from '../../lib/useScrollLock'
import SkeletonBlock from '../SkeletonBlock.vue'
import type { IndexChart, IndexChartRange, MarketFuturesQuote } from '../../types'

// 大盤概況重點卡點開的走勢彈窗（像 Google 財經）：價格、這段期間的漲跌、線圖、今天的開高低與 52 週高低。
// 指數與匯率用 symbol 查後端（/index-chart，可切換時間範圍）；台指期夜盤傳 futures，
// 走勢用期交所的分鐘資料（/futures-chart），只有當次夜盤，沒有範圍切換
const props = defineProps<{
  name: string
  symbol?: string | null
  futures?: MarketFuturesQuote | null
  digits?: number
}>()
const emit = defineEmits<{ close: [] }>()

useScrollLock()

const RANGES: { key: IndexChartRange; label: string; period: string }[] = [
  { key: '1d', label: '1 天', period: '今天' },
  { key: '5d', label: '5 天', period: '過去 5 天' },
  { key: '1mo', label: '1 個月', period: '過去 1 個月' },
  { key: '6mo', label: '6 個月', period: '過去 6 個月' },
  { key: 'ytd', label: '本年迄今', period: '今年以來' },
  { key: '1y', label: '1 年', period: '過去 1 年' },
  { key: '5y', label: '5 年', period: '過去 5 年' },
]

const range = ref<IndexChartRange>('1d')
const chart = ref<IndexChart | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
// 台指期夜盤：分鐘走勢與最新報價（彈窗打開後再抓一次，比卡片上的新）
const futuresPoints = ref<{ t: string; close: number }[] | null>(null)
const futuresQuote = ref<MarketFuturesQuote | null>(props.futures ?? null)
// 連續切換範圍時只採用最後一次的回應
let requestId = 0

async function load() {
  if (!props.symbol && !props.futures) return
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    if (props.futures) {
      const result = await fetchFuturesChart()
      if (id !== requestId) return
      futuresPoints.value = result.chart.points
      futuresQuote.value = result.chart.quote
      status.value = 'ready'
      return
    }
    const result = await fetchIndexChart(props.symbol!, range.value)
    if (id !== requestId) return
    chart.value = result.chart
    status.value = 'ready'
  } catch (requestError) {
    if (id !== requestId) return
    error.value = requestError instanceof Error ? requestError.message : '走勢暫時取不到。'
    status.value = 'error'
  }
}

function selectRange(key: IndexChartRange) {
  if (key === range.value && status.value !== 'error') return
  range.value = key
  void load()
}

const digits = computed(() => props.digits ?? 2)
const period = computed(() => RANGES.find((r) => r.key === range.value)?.period ?? '')

// 漲紅跌綠（台灣習慣）；夜盤和日盤結算價比
const up = computed(() => ((props.futures ? futuresQuote.value?.change : chart.value?.rangeChange) ?? 0) >= 0)
const lineColor = computed(() => (up.value ? CHART_COLORS.up : CHART_COLORS.down))

// 時間用交易所的時區顯示（美股看紐約時間，和 Google 財經一樣）
function timeLabel(iso: string) {
  const zone = props.futures ? 'Asia/Taipei' : chart.value?.timezone || 'Asia/Taipei'
  const date = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    props.futures || range.value === '1d'
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : range.value === '5d'
        ? { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
        : range.value === '5y'
          ? { year: 'numeric', month: 'numeric' }
          : { month: 'numeric', day: 'numeric' }
  return new Intl.DateTimeFormat('zh-TW', { timeZone: zone, ...opts }).format(date)
}

const updatedText = computed(() => {
  const iso = chart.value?.time
  if (!iso) return ''
  const text = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
  return `${text}（台北時間）`
})

// 線圖的資料：指數用選的範圍；夜盤用分鐘走勢，虛線是日盤結算價
const series = computed(() => {
  if (props.futures) {
    return futuresPoints.value?.length
      ? { points: futuresPoints.value, baseline: futuresQuote.value?.refPrice ?? null, baselineLabel: '日盤結算價' }
      : null
  }
  const c = chart.value
  if (!c) return null
  return { points: c.points, baseline: range.value === '1d' ? c.baseline : null, baselineLabel: '上次收盤價' }
})

const data = computed(() => {
  const s = series.value
  if (!s) return { labels: [], datasets: [] }
  const datasets: Record<string, unknown>[] = [
    {
      label: props.name,
      data: s.points.map((p) => p.close),
      borderColor: lineColor.value,
      backgroundColor: up.value ? 'rgba(253,164,175,0.12)' : 'rgba(110,231,183,0.12)',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.15,
      fill: true,
    },
  ]
  // 1 天：上次收盤價的虛線（和 Google 財經一樣，線在上面就是今天漲）；夜盤是日盤結算價
  if (s.baseline !== null) {
    const baseline = s.baseline
    datasets.push({
      label: s.baselineLabel,
      data: s.points.map(() => baseline),
      borderColor: 'rgba(214,211,209,0.55)',
      borderWidth: 1,
      borderDash: [4, 4],
      pointRadius: 0,
      fill: false,
    })
  }
  return { labels: s.points.map((p) => timeLabel(p.t)), datasets }
})

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      filter: (item: { datasetIndex: number }) => item.datasetIndex === 0,
      callbacks: { label: (ctx: { parsed: { y: number | null } }) => formatNumber(ctx.parsed.y, digits.value) },
    },
  },
  scales: {
    x: axis({ ticks: { color: CHART_COLORS.text, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } } }),
    y: axis({ position: 'right' as const }),
  },
}))

const stats = computed(() => {
  if (props.futures) {
    const f = futuresQuote.value ?? props.futures
    return [
      { label: '開盤', value: formatNumber(f.open, 0) },
      { label: '最高', value: formatNumber(f.high, 0) },
      { label: '最低', value: formatNumber(f.low, 0) },
      { label: '參考價（日盤結算）', value: formatNumber(f.refPrice, 0) },
      { label: '成交量（口）', value: formatNumber(f.volume, 0) },
    ]
  }
  const s = chart.value?.stats
  if (!s) return []
  const n = (v: number | null) => formatNumber(v, digits.value)
  return [
    { label: '開盤', value: n(s.open) },
    { label: '最高', value: n(s.high) },
    { label: '最低', value: n(s.low) },
    { label: '上次收盤價', value: n(s.prevClose) },
    { label: '52 週高點', value: n(s.high52) },
    { label: '52 週低點', value: n(s.low52) },
  ]
})

function close() {
  emit('close')
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-black/70 md:p-6" @click.self="close">
      <div
        class="flex h-full w-full flex-col bg-[#0f1526] text-stone-100 md:h-auto md:max-h-[90vh] md:max-w-3xl md:border-2 md:border-[#3b2618] md:shadow-[6px_6px_0_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        :aria-label="`${name} 走勢`"
      >
        <div class="flex items-start justify-between gap-3 border-b-2 border-[#3b2618] px-4 py-3">
          <div class="min-w-0">
            <p class="text-title font-semibold text-stone-50">{{ name }}</p>
            <p v-if="symbol" class="text-caption text-stone-300">{{ symbol }}</p>
            <p v-else-if="futures?.contract" class="text-caption text-stone-300">{{ futures.contract }}（近月合約）</p>
          </div>
          <button
            type="button"
            class="-mr-1 shrink-0 cursor-pointer border-2 border-white/10 px-3 py-1.5 font-pixel text-button text-stone-200 transition hover:bg-white/10 active:translate-x-[2px] active:translate-y-[2px]"
            @click="close"
          >
            關閉
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <!-- ── 台指期夜盤：沒有歷史走勢，只顯示即時數字 ── -->
          <template v-if="futures && futuresQuote">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="text-display font-semibold tabular-nums text-stone-50">{{ formatNumber(futuresQuote.price, 0) }}</span>
              <span
                class="border px-2 py-0.5 text-body tabular-nums"
                :class="up ? 'border-rose-300/40 bg-rose-300/10 text-rose-100' : 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'"
              >
                {{ up ? '↑' : '↓' }} {{ formatSigned(futuresQuote.changePct, '%') }}
              </span>
              <span class="text-body tabular-nums" :class="up ? 'text-rose-300' : 'text-emerald-300'">
                {{ formatSigned(futuresQuote.change) }} 和日盤結算價比
              </span>
            </div>
            <p class="text-caption text-stone-300">{{ futuresQuote.date }} {{ futuresQuote.time }}・夜盤 15:00～隔天 05:00</p>

            <!-- 夜盤的分鐘走勢（期交所） -->
            <div class="relative h-64 sm:h-72">
              <Line v-if="series" :data="data as never" :options="options as never" />
              <SkeletonBlock v-else-if="status === 'loading'" class="h-full w-full rounded-none" />
              <p v-else-if="status === 'ready'" class="flex h-full items-center justify-center text-body text-stone-300">這次夜盤還沒有成交資料。</p>
              <div v-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f1526]/90 text-body text-rose-200">
                <p>{{ error }}</p>
                <button
                  type="button"
                  class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-button text-rose-100 transition hover:bg-rose-300/10 active:translate-x-[2px] active:translate-y-[2px]"
                  @click="load"
                >
                  重試
                </button>
              </div>
            </div>
            <p v-if="series" class="text-caption text-stone-300">每一點是一分鐘的成交價；虛線是日盤結算價，線在虛線上面就是夜盤漲。</p>
          </template>

          <!-- ── 指數與匯率 ── -->
          <template v-else>
            <!-- 價格與這段期間的漲跌；第一次載入時畫同形狀的骨架 -->
            <div v-if="chart" class="space-y-1">
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-display font-semibold tabular-nums text-stone-50">{{ formatNumber(chart.price, digits) }}</span>
                <span
                  class="border px-2 py-0.5 text-body tabular-nums"
                  :class="up ? 'border-rose-300/40 bg-rose-300/10 text-rose-100' : 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'"
                >
                  {{ up ? '↑' : '↓' }} {{ formatSigned(chart.rangeChangePct, '%') }}
                </span>
                <span class="text-body tabular-nums" :class="up ? 'text-rose-300' : 'text-emerald-300'">
                  {{ formatSigned(chart.rangeChange) }} {{ period }}
                </span>
              </div>
              <p class="text-caption text-stone-300">{{ updatedText }}</p>
            </div>
            <div v-else-if="status === 'loading'" class="space-y-2">
              <SkeletonBlock class="h-10 w-64 rounded-none" />
              <SkeletonBlock class="h-4 w-40 rounded-none" />
            </div>

            <!-- 時間範圍 -->
            <!-- overflow-y-hidden：分頁往下凸 2px 蓋住底線，不加的話會冒出上下捲軸 -->
            <div class="flex overflow-x-auto overflow-y-hidden border-b-2 border-white/10" role="tablist" aria-label="時間範圍">
              <button
                v-for="option in RANGES"
                :key="option.key"
                type="button"
                role="tab"
                :aria-selected="range === option.key"
                class="-mb-[2px] shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-button transition"
                :class="range === option.key ? 'border-amber-200 text-amber-50' : 'border-transparent text-stone-300 hover:bg-white/5 hover:text-stone-100'"
                @click="selectRange(option.key)"
              >
                {{ option.label }}
              </button>
            </div>

            <!-- 線圖：切換範圍時保留舊圖、蓋一層半透明，避免版面跳動 -->
            <div class="relative h-64 sm:h-72">
              <Line v-if="chart" :data="data as never" :options="options as never" />
              <SkeletonBlock v-else-if="status === 'loading'" class="h-full w-full rounded-none" />
              <div v-if="chart && status === 'loading'" class="absolute inset-0 bg-[#0f1526]/60" aria-hidden="true" />
              <div v-if="status === 'error'" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0f1526]/90 text-body text-rose-200">
                <p>{{ error }}</p>
                <button
                  type="button"
                  class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-button text-rose-100 transition hover:bg-rose-300/10 active:translate-x-[2px] active:translate-y-[2px]"
                  @click="load"
                >
                  重試
                </button>
              </div>
            </div>
            <p v-if="range === '1d' && chart" class="text-caption text-stone-300">虛線是上次收盤價：線在虛線上面就是今天漲。</p>
          </template>

          <!-- 今天的數字 -->
          <dl v-if="stats.length" class="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/10 pt-3 text-body tabular-nums sm:grid-cols-3">
            <div v-for="item in stats" :key="item.label" class="flex justify-between gap-3">
              <dt class="text-stone-300">{{ item.label }}</dt>
              <dd class="text-stone-50">{{ item.value }}</dd>
            </div>
          </dl>
          <div v-else-if="status === 'loading'" class="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-white/10 pt-3 sm:grid-cols-3">
            <SkeletonBlock v-for="n in 6" :key="n" class="h-5 w-full rounded-none" />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
