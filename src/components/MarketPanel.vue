<script setup lang="ts">
import { computed } from 'vue'

import MarketAdvice from './market/MarketAdvice.vue'
import MarketChips from './market/MarketChips.vue'
import MarketPriceChart from './market/MarketPriceChart.vue'
import MarketResearch from './market/MarketResearch.vue'
import { useCooldown } from '../lib/useCooldown'
import SkeletonBlock from './SkeletonBlock.vue'
import type { MarketItem, MarketSignal, MarketSnapshot, MarketStatus } from '../types'

// 股市諮詢的行情與技術指標。
// 數字、判讀標籤（多頭排列、黃金交叉…）、支撐壓力都是後端算好的，這裡只排版與上色，不在前端下結論。
const props = defineProps<{
  snapshot: MarketSnapshot | null
  status: MarketStatus
  error?: string
  // 回顧舊紀錄時，顯示的是當時存下來的資料
  isSaved?: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

// 「更新報價」按完 30 秒內不能再按（載入狀態由父元件控制，這裡只管冷卻）
const cooldown = useCooldown(30)
function refresh() {
  if (props.status === 'loading' || cooldown.active.value) return
  emit('refresh')
  cooldown.start()
}

const asOfText = computed(() =>
  props.snapshot
    ? new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(props.snapshot.asOf))
    : '',
)

function num(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return '—'
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function signed(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined) {
    return '—'
  }
  return `${value > 0 ? '+' : ''}${num(value)}${suffix}`
}

