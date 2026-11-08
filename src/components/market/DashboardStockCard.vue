<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { fetchStockCard, fetchWatchDetail } from '../../lib/api'
import { formatNumber, formatSigned, vsPrevClass } from '../../lib/marketChart'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketPriceChart from './MarketPriceChart.vue'
import type { MarketAlertTarget, MarketAnalysis, MarketChart, MarketWatchItem, MarketWatchSummary } from '../../types'

// 股市總覽的股票卡片：和個股分析的行情區同一個樣子——名稱與價格、開高低昨收四格、日 K 線圖（只看日線）。
// 兩種來源：item（自選清單的追蹤項目，報價馬上有，K 線另外抓）、code（推薦／熱門的任何一檔台股，報價和 K 線一起抓）。
// 卡片捲進畫面才抓，免得一次打開很多檔把免費主機拖慢。點名稱那一列或「個股分析」打開個股分析彈窗（由父元件開）
// tags：名稱底下的小標籤（推薦股票的入選理由）
const props = defineProps<{ item?: MarketWatchItem; code?: string; name?: string; tags?: string[] }>()
const emit = defineEmits<{ open: [] }>()

// 追蹤項目的報價跟著父元件更新（按「更新」時）；代號卡片的報價是自己抓的
const cardTarget = ref<MarketAlertTarget | null>(null)
const cardSummary = ref<MarketWatchSummary | null>(null)
const target = computed(() => props.item?.target ?? cardTarget.value)
const summary = computed(() => props.item?.summary ?? cardSummary.value)
const chart = ref<MarketChart | null>(null)
const analysis = ref<MarketAnalysis | null>(null)
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const error = ref('')

async function loadChart() {
  status.value = 'loading'
  try {
    if (props.item) {
      const { detail } = await fetchWatchDetail(props.item.id)
      chart.value = detail.chart
      analysis.value = detail.analysis
    } else if (props.code) {
      const { card } = await fetchStockCard(props.code)
      cardTarget.value = card.target
      cardSummary.value = card.summary
      chart.value = card.chart
      analysis.value = card.analysis
    }
    status.value = 'ready'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '走勢圖暫時取不到。'
    status.value = 'error'
  }
}
const displayName = () => summary.value?.name || target.value?.name || props.name || props.code || ''

const root = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
onMounted(() => {
  if (!root.value || typeof IntersectionObserver === 'undefined') {
    void loadChart()
    return
  }
  // 快捲到的時候就先抓（rootMargin），捲過來時圖通常已經好了
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect()
        observer = null
        void loadChart()
      }
    },
    { rootMargin: '200px' },
  )
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const idOf = () => {
  const t = target.value
  if (!t) return props.code ?? ''
  return t.market === 'tw' && t.kind === 'stock' ? t.code : t.symbol || t.code
}
const trendClass = (value: number | null | undefined) => (!value ? 'text-ink-muted' : value > 0 ? 'text-up' : 'text-down')
function sessionText() {
  const s = summary.value
  if (!s) return ''
  if (s.session === 'intraday') return target.value?.market === 'us' ? '盤中' : '盤中 · 約延遲 20 秒'
  return s.quote.date ? `收盤 · ${s.quote.date.slice(5).replace('-', '/')}` : '收盤'
}
function ohlcCells() {
  const quote = summary.value?.quote
  if (!quote) return []
  return [
    { label: '開盤', value: quote.open, cls: vsPrevClass(quote.open, quote.prevClose) },
    { label: '最高', value: quote.high, cls: vsPrevClass(quote.high, quote.prevClose) },
    { label: '最低', value: quote.low, cls: vsPrevClass(quote.low, quote.prevClose) },
    { label: '昨收', value: quote.prevClose, cls: 'text-ink' },
  ]
}
</script>

<template>
  <!-- 約 350×350：名稱價格、入選理由、開高低昨收一排、精簡日 K、個股分析 -->
  <article ref="root" class="flex min-w-0 flex-col gap-2 border-2 border-tint/10 bg-tint/5 p-3">
    <!-- 名稱與價格：點了開個股分析 -->
    <button
      type="button"
      class="flex w-full cursor-pointer items-start justify-between gap-2 text-left transition hover:opacity-90"
      :aria-label="`${displayName()} 個股分析`"
      @click="emit('open')"
    >
      <span class="min-w-0">
        <span class="block truncate text-body font-semibold text-ink">
          {{ displayName() }}
          <span class="ml-1 text-caption font-normal text-ink-muted">{{ idOf() }}</span>
        </span>
        <span v-if="summary" class="block truncate text-caption text-ink-muted">{{ sessionText() }} · {{ summary.currency }}</span>
      </span>
      <span v-if="summary" class="shrink-0 text-right">
        <span class="block text-title font-semibold tabular-nums text-ink">{{ formatNumber(summary.quote.price) }}</span>
        <span class="block text-caption tabular-nums" :class="trendClass(summary.quote.change)">
          {{ formatSigned(summary.quote.change) }}（{{ formatSigned(summary.quote.changePct, '%') }}）
        </span>
      </span>
      <span v-else-if="status === 'error'" class="shrink-0 text-caption text-ink-muted">暫時取不到報價</span>
    </button>

    <p v-if="tags?.length" class="flex flex-wrap gap-1">
      <span v-for="tag in tags" :key="tag" class="border border-tint/15 px-1 text-caption text-ink-soft">{{ tag }}</span>
    </p>

    <!-- 開高低和昨收一排：和昨收比，高紅、低綠、一樣白 -->
    <dl v-if="summary" class="grid grid-cols-4 gap-1 tabular-nums">
      <div v-for="cell in ohlcCells()" :key="cell.label" class="min-w-0 border border-tint/10 bg-tint/[0.03] px-1.5 py-1">
        <dt class="text-caption text-ink-muted">{{ cell.label }}</dt>
        <dd class="truncate text-body font-semibold" :class="cell.cls">{{ formatNumber(cell.value) }}</dd>
      </div>
    </dl>

    <!-- 精簡日 K（不能縮放、沒有工具列）；捲進畫面才抓 -->
    <MarketPriceChart v-if="status === 'ready' && chart" :chart="chart" :analysis="analysis" compact />
    <p v-else-if="status === 'ready'" class="flex h-40 items-center justify-center text-caption text-ink-muted">歷史資料不足，畫不出走勢圖。</p>
    <div v-else-if="status === 'error'" class="flex h-40 flex-col items-center justify-center gap-2 text-caption text-danger">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-2 py-0.5 text-button" @click="loadChart">重試</button>
    </div>
    <SkeletonBlock v-else class="h-40 w-full rounded-none" />

    <button
      type="button"
      class="mt-auto self-start cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/10 px-2.5 py-0.5 text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[1px] active:translate-y-[1px] font-pixel"
      @click="emit('open')"
    >
      個股分析 ›
    </button>
  </article>
</template>
