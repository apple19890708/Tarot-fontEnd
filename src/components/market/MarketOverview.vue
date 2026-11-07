<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'

import { fetchMarketOverview } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { useCooldown } from '../../lib/useCooldown'
import HelpTip from '../HelpTip.vue'
import RefreshButton from '../RefreshButton.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketChips from './MarketChips.vue'
import MarketQuoteDialog from './MarketQuoteDialog.vue'
import MarketSparkline from './MarketSparkline.vue'
import type { MarketBreadth, MarketFuturesQuote, MarketIndexCard, MarketOverview } from '../../types'

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
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

// 熱力圖：漲紅跌綠，幅度越大顏色越深
function heatClass(pct: number) {
  if (pct >= 3) return 'bg-up-hue-3/55 text-up-pale'
  if (pct >= 1.5) return 'bg-up-hue-3/35 text-up-pale'
  if (pct > 0) return 'bg-up-hue-2/15 text-up-ink'
  if (pct === 0) return 'bg-tint/5 text-ink-muted'
  if (pct > -1.5) return 'bg-down-hue-2/15 text-down-ink'
  if (pct > -3) return 'bg-down-hue-3/35 text-down-pale'
  return 'bg-down-hue-3/55 text-down-pale'
}

const BREADTH_LABELS = { tse: '上市', otc: '上櫃' } as const
function breadthParts(b: MarketBreadth) {
  const total = b.up + b.down + b.flat || 1
  return [
    { key: 'up', label: '上漲', count: b.up, pct: (b.up / total) * 100, bar: 'bg-up-hue-2/70', text: 'text-up' },
    { key: 'flat', label: '平盤', count: b.flat, pct: (b.flat / total) * 100, bar: 'bg-ink-muted/50', text: 'text-ink-muted' },
    { key: 'down', label: '下跌', count: b.down, pct: (b.down / total) * 100, bar: 'bg-down-hue-2/70', text: 'text-down' },
  ]
}

const sectorDate = computed(() => overview.value?.sectors[0]?.date ?? null)
const priceDigits = (card: MarketIndexCard) => (card.symbol === 'TWD=X' ? 3 : 2)

// ---- 最上方的重點卡：加權指數、櫃買指數、台指期夜盤、那斯達克、費城半導體、美元兌台幣 ----
// 下面各區塊照樣完整顯示，這裡只是把最常看的幾個拉到最上面；某一個抓不到就少一張
type Highlight = {
  key: string
  name: string
  price: number | null
  digits: number
  change: number | null
  changePct: number | null
  // 卡片下方的小字：盤中／收盤日期、夜盤的合約與時間
  note: string
  // 點開走勢彈窗用：指數與匯率給 symbol（櫃買指數是後端給的 chartSymbol）；台指期夜盤給 futures（期交所分鐘走勢）；
  // 兩個都沒有（舊版後端的櫃買指數）就不能點
  symbol: string | null
  futures: MarketFuturesQuote | null
}

// 點了哪一張重點卡（開走勢彈窗）
const opened = ref<Highlight | null>(null)

const shortDay = (date: string | null) => (date ? date.slice(5).replace('-', '/') : '')

const highlights = computed<Highlight[]>(() => {
  const o = overview.value
  if (!o) return []
  const fromCard = (card: MarketIndexCard | undefined, name: string): Highlight | null =>
    card
      ? {
          key: card.symbol ?? name,
          name,
          price: card.price,
          digits: priceDigits(card),
          change: card.change,
          changePct: card.changePct,
          note: card.session === 'intraday' ? '盤中' : `收盤 ${shortDay(card.date)}`,
          symbol: card.symbol ?? card.chartSymbol ?? null,
          futures: null,
        }
      : null
  const night = o.futures?.night
  const list = [
    fromCard(o.tw.find((card) => card.symbol === '^TWII') ?? o.tw[0], '加權指數'),
    fromCard(o.tw.find((card) => card.name === '櫃買指數'), '櫃買指數'),
    night
      ? {
          key: 'txf-night',
          name: '台指期夜盤',
          price: night.price,
          digits: 0,
          change: night.change,
          changePct: night.changePct,
          note: [night.contract, night.date && `${shortDay(night.date)} ${night.time?.slice(0, 5) ?? ''}`].filter(Boolean).join('・'),
          symbol: null,
          futures: night,
        }
      : null,
    fromCard(o.us.find((card) => card.symbol === '^IXIC'), '那斯達克'),
    fromCard(o.us.find((card) => card.symbol === '^SOX'), '費城半導體'),
    fromCard(o.us.find((card) => card.symbol === 'TWD=X'), '美元兌台幣'),
  ]
  return list.filter((item): item is Highlight => item !== null)
})

