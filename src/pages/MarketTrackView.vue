<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BackToTop from '../components/BackToTop.vue'
import { asyncPanel } from '../lib/asyncPanel'
import { marketAlerts } from '../lib/marketAlerts'
import type { MarketAlertTarget } from '../types'

// 2026-11-26 前端優化 7：分頁改成需要時才載入。
// 八個分頁原本全部打包在同一塊，一進頁面就得下載全部（含 chart.js）；改成切到哪個分頁才載入那個分頁的程式。
// 載入中先顯示骨架；載入後由下面的 KeepAlive 保留，切回來不會重新載入
const MarketAlertsPanel = asyncPanel(() => import('../components/market/MarketAlertsPanel.vue'))
const MarketFinanceNews = asyncPanel(() => import('../components/market/MarketFinanceNews.vue'))
const MarketHitRate = asyncPanel(() => import('../components/market/MarketHitRate.vue'))
const MarketIncome = asyncPanel(() => import('../components/market/MarketIncome.vue'))
const MarketSimulator = asyncPanel(() => import('../components/market/MarketSimulator.vue'))
const MarketOverview = asyncPanel(() => import('../components/market/MarketOverview.vue'))
const MarketScreener = asyncPanel(() => import('../components/market/MarketScreener.vue'))
const MarketWatchlist = asyncPanel(() => import('../components/market/MarketWatchlist.vue'))

// 股市追蹤：自訂股票追蹤、股利獲利與預測（v20）、存股試算、股市總覽（原大盤概況）、財經新聞、選股、參考命中（建議自動對答案）、價位提醒等分頁。
// 限 admin 與開通金融股市的會員（路由 meta.stock）。目前的分頁放在網址 ?tab=，重新整理或分享時會停在同一頁
const TABS = [
  { key: 'overview', label: '股市總覽' },
  { key: 'news', label: '財經新聞' },
  { key: 'watch', label: '自訂股票追蹤' },
  { key: 'income', label: '股利獲利與預測' },
  { key: 'simulate', label: '存股試算' },
  { key: 'screen', label: '選股' },
  { key: 'hits', label: '參考命中' },
  { key: 'alerts', label: '價位提醒' },
] as const
type TabKey = (typeof TABS)[number]['key']

const route = useRoute()
const router = useRouter()

const activeTab = computed<TabKey>(() => {
  const tab = route.query.tab
  // 沒指定分頁時開第一個（股市總覽）
  return TABS.some((t) => t.key === tab) ? (tab as TabKey) : TABS[0].key
})

function selectTab(key: TabKey) {
  if (key !== activeTab.value) void router.replace({ query: { ...route.query, tab: key } })
  // 分頁列可以橫向捲動：選到被遮住的分頁時捲到看得見
  document.getElementById(`market-tab-${key}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

const activeCount = computed(() => marketAlerts.value.filter((alert) => alert.active).length)

// 自訂追蹤按「設價位提醒」：切到提醒分頁並帶入標的與目前價格（at 讓同一檔連按兩次也會重新帶入）
const alertPrefill = ref<{ target: MarketAlertTarget; price: number | null; at: number } | null>(null)
function openAlertFor(target: MarketAlertTarget, price: number | null) {
  alertPrefill.value = { target, price, at: Date.now() }
  selectTab('alerts')
}

// 方向鍵切換分頁（WAI-ARIA tabs）
function onTabKeydown(event: KeyboardEvent, index: number) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
  if (!next) return
  selectTab(next.key)
  document.getElementById(`market-tab-${next.key}`)?.focus()
}
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 flex-col gap-4 py-4">
    <header class="border-2 border-tint/10 bg-surface p-6">
      <p class="text-caption uppercase tracking-[0.35em] text-accent">Market Tracking</p>
      <h1 class="mt-2 text-display font-semibold text-ink">股市追蹤</h1>
      <p class="mt-1 text-body text-ink-muted">追蹤自己關注的股票與持股、看國內外財經新聞、檢查股市諮詢建議的命中率，並設定到價提醒。</p>
    </header>

    <!-- 分頁列：自己一條不透明底色；分頁變多、超出寬度時橫向捲動，不會擠成兩行 -->
    <div class="border-2 border-tint/10 bg-surface">
      <div
        role="tablist"
        aria-label="股市追蹤分頁"
        class="flex overflow-x-auto [scrollbar-color:color-mix(in_oklab,var(--c-tint)_20%,transparent)_transparent] [scrollbar-width:thin]"
      >
        <button
          v-for="(tab, index) in TABS"
          :id="`market-tab-${tab.key}`"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.key"
          :aria-controls="`market-panel-${tab.key}`"
          :tabindex="activeTab === tab.key ? 0 : -1"
          class="shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-5 py-3 text-button transition font-pixel"
          :class="
            activeTab === tab.key
              ? 'border-accent-hue bg-selected text-on-selected'
              : 'border-transparent text-ink-muted hover:bg-tint/5 hover:text-ink-soft'
          "
          @click="selectTab(tab.key)"
          @keydown="onTabKeydown($event, index)"
        >
          {{ tab.label }}
          <span v-if="tab.key === 'alerts' && activeCount" class="text-caption" :class="activeTab === tab.key ? 'text-on-selected' : 'text-warn'">（{{ activeCount }}）</span>
        </button>
      </div>
    </div>

    <!-- KeepAlive：切換分頁不重新載入，填到一半的表單也還在 -->
    <div :id="`market-panel-${activeTab}`" role="tabpanel" :aria-labelledby="`market-tab-${activeTab}`" class="min-w-0">
      <KeepAlive>
        <MarketWatchlist v-if="activeTab === 'watch'" @alert="openAlertFor" />
        <MarketOverview v-else-if="activeTab === 'overview'" />
        <MarketIncome v-else-if="activeTab === 'income'" />
        <MarketSimulator v-else-if="activeTab === 'simulate'" />
        <MarketFinanceNews v-else-if="activeTab === 'news'" />
        <MarketScreener v-else-if="activeTab === 'screen'" />
        <MarketHitRate v-else-if="activeTab === 'hits'" />
        <MarketAlertsPanel v-else :prefill="alertPrefill" />
      </KeepAlive>
    </div>

    <!-- 往下捲超過一個畫面高就出現 -->
    <BackToTop />
  </div>
</template>
