<script setup lang="ts">
import { computed, ref } from 'vue'
import HelpTip from './HelpTip.vue'
import { signalGlossaryKeys } from '../lib/marketGlossary'

import MarketAdvice from './market/MarketAdvice.vue'
import MarketChips from './market/MarketChips.vue'
import MarketPriceChart from './market/MarketPriceChart.vue'
import MarketResearch from './market/MarketResearch.vue'
import { useCooldown } from '../lib/useCooldown'
import RefreshButton from './RefreshButton.vue'
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
  // 不顯示「更新報價」（例如「我的紀錄」的股票分析只看當時的資料）
  hideRefresh?: boolean
  // 操作建議、籌碼與估值、歷史回測與模型改成分頁籤（個股分析彈窗用；結果頁與紀錄維持一段接一段）
  tabs?: boolean
}>()

const emit = defineEmits<{ refresh: [] }>()

// 「更新報價」按完 30 秒內不能再按（載入狀態由父元件控制，這裡只管冷卻）
const cooldown = useCooldown(30, 'market-panel-refresh')
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
function ohlcCells(item: MarketItem) {
  const { open, high, low, prevClose } = item.quote
  return [
    { label: '開盤', value: open, cls: vsPrevClass(open, prevClose) },
    { label: '最高', value: high, cls: vsPrevClass(high, prevClose) },
    { label: '最低', value: low, cls: vsPrevClass(low, prevClose) },
    { label: '昨收', value: prevClose, cls: 'text-ink' },
  ]
}

// 價格和昨收比的顏色（開、高、低用）
function vsPrevClass(value: number | null | undefined, prevClose: number | null | undefined) {
  if (value === null || value === undefined || prevClose === null || prevClose === undefined || value === prevClose) return 'text-ink'
  return value > prevClose ? 'text-up' : 'text-down'
}

function trendClass(value: number | null | undefined) {
  if (!value) {
    return 'text-ink-muted'
  }
  return value > 0 ? 'text-up' : 'text-down'
}

