<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import ListPager from '../ListPager.vue'
import { formatNumber } from '../../lib/marketChart'
import { usePaged } from '../../lib/usePaged'

import DashboardStockCard from './DashboardStockCard.vue'
import DashboardStockTable from './DashboardStockTable.vue'
import StockAnalysisDialog from './StockAnalysisDialog.vue'
import type { MarketWatchItem } from '../../types'

// 股市總覽的「自選清單」區塊：一個自訂清單裡的股票，每檔一張卡片（和個股分析同樣的行情區＋日 K）。
// 挑哪個清單由父元件決定；點卡片開個股分析彈窗
// view：卡片或表格（父元件存進版面）
// selectable：點了不開個股分析，改發 select 給父元件（自訂股票追蹤頁用：開自己的詳細彈窗，持股、清單、刪除都在裡面）
// pageKey：分頁每頁筆數記在 localStorage 的 key（每個用到的地方各自記）；resetKey 變了就回第 1 頁（例如換清單、換市場）
const props = withDefaults(defineProps<{ items: MarketWatchItem[]; view?: 'card' | 'table'; selectable?: boolean; pageKey?: string; resetKey?: string }>(), {
  pageKey: 'watch-list',
  resetKey: '',
})
const emit = defineEmits<{ select: [item: MarketWatchItem] }>()

const analysisFor = ref<{ id: string; name: string } | null>(null)
function open(item: MarketWatchItem) {
  if (props.selectable) {
    emit('select', item)
    return
  }
  analysisFor.value = { id: item.id, name: item.summary?.name || item.target.name }
}

// 表格檢視的列：台股成交量換成張、美股是股
const volumeText = (item: MarketWatchItem) => {
  const volume = item.summary?.quote.volume
  if (volume === null || volume === undefined) return null
  return item.target.market === 'tw' ? `${formatNumber(Math.round(volume / 1000), 0)} 張` : `${formatNumber(volume, 0)} 股`
}
// 持股（還有持有數量才算）：台股數量是張（零股是小數）、美股是股；損益是未實現（已扣預估賣出成本）
function holdingOf(item: MarketWatchItem) {
  const position = item.position
  if (!position || position.quantity <= 0) return null
  const unit = item.target.market === 'tw' ? '張' : '股'
  return {
    avgCost: position.avgCost,
    quantity: `${formatNumber(position.quantity, item.target.market === 'tw' ? 3 : 4)} ${unit}`,
    pnl: position.unrealized,
    pnlPct: position.unrealizedPct,
  }
}
// 分頁（2026-11-11 使用者要求：自選清單、推薦股票、自訂股票追蹤都要分頁）；卡片和表格共用同一頁
const { items: pageItems, page, pageSize, total } = usePaged(computed(() => props.items), props.pageKey)
watch(
  () => props.resetKey,
  () => {
    page.value = 1
  },
)
const tableRows = computed(() =>
  pageItems.value.map((item) => ({
    key: item.id,
    name: item.summary?.name || item.target.name,
    code: (item.target.market === 'tw' && item.target.kind === 'stock' ? item.target.code : item.target.symbol || item.target.code) ?? '',
    price: item.summary?.quote.price ?? null,
    change: item.summary?.quote.change ?? null,
    changePct: item.summary?.quote.changePct ?? null,
    open: item.summary?.quote.open ?? null,
    high: item.summary?.quote.high ?? null,
    low: item.summary?.quote.low ?? null,
    volume: volumeText(item),
    holding: holdingOf(item),
  })),
)
function openById(id: string) {
  const item = props.items.find((it) => it.id === id)
  if (item) open(item)
}
</script>

<template>
  <div class="space-y-2">
    <!-- grid-cols-1：不寫的話窄螢幕的欄寬會被 K 線圖撐開，卡片右邊被切掉；寬螢幕每張至少 300px（約 350×350） -->
    <DashboardStockTable v-if="view === 'table'" :rows="tableRows" @open="openById" />
    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      <DashboardStockCard v-for="item in pageItems" :key="item.id" :item="item" @open="open(item)" />
    </div>
    <ListPager v-model:page="page" v-model:page-size="pageSize" :total="total" />
    <StockAnalysisDialog v-if="analysisFor" :watch-id="analysisFor.id" :name="analysisFor.name" @close="analysisFor = null" />
  </div>
</template>
