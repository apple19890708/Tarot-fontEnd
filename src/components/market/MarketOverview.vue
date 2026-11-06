<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'

import { fetchMarketOverview } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { useCooldown } from '../../lib/useCooldown'
import RefreshButton from '../RefreshButton.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketChips from './MarketChips.vue'
import MarketSparkline from './MarketSparkline.vue'
import type { MarketBreadth, MarketIndexCard, MarketOverview } from '../../types'

// 大盤概況：主要指數、漲跌家數、類股漲跌熱力圖、三大法人、美股與匯率。資料由後端整理（快取 10 分鐘）
const overview = ref<MarketOverview | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  if (!overview.value) status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchMarketOverview()
    if (id !== requestId) return
    overview.value = result.overview
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '大盤概況暫時讀不到。'
    if (!overview.value) status.value = 'error'
  }
}
// 手動更新：按完 30 秒內不能再按（後端也有 10 分鐘快取）
const cooldown = useCooldown(30, 'market-overview-refresh')
// 已經有資料時 load() 不會進入 loading（畫面不換成骨架），按鈕要自己知道「更新中」
const refreshing = ref(false)
const refresh = () =>
  cooldown.run(async () => {
    refreshing.value = true
    try {
      await load()
    } finally {
      refreshing.value = false
    }
  })

onMounted(load)
// 放在 KeepAlive 裡：切回這個分頁時更新（後端有快取，不會一直打外部來源）
let first = true
onActivated(() => {
  if (first) {
    first = false
    return
  }
  void load()
})

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-300'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

// 熱力圖：漲紅跌綠，幅度越大顏色越深
function heatClass(pct: number) {
  if (pct >= 3) return 'bg-rose-500/55 text-rose-50'
  if (pct >= 1.5) return 'bg-rose-500/35 text-rose-50'
  if (pct > 0) return 'bg-rose-400/15 text-rose-100'
  if (pct === 0) return 'bg-white/5 text-stone-300'
  if (pct > -1.5) return 'bg-emerald-400/15 text-emerald-100'
  if (pct > -3) return 'bg-emerald-500/35 text-emerald-50'
  return 'bg-emerald-500/55 text-emerald-50'
}

const BREADTH_LABELS = { tse: '上市', otc: '上櫃' } as const
function breadthParts(b: MarketBreadth) {
  const total = b.up + b.down + b.flat || 1
  return [
    { key: 'up', label: '上漲', count: b.up, pct: (b.up / total) * 100, bar: 'bg-rose-400/70', text: 'text-rose-300' },
    { key: 'flat', label: '平盤', count: b.flat, pct: (b.flat / total) * 100, bar: 'bg-stone-400/50', text: 'text-stone-300' },
    { key: 'down', label: '下跌', count: b.down, pct: (b.down / total) * 100, bar: 'bg-emerald-400/70', text: 'text-emerald-300' },
  ]
}

const sectorDate = computed(() => overview.value?.sectors[0]?.date ?? null)
const priceDigits = (card: MarketIndexCard) => (card.symbol === 'TWD=X' ? 3 : 2)