// 台灣習慣：漲紅跌綠
function trendClass(value: number | null | undefined) {
  if (!value) {
    return 'text-stone-300'
  }
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

const TONE_STYLES: Record<MarketSignal['tone'], string> = {
  bull: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  bear: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  warn: 'border-amber-200/30 bg-amber-200/10 text-amber-100',
  neutral: 'border-white/15 bg-white/5 text-stone-200',
}

function idOf(item: MarketItem) {
  return item.kind === 'index' ? item.symbol : item.code || item.symbol
}

function sessionLabel(item: MarketItem) {
  if (item.session === 'intraday') {
    return item.market === 'tw' ? '盤中 · 約延遲 20 秒' : '盤中'
  }
  return item.quote.date ? `收盤 · ${item.quote.date.slice(5).replace('-', '/')}` : '收盤'
}

function indicatorRows(item: MarketItem) {
  const ind = item.indicators
  if (!ind) {
    return []
  }
  return [
    { label: 'MA5', value: num(ind.ma5) },
    { label: 'MA20', value: num(ind.ma20) },
    { label: 'MA60', value: num(ind.ma60) },
    { label: 'RSI(14)', value: num(ind.rsi14, 1) },
    { label: 'K / D', value: `${num(ind.k, 1)} / ${num(ind.d, 1)}` },
    { label: 'MACD 柱', value: signed(ind.macdHist), tone: ind.macdHist },
    { label: '近 5 日', value: signed(ind.change5d, '%'), tone: ind.change5d },
    { label: '近 20 日', value: signed(ind.change20d, '%'), tone: ind.change20d },
    { label: '近 60 日', value: signed(ind.change60d, '%'), tone: ind.change60d },
    { label: '20 日高 / 低', value: `${num(ind.high20)} / ${num(ind.low20)}` },
    { label: '60 日高 / 低', value: `${num(ind.high60)} / ${num(ind.low60)}` },
    { label: '量比', value: ind.volumeRatio === null ? '—' : `${num(ind.volumeRatio)} 倍` },
  ]
}
</script>

<template>
  <section class="space-y-4 border-2 border-white/10 bg-slate-950/45 p-4 sm:p-5" aria-label="行情與技術指標">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Market Data</p>
        <h2 class="mt-1.5 text-lg font-semibold text-stone-50 sm:text-xl">行情與技術指標</h2>
        <p v-if="snapshot" class="mt-1 text-xs text-stone-400">
          {{ isSaved ? '當時查詢於' : '查詢時間' }} {{ asOfText }}
        </p>
      </div>
      <button
        class="cursor-pointer border-2 border-white/15 bg-white/5 px-3 py-1 text-[12px] text-stone-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        type="button"
        :disabled="status === 'loading' || cooldown.active.value"
        @click="refresh"
      >
        {{ status === 'loading' ? '查詢中…' : (isSaved ? '查詢最新報價' : '更新報價') + (cooldown.active.value ? `（${cooldown.remaining.value}）` : '') }}
      </button>
    </div>

    <div v-if="status === 'loading' && !snapshot" class="space-y-3" aria-live="polite">
      <SkeletonBlock class="h-5 w-40" />
      <SkeletonBlock class="h-8 w-56" />
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SkeletonBlock v-for="n in 8" :key="n" class="h-4 w-full" />
      </div>
    </div>

    <p v-if="status === 'error'" class="border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
      {{ error || '行情暫時查不到，請稍後再試。' }}
    </p>

    <template v-if="snapshot">
      <p v-if="snapshot.items.length === 0" class="text-sm text-stone-300/80">這次沒有查到報價。</p>

      <article
        v-for="item in snapshot.items"
        :key="item.symbol || item.code || item.name"
        class="space-y-4 border-2 border-white/10 bg-white/5 p-3 sm:p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-base font-semibold text-stone-50 sm:text-lg">
              {{ item.name }}
              <span v-if="idOf(item)" class="ml-1 text-xs font-normal text-stone-400">{{ idOf(item) }}</span>
            </h3>
            <p class="mt-0.5 text-xs text-stone-400">{{ sessionLabel(item) }} · {{ item.currency }}</p>
          </div>
          <div class="text-right">
            <p class="text-2xl font-semibold tabular-nums text-stone-50">{{ num(item.quote.price) }}</p>
            <p class="text-sm tabular-nums" :class="trendClass(item.quote.change)">
              {{ signed(item.quote.change) }}（{{ signed(item.quote.changePct, '%') }}）
            </p>
          </div>
        </div>

        <p class="text-xs tabular-nums text-stone-400">
          開 {{ num(item.quote.open) }} · 高 {{ num(item.quote.high) }} · 低 {{ num(item.quote.low) }} · 昨收
          {{ num(item.quote.prevClose) }}
        </p>

        <!-- 價格走勢（最近約半年） -->
        <MarketPriceChart v-if="item.chart" :chart="item.chart" :analysis="item.analysis" />

        <!-- 判讀標籤 -->
        <div v-if="item.analysis?.signals.length" class="flex flex-wrap gap-2">
          <span
            v-for="signal in item.analysis.signals"
            :key="signal.key"
            class="border-2 px-2.5 py-1 text-xs"
            :class="TONE_STYLES[signal.tone]"
          >
            <span class="opacity-70">{{ signal.label }}</span>
            <span class="ml-1.5 font-medium">{{ signal.value }}</span>
          </span>
        </div>

        <!-- 支撐與壓力 -->
        <div v-if="item.analysis" class="grid gap-3 sm:grid-cols-2">
          <div class="border-2 border-rose-300/15 bg-rose-300/5 p-3">
            <p class="text-xs font-medium text-rose-200/80">上方壓力</p>
            <ul v-if="item.analysis.resistances.length" class="mt-2 space-y-1 text-sm">
              <li v-for="level in item.analysis.resistances" :key="level.price" class="flex justify-between gap-3">
                <span class="tabular-nums text-stone-100">{{ num(level.price) }}</span>
                <span class="text-right text-xs text-stone-400">{{ level.label }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-xs text-stone-400">現價在近 60 日的參考價位之上</p>
          </div>
          <div class="border-2 border-emerald-300/15 bg-emerald-300/5 p-3">
            <p class="text-xs font-medium text-emerald-200/80">下方支撐</p>
            <ul v-if="item.analysis.supports.length" class="mt-2 space-y-1 text-sm">
              <li v-for="level in item.analysis.supports" :key="level.price" class="flex justify-between gap-3">
                <span class="tabular-nums text-stone-100">{{ num(level.price) }}</span>
                <span class="text-right text-xs text-stone-400">{{ level.label }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-xs text-stone-400">現價在近 60 日的參考價位之下</p>
          </div>
        </div>

        <dl v-if="item.indicators" class="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 text-xs sm:grid-cols-3">
          <div v-for="row in indicatorRows(item)" :key="row.label" class="flex justify-between gap-2">
            <dt class="text-stone-400">{{ row.label }}</dt>
            <dd class="tabular-nums" :class="row.tone === undefined ? 'text-stone-200' : trendClass(row.tone)">{{ row.value }}</dd>
          </div>
        </dl>
        <p v-else class="border-t border-white/10 pt-3 text-xs text-stone-400">歷史資料不足，沒有技術指標。</p>

        <!-- 籌碼面與估值（台股） -->
        <div v-if="item.chips || item.valuation" class="border-t border-white/10 pt-4">
          <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Chips &amp; Valuation</p>
          <h3 class="mt-1 text-base font-semibold text-stone-50">籌碼與估值</h3>
          <MarketChips class="mt-4" :chips="item.chips" :valuation="item.valuation" />
        </div>

        <!-- 歷史回測、策略比較、機器學習 -->
        <div v-if="item.research" class="border-t border-white/10 pt-4">
          <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Backtest &amp; Model</p>
          <h3 class="mt-1 text-base font-semibold text-stone-50">歷史回測與模型</h3>
          <MarketResearch class="mt-4" :research="item.research" />
        </div>
        <p v-else-if="item.indicators" class="text-xs text-stone-400">歷史資料不足一年，沒有回測與模型預測。</p>

        <!-- 操作建議：整理上面全部資料的結論，放在最後 -->
        <div v-if="item.advice" class="border-t-2 border-amber-200/20 pt-4">
          <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Trading Plan</p>
          <h3 class="mt-1 text-base font-semibold text-stone-50">操作建議</h3>
          <MarketAdvice class="mt-4" :advice="item.advice" :item="item" />
        </div>
      </article>

      <ul v-if="snapshot.notes.length > 0" class="space-y-1 text-xs leading-5 text-amber-100/80">
        <li v-for="note in snapshot.notes" :key="note">{{ note }}</li>
      </ul>
    </template>

    <p class="text-[11px] leading-5 text-stone-500">
      資料來源：證交所即時報價、Yahoo Finance。技術指標以日 K 計算，盤中的數字收盤前還會變動。
    </p>
  </section>
</template>