const TONE_STYLES: Record<MarketSignal['tone'], string> = {
  bull: 'border-up-hue/30 bg-up-hue/10 text-up-ink',
  bear: 'border-down-hue/30 bg-down-hue/10 text-down-ink',
  warn: 'border-accent-hue/30 bg-accent-hue/10 text-accent',
  neutral: 'border-tint/15 bg-tint/5 text-ink-soft',
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

// ---- 分頁籤（tabs 模式）：操作建議放第一個，沒有資料的分頁不顯示 ----
type PanelTab = 'advice' | 'chips' | 'research'

const itemKey = (item: MarketItem) => item.symbol || item.code || item.name
// 每一檔各自記住選到哪一頁
const chosenTab = ref<Record<string, PanelTab>>({})

function tabsOf(item: MarketItem) {
  const list: { key: PanelTab; label: string }[] = []
  if (item.advice) list.push({ key: 'advice', label: '操作建議' })
  if (item.chips || item.valuation) list.push({ key: 'chips', label: '籌碼與估值' })
  if (item.research) list.push({ key: 'research', label: '歷史回測與模型' })
  return list
}

function currentTab(item: MarketItem) {
  const list = tabsOf(item)
  const chosen = chosenTab.value[itemKey(item)]
  return list.some((tab) => tab.key === chosen) ? chosen : list[0]?.key
}

function selectTab(item: MarketItem, key: PanelTab) {
  chosenTab.value = { ...chosenTab.value, [itemKey(item)]: key }
}

// 左右方向鍵切換分頁（和股市追蹤頁的分頁籤一樣）
function onTabKeydown(event: KeyboardEvent, item: MarketItem, index: number) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const list = tabsOf(item)
  const next = list[(index + (event.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length]
  if (!next) return
  selectTab(item, next.key)
  const tablist = (event.currentTarget as HTMLElement).parentElement
  tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[list.indexOf(next)]?.focus()
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
  <section class="space-y-4 border-2 border-tint/10 bg-sink/45 p-4 sm:p-5" aria-label="行情與技術指標" data-panel-section="行情與技術指標">
    <!-- data-panel-section：彈窗與紀錄頁「跳到段落」的目標（StockAnalysisDialog、StockAnalysisHistory）。註解放在裡面，根元素才只有一個 -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Market Data</p>
        <h2 class="mt-1.5 text-title font-semibold text-ink">行情與技術指標</h2>
        <p v-if="snapshot" class="mt-1 text-caption text-ink-muted">
          {{ isSaved ? '當時查詢於' : '查詢時間' }} {{ asOfText }}
        </p>
      </div>
      <RefreshButton
        v-if="!hideRefresh"
        :label="isSaved ? '查詢最新報價' : '更新報價'"
        loading-label="查詢中…"
        :loading="status === 'loading'"
        :failed="status === 'error'"
        :cooldown="cooldown"
        @click="refresh"
      />
    </div>

    <div v-if="status === 'loading' && !snapshot" class="space-y-3" aria-live="polite">
      <SkeletonBlock class="h-5 w-40" />
      <SkeletonBlock class="h-8 w-56" />
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SkeletonBlock v-for="n in 8" :key="n" class="h-4 w-full" />
      </div>
    </div>

    <p v-if="status === 'error'" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
      {{ error || '行情暫時查不到，請稍後再試。' }}
    </p>

    <template v-if="snapshot">
      <p v-if="snapshot.items.length === 0" class="text-body text-ink-muted">這次沒有查到報價。</p>

      <article
        v-for="item in snapshot.items"
        :key="item.symbol || item.code || item.name"
        class="space-y-4 border-2 border-tint/10 bg-tint/5 p-3 sm:p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h3 class="truncate text-subtitle font-semibold text-ink">
              {{ item.name }}
              <span v-if="idOf(item)" class="ml-1 text-caption font-normal text-ink-muted">{{ idOf(item) }}</span>
            </h3>
            <p class="mt-0.5 text-caption text-ink-muted">{{ sessionLabel(item) }} · {{ item.currency }}</p>
          </div>
          <div class="text-right">
            <p class="text-display font-semibold tabular-nums text-ink">{{ num(item.quote.price) }}</p>
            <p class="text-body tabular-nums" :class="trendClass(item.quote.change)">
              {{ signed(item.quote.change) }}（{{ signed(item.quote.changePct, '%') }}）
            </p>
          </div>
        </div>

        <!-- 開高低和昨收：四格，數字和昨收比，高紅、低綠、一樣白（台灣看盤習慣）；昨收是基準，用白色 -->
        <dl class="grid grid-cols-2 gap-2 tabular-nums sm:grid-cols-4">
          <div v-for="cell in ohlcCells(item)" :key="cell.label" class="border border-tint/10 bg-tint/[0.03] px-2 py-1.5">
            <dt class="text-caption text-ink-muted">{{ cell.label }}</dt>
            <dd class="text-subtitle font-semibold" :class="cell.cls">{{ num(cell.value) }}</dd>
          </div>
        </dl>


        <!-- 價格走勢（最近約半年） -->
        <MarketPriceChart v-if="item.chart" :chart="item.chart" :analysis="item.analysis" />

        <!-- 判讀標籤 -->
        <div v-if="item.analysis?.signals.length" class="flex flex-wrap gap-2">
          <span
            v-for="signal in item.analysis.signals"
            :key="signal.key"
            class="border-2 px-2.5 py-1 text-body"
            :class="TONE_STYLES[signal.tone]"
          >
            <span class="opacity-70">{{ signal.label }}</span>
            <span class="ml-1.5 font-medium">{{ signal.value }}</span>
          </span>
          <!-- 這排標籤的名詞說明 -->
          <HelpTip class="self-center" :terms="signalGlossaryKeys(item.analysis.signals)" />
        </div>

        <!-- 支撐與壓力 -->
        <div v-if="item.analysis" class="grid gap-3 sm:grid-cols-2">
          <div class="border-2 border-up-hue/15 bg-up-hue/5 p-3">
            <p class="flex items-center gap-1.5 text-body font-medium text-danger">上方壓力 <HelpTip term="supportResistance" /></p>
            <ul v-if="item.analysis.resistances.length" class="mt-2 space-y-1 text-body">
              <li v-for="level in item.analysis.resistances" :key="level.price" class="flex justify-between gap-3">
                <span class="tabular-nums text-ink">{{ num(level.price) }}</span>
                <span class="text-right text-caption text-ink-muted">{{ level.label }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-body text-ink-muted">現價在近 60 日的參考價位之上</p>
          </div>
          <div class="border-2 border-down-hue/15 bg-down-hue/5 p-3">
            <p class="flex items-center gap-1.5 text-body font-medium text-down-ink">下方支撐 <HelpTip term="supportResistance" /></p>
            <ul v-if="item.analysis.supports.length" class="mt-2 space-y-1 text-body">
              <li v-for="level in item.analysis.supports" :key="level.price" class="flex justify-between gap-3">
                <span class="tabular-nums text-ink">{{ num(level.price) }}</span>
                <span class="text-right text-caption text-ink-muted">{{ level.label }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-body text-ink-muted">現價在近 60 日的參考價位之下</p>
          </div>
        </div>

        <dl v-if="item.indicators" class="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-tint/10 pt-3 text-body sm:grid-cols-3">
          <div v-for="row in indicatorRows(item)" :key="row.label" class="flex justify-between gap-2">
            <dt class="text-ink-muted">{{ row.label }}</dt>
            <dd class="tabular-nums" :class="row.tone === undefined ? 'text-ink-soft' : trendClass(row.tone)">{{ row.value }}</dd>
          </div>
        </dl>
        <p v-else class="border-t border-tint/10 pt-3 text-body text-ink-muted">歷史資料不足，沒有技術指標。</p>

        <!-- 分頁籤模式：操作建議、籌碼與估值、歷史回測與模型 -->
        <div v-if="tabs && tabsOf(item).length" class="border-t-2 border-accent-hue/20 pt-4" data-panel-section="操作建議・籌碼・回測">
          <!-- overflow-y-hidden：分頁往下凸 2px 蓋住底線，不加的話會冒出上下捲軸 -->
          <div role="tablist" aria-label="分析分頁" class="flex overflow-x-auto overflow-y-hidden border-b-2 border-tint/10">
            <button
              v-for="(tab, index) in tabsOf(item)"
              :id="`panel-tab-${itemKey(item)}-${tab.key}`"
              :key="tab.key"
              type="button"
              role="tab"
              :aria-selected="currentTab(item) === tab.key"
              :aria-controls="`panel-tabpanel-${itemKey(item)}`"
              :tabindex="currentTab(item) === tab.key ? 0 : -1"
              class="-mb-[2px] shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-4 py-2.5 text-button transition font-pixel sm:px-5"
              :class="
                currentTab(item) === tab.key
                  ? 'border-accent-hue bg-selected text-on-selected'
                  : 'border-transparent text-ink-muted hover:bg-tint/5 hover:text-ink'
              "
              @click="selectTab(item, tab.key)"
              @keydown="onTabKeydown($event, item, index)"
            >
              {{ tab.label }}
            </button>
          </div>
          <div
            :id="`panel-tabpanel-${itemKey(item)}`"
            role="tabpanel"
            :aria-labelledby="`panel-tab-${itemKey(item)}-${currentTab(item)}`"
            class="pt-4"
          >
            <MarketAdvice v-if="currentTab(item) === 'advice' && item.advice" :advice="item.advice" :item="item" />
            <MarketChips v-else-if="currentTab(item) === 'chips'" :chips="item.chips" :valuation="item.valuation" />
            <MarketResearch v-else-if="currentTab(item) === 'research' && item.research" :research="item.research" />
          </div>
        </div>
        <p v-if="tabs && !item.research && item.indicators" class="text-body text-ink-muted">歷史資料不足一年，沒有回測與模型預測。</p>

        <template v-if="!tabs">
          <!-- 籌碼面與估值（台股） -->
          <div v-if="item.chips || item.valuation" class="border-t border-tint/10 pt-4" data-panel-section="籌碼與估值">
            <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Chips &amp; Valuation</p>
            <h3 class="mt-1 text-subtitle font-semibold text-ink">籌碼與估值</h3>
            <MarketChips class="mt-4" :chips="item.chips" :valuation="item.valuation" />
          </div>

          <!-- 歷史回測、策略比較、機器學習 -->
          <div v-if="item.research" class="border-t border-tint/10 pt-4" data-panel-section="歷史回測與模型">
            <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Backtest &amp; Model</p>
            <h3 class="mt-1 text-subtitle font-semibold text-ink">歷史回測與模型</h3>
            <MarketResearch class="mt-4" :research="item.research" />
          </div>
          <p v-else-if="item.indicators" class="text-body text-ink-muted">歷史資料不足一年，沒有回測與模型預測。</p>

          <!-- 操作建議：整理上面全部資料的結論，放在最後 -->
          <div v-if="item.advice" class="border-t-2 border-accent-hue/20 pt-4" data-panel-section="操作建議">
            <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Trading Plan</p>
            <h3 class="mt-1 text-subtitle font-semibold text-ink">操作建議</h3>
            <MarketAdvice class="mt-4" :advice="item.advice" :item="item" />
          </div>
        </template>
      </article>

      <ul v-if="snapshot.notes.length > 0" class="space-y-1 text-body text-accent">
        <li v-for="note in snapshot.notes" :key="note">{{ note }}</li>
      </ul>
    </template>

    <p class="text-caption text-ink-muted">
      資料來源：證交所即時報價、Yahoo Finance。技術指標以日 K 計算，盤中的數字收盤前還會變動。
    </p>
  </section>
</template>