const canOpen = (item: Highlight) => !!(item.symbol || item.futures)

// ---- 美國總經數據：通膨看年增率（和上個月的年增率比，升溫或降溫），非農看新增人數 ----
const monthText = (month: string) => `${Number(month.slice(5, 7))} 月`
// 千人 → 萬人：165 → +16.5 萬人
const jobsText = (thousands: number) => `${thousands > 0 ? '+' : ''}${formatNumber(thousands / 10, 1)} 萬人`

// 通膨升溫不是「漲」的好事，不用紅綠（紅綠在這裡代表股價漲跌），用琥珀＝升溫、天藍＝降溫
function inflationTrend(yoy: number, prevYoy: number) {
  if (yoy > prevYoy) return { label: '升溫', class: 'text-warn' }
  if (yoy < prevYoy) return { label: '降溫', class: 'text-info' }
  return { label: '持平', class: 'text-ink-muted' }
}

// 美股區塊分組；舊版後端沒有 group 時全部放在第一組
const US_GROUPS: { key: NonNullable<MarketIndexCard['group']>; title: string }[] = [
  { key: 'index', title: '美股主要指數' },
  { key: 'tw', title: '和台股最相關' },
  { key: 'mood', title: '市場情緒、利率與美元' },
]
const usGroups = computed(() =>
  US_GROUPS.map((group, index) => ({
    ...group,
    cards: (overview.value?.us ?? []).filter((card) => (card.group ?? 'index') === group.key || (index === 0 && !card.group)),
  })).filter((group) => group.cards.length),
)