function timeText(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
</script>

<template>
  <section class="space-y-5 border-2 border-white/10 bg-[#0f1526] p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Market Overview</p>
        <h2 class="mt-1 text-lg font-semibold text-stone-50">大盤概況</h2>
        <p class="mt-1 text-xs leading-5 text-stone-400">
          主要指數有盤中報價；漲跌家數、類股與三大法人是最新一個交易日的收盤資料（證交所、櫃買中心公開資料）。
        </p>
      </div>
      <RefreshButton label="更新" :loading="status === 'loading' || refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <!-- 載入中：指數卡、漲跌家數、熱力圖、法人、美股 -->
    <div v-if="status === 'loading'" class="space-y-5">
      <div class="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock v-for="n in 2" :key="n" class="h-28 w-full rounded-none" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock v-for="n in 2" :key="n" class="h-14 w-full rounded-none" />
      </div>
      <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <SkeletonBlock v-for="n in 18" :key="n" class="h-12 w-full rounded-none" />
      </div>
      <SkeletonBlock class="h-48 w-full rounded-none" />
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SkeletonBlock v-for="n in 5" :key="n" class="h-16 w-full rounded-none" />
      </div>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
      <span>{{ error }}</span>
      <RefreshButton label="重試" loading-label="重試中…" tone="danger" :loading="refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <template v-else-if="overview">
      <p class="text-[11px] text-stone-500">
        更新於 {{ timeText(overview.asOf) }}<template v-if="error">｜{{ error }}</template>
      </p>

      <!-- ── 台股指數 ── -->
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="card in overview.tw" :key="card.name" class="flex items-center justify-between gap-3 border-2 border-white/10 bg-white/[0.03] p-3">
          <div class="min-w-0">
            <p class="flex items-center gap-2 text-sm text-stone-300">
              {{ card.name }}
              <span v-if="card.session === 'intraday'" class="border border-rose-300/30 px-1.5 text-[10px] text-rose-200">盤中</span>
            </p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-stone-50">{{ formatNumber(card.price) }}</p>
            <p class="text-sm tabular-nums" :class="trendClass(card.change)">{{ formatSigned(card.change) }}（{{ formatSigned(card.changePct, '%') }}）</p>
          </div>
          <div v-if="card.spark.length > 1" class="w-32 shrink-0 sm:w-40">
            <MarketSparkline :values="card.spark" />
          </div>
        </div>
      </div>

      <!-- ── 漲跌家數 ── -->
      <div v-if="overview.breadth" class="grid gap-3 sm:grid-cols-2">
        <div v-for="exchange in (['tse', 'otc'] as const)" :key="exchange" class="space-y-1.5 border-2 border-white/10 bg-white/[0.03] p-3 text-xs">
          <p class="flex justify-between text-stone-400">
            <span>{{ BREADTH_LABELS[exchange] }}漲跌家數</span>
            <span v-if="overview.breadth[exchange]?.date" class="text-stone-500">{{ overview.breadth[exchange]!.date }}</span>
          </p>
          <template v-if="overview.breadth[exchange]">
            <div class="flex h-2.5 w-full overflow-hidden bg-white/5" role="img" :aria-label="`${BREADTH_LABELS[exchange]}上漲 ${overview.breadth[exchange]!.up} 家、下跌 ${overview.breadth[exchange]!.down} 家`">
              <div v-for="part in breadthParts(overview.breadth[exchange]!)" :key="part.key" :class="part.bar" :style="{ width: `${part.pct}%` }" />
            </div>
            <p class="flex flex-wrap gap-x-4 tabular-nums">
              <span v-for="part in breadthParts(overview.breadth[exchange]!)" :key="part.key" :class="part.text">{{ part.label }} {{ part.count }}</span>
            </p>
          </template>
          <p v-else class="text-stone-500">暫時取不到。</p>
        </div>
      </div>

      <!-- ── 類股熱力圖 ── -->
      <div v-if="overview.sectors.length" class="space-y-2">
        <p class="text-xs text-stone-400">
          類股漲跌<span v-if="sectorDate" class="ml-1 text-stone-500">（{{ sectorDate }} 收盤）</span>
        </p>
        <ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
          <li
            v-for="sector in overview.sectors"
            :key="sector.name"
            class="flex min-h-12 flex-col justify-center px-2 py-1.5 text-center"
            :class="heatClass(sector.changePct)"
            :title="`${sector.name} ${formatNumber(sector.close)}`"
          >
            <span class="truncate text-[11px]">{{ sector.name }}</span>
            <span class="text-xs font-semibold tabular-nums">{{ formatSigned(sector.changePct, '%') }}</span>
          </li>
        </ul>
      </div>

      <!-- ── 三大法人（沿用股市諮詢的籌碼元件）── -->
      <MarketChips v-if="overview.institutional" :chips="overview.institutional" />

      <!-- ── 美股與匯率 ── -->
      <div v-if="overview.us.length" class="space-y-2">
        <p class="text-xs text-stone-400">美股指數與匯率</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div v-for="card in overview.us" :key="card.name" class="border-2 border-white/10 bg-white/[0.03] p-2.5">
            <p class="truncate text-[11px] text-stone-400">{{ card.name }}</p>
            <p class="mt-0.5 font-semibold tabular-nums text-stone-50">{{ formatNumber(card.price, priceDigits(card)) }}</p>
            <p class="text-xs tabular-nums" :class="trendClass(card.change)">{{ formatSigned(card.changePct, '%') }}</p>
          </div>
        </div>
      </div>

      <p v-for="note in overview.notes" :key="note" class="text-xs text-stone-400">{{ note }}</p>
    </template>
  </section>
</template>