function timeText(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
</script>

<template>
  <section class="space-y-5 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Market Overview</p>
        <h2 class="mt-1 text-title font-semibold text-ink">大盤概況</h2>
        <p class="mt-1 text-body text-ink-muted">
          主要指數有盤中報價；漲跌家數、類股與三大法人是最新一個交易日的收盤資料（證交所、櫃買中心公開資料）。
        </p>
      </div>
      <RefreshButton label="更新" :loading="status === 'loading' || refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <!-- 載入中：重點卡、指數卡、漲跌家數、熱力圖、法人、美股 -->
    <div v-if="status === 'loading'" class="space-y-5">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SkeletonBlock v-for="n in 6" :key="n" class="h-[6.5rem] w-full rounded-none" />
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SkeletonBlock v-for="n in 5" :key="n" class="h-[6.5rem] w-full rounded-none" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock v-for="n in 2" :key="n" class="h-14 w-full rounded-none" />
      </div>
      <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <SkeletonBlock v-for="n in 18" :key="n" class="h-12 w-full rounded-none" />
      </div>
      <SkeletonBlock class="h-48 w-full rounded-none" />
      <!-- 美股三組（4／3／3 張卡片），每組一行標題 -->
      <div v-for="(count, g) in [4, 3, 3]" :key="g" class="space-y-2">
        <SkeletonBlock class="h-5 w-32 rounded-none" />
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonBlock v-for="n in count" :key="n" class="h-36 w-full rounded-none" />
        </div>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
      <span>{{ error }}</span>
      <RefreshButton label="重試" loading-label="重試中…" tone="danger" :loading="refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <template v-else-if="overview">
      <p class="text-caption text-ink-muted">
        更新於 {{ timeText(overview.asOf) }}<template v-if="error">｜{{ error }}</template>
      </p>

      <!-- ── 重點卡：最常看的六個，數字放大（6 張在手機 2×3、平板 3×2、桌機一排都剛好排滿） ── -->
      <div v-if="highlights.length" class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <!-- 點了開走勢彈窗（線圖、開高低、52 週高低）；沒有走勢資料的只顯示數字、不能點 -->
        <component
          :is="canOpen(item) ? 'button' : 'div'"
          v-for="item in highlights"
          :key="item.key"
          :type="canOpen(item) ? 'button' : undefined"
          class="min-w-0 border-2 border-accent-hue/25 bg-accent-hue/[0.06] p-3 text-left"
          :class="canOpen(item) && 'cursor-pointer transition hover:border-accent-hue/50 hover:bg-accent-hue/10 active:translate-x-[2px] active:translate-y-[2px]'"
          :aria-label="canOpen(item) ? `${item.name} 走勢` : undefined"
          @click="canOpen(item) && (opened = item)"
        >
          <p class="flex items-center justify-between gap-2 text-body text-accent">
            <span class="truncate">{{ item.name }}</span>
            <span v-if="canOpen(item)" class="shrink-0 text-caption text-warn" aria-hidden="true">走勢 ›</span>
          </p>
          <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">{{ formatNumber(item.price, item.digits) }}</p>
          <p class="text-body tabular-nums" :class="trendClass(item.change)">
            {{ formatSigned(item.change) }}（{{ formatSigned(item.changePct, '%') }}）
          </p>
          <p class="truncate text-caption text-ink-muted">{{ item.note }}</p>
        </component>
      </div>
      <MarketQuoteDialog
        v-if="opened"
        :name="opened.name"
        :symbol="opened.symbol"
        :futures="opened.futures"
        :digits="opened.digits"
        @close="opened = null"
      />

      <!-- ── 美國總經數據（每月公布一次） ── -->
      <div v-if="overview.macro?.length" class="space-y-1.5">
        <p class="text-body text-ink-muted">美國經濟數據</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <div v-for="item in overview.macro" :key="item.key" class="min-w-0 border-2 border-info-hue/20 bg-info-hue/[0.04] p-3">
            <p class="flex items-center gap-1.5 text-body text-info-ink">
              <span class="truncate">{{ item.name }}</span>
              <HelpTip :term="item.key" />
            </p>
            <template v-if="item.kind === 'inflation'">
              <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">{{ formatNumber(item.yoy, 1) }}%</p>
              <p class="text-body tabular-nums">
                <span :class="inflationTrend(item.yoy, item.prevYoy).class">{{ inflationTrend(item.yoy, item.prevYoy).label }}</span>
                <span class="text-ink-muted">（上月 {{ formatNumber(item.prevYoy, 1) }}%）</span>
              </p>
              <p class="truncate text-caption text-ink-muted">{{ monthText(item.month) }}年增率・月增 {{ formatNumber(item.mom, 1) }}%</p>
            </template>
            <template v-else>
              <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">{{ jobsText(item.change) }}</p>
              <p class="text-body tabular-nums text-ink-muted">上月 {{ jobsText(item.prevChange) }}</p>
              <p class="truncate text-caption text-ink-muted">{{ monthText(item.month) }}新增就業</p>
            </template>
          </div>
        </div>
        <p class="text-caption text-ink-muted">資料來自聖路易聯準銀行 FRED（美國官方公布值）；免費來源沒有市場預期值，只和上個月比。</p>
      </div>

      <!-- ── 漲跌家數 ── -->
      <div v-if="overview.breadth" class="grid gap-3 sm:grid-cols-2">
        <div v-for="exchange in (['tse', 'otc'] as const)" :key="exchange" class="space-y-1.5 border-2 border-tint/10 bg-tint/[0.03] p-3 text-body">
          <p class="flex justify-between text-ink-muted">
            <span>{{ BREADTH_LABELS[exchange] }}漲跌家數</span>
            <span v-if="overview.breadth[exchange]?.date" class="text-ink-muted">{{ overview.breadth[exchange]!.date }}</span>
          </p>
          <template v-if="overview.breadth[exchange]">
            <div class="flex h-2.5 w-full overflow-hidden bg-tint/5" role="img" :aria-label="`${BREADTH_LABELS[exchange]}上漲 ${overview.breadth[exchange]!.up} 家、下跌 ${overview.breadth[exchange]!.down} 家`">
              <div v-for="part in breadthParts(overview.breadth[exchange]!)" :key="part.key" :class="part.bar" :style="{ width: `${part.pct}%` }" />
            </div>
            <p class="flex flex-wrap gap-x-4 tabular-nums">
              <span v-for="part in breadthParts(overview.breadth[exchange]!)" :key="part.key" :class="part.text">{{ part.label }} {{ part.count }}</span>
            </p>
          </template>
          <p v-else class="text-ink-muted">暫時取不到。</p>
        </div>
      </div>

      <!-- ── 類股熱力圖 ── -->
      <div v-if="overview.sectors.length" class="space-y-2">
        <p class="text-body text-ink-muted">
          類股漲跌<span v-if="sectorDate" class="ml-1 text-ink-muted">（{{ sectorDate }} 收盤）</span>
        </p>
        <ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
          <li
            v-for="sector in overview.sectors"
            :key="sector.name"
            class="flex min-h-12 flex-col justify-center px-2 py-1.5 text-center"
            :class="heatClass(sector.changePct)"
            :title="`${sector.name} ${formatNumber(sector.close)}`"
          >
            <span class="truncate text-caption">{{ sector.name }}</span>
            <span class="text-body font-semibold tabular-nums">{{ formatSigned(sector.changePct, '%') }}</span>
          </li>
        </ul>
      </div>

      <!-- ── 三大法人（沿用股市諮詢的籌碼元件）── -->
      <MarketChips v-if="overview.institutional" :chips="overview.institutional" />

      <!-- ── 美股、匯率與市場情緒：分組，每張卡片有白話說明、小走勢圖、近 5／20 日漲跌 ── -->
      <div v-if="overview.us.length" class="space-y-4">
        <div v-for="group in usGroups" :key="group.key" class="space-y-2">
          <p class="text-subtitle font-semibold text-ink">{{ group.title }}</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="card in group.cards" :key="card.name" class="flex flex-col gap-1.5 border-2 border-tint/10 bg-tint/[0.03] p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="flex items-center gap-2 text-body text-ink">
                    {{ card.name }}
                    <span v-if="card.session === 'intraday'" class="border border-up-hue/30 px-1.5 text-caption text-up-ink">盤中</span>
                  </p>
                  <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">
                    {{ formatNumber(card.price, priceDigits(card)) }}<span v-if="card.unit" class="ml-0.5 text-body">{{ card.unit }}</span>
                  </p>
                  <p class="text-body tabular-nums" :class="trendClass(card.change)">
                    {{ formatSigned(card.change, card.unit ?? '') }}（{{ formatSigned(card.changePct, '%') }}）
                  </p>
                </div>
                <div v-if="card.spark.length > 1" class="w-24 shrink-0 sm:w-28">
                  <MarketSparkline :values="card.spark" />
                </div>
              </div>
              <p v-if="card.changes" class="flex gap-3 text-caption tabular-nums text-ink-muted">
                <span>近 5 日 <span :class="trendClass(card.changes.d5)">{{ formatSigned(card.changes.d5, '%') }}</span></span>
                <span>近 20 日 <span :class="trendClass(card.changes.d20)">{{ formatSigned(card.changes.d20, '%') }}</span></span>
              </p>
              <p v-if="card.note" class="text-caption text-ink-muted">{{ card.note }}</p>
            </div>
          </div>
        </div>
        <p class="text-caption text-ink-muted">美股與匯率報價來自 Yahoo，可能延遲約 15 分鐘；小走勢圖是最近約 60 個交易日。</p>
      </div>

      <p v-for="note in overview.notes" :key="note" class="text-body text-ink-muted">{{ note }}</p>
    </template>
  </section>
</template>
