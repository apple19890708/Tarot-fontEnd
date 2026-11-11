<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { fetchDailyPicks } from '../../lib/api'
import { formatNumber } from '../../lib/marketChart'
import ListPager from '../ListPager.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import { usePaged } from '../../lib/usePaged'
import DashboardStockCard from './DashboardStockCard.vue'
import DashboardStockTable from './DashboardStockTable.vue'
import StockAnalysisDialog from './StockAnalysisDialog.vue'
import type { DailyPick, DailyPickType, DailyPicks } from '../../types'

// 股市總覽的「推薦／熱門股票」（當日推薦區塊，也是自選清單沒有清單時的替代）：後端用固定規則挑的，不是投資建議。
// 上面切推薦類型（父元件存進版面），下面每檔一張股票卡片（入選理由放在名稱底下），點了開個股分析（任何台股都能開）
// view：卡片或表格（父元件存進版面）
const props = defineProps<{ type?: DailyPickType; view?: 'card' | 'table' }>()
const emit = defineEmits<{ 'update:type': [type: DailyPickType] }>()

// 舊版後端沒有 types 時只有一種
const FALLBACK_TYPES: { type: DailyPickType; label: string }[] = [{ type: 'growth', label: '法人連買成長股' }]

const picks = ref<DailyPicks | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  status.value = 'loading'
  try {
    const result = (await fetchDailyPicks(props.type)).picks
    if (id !== requestId) return
    picks.value = result
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '推薦股票暫時讀不到。'
    status.value = 'error'
  }
}
onMounted(load)
watch(() => props.type, load)

const analysisFor = ref<DailyPick | null>(null)

// 分頁（2026-11-11 使用者要求）：卡片和表格共用同一頁；換推薦類型回第 1 頁
const { items: pageItems, page, pageSize, total } = usePaged(computed(() => picks.value?.items ?? []), 'dashboard-picks')
watch(
  () => picks.value?.type,
  () => {
    page.value = 1
  },
)
// 表格檢視的列（這一頁的）：成交量是張
const tableRows = computed(() =>
  pageItems.value.map((item) => ({
    key: item.code,
    name: item.name,
    code: item.code,
    price: item.close,
    change: item.change ?? null,
    changePct: item.changePct,
    open: item.open ?? null,
    high: item.high ?? null,
    low: item.low ?? null,
    volume: item.volume !== null && item.volume !== undefined ? `${formatNumber(item.volume, 0)} 張` : null,
  })),
)
function openByCode(code: string) {
  analysisFor.value = picks.value?.items.find((item) => item.code === code) ?? null
}
</script>

<template>
  <div class="space-y-3">
    <!-- 推薦類型：選了就存（下次打開還是這一種） -->
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="推薦類型">
      <button
        v-for="option in picks?.types ?? FALLBACK_TYPES"
        :key="option.type"
        type="button"
        class="cursor-pointer border-2 px-2 py-0.5 text-button transition active:translate-x-[1px] active:translate-y-[1px]"
        :class="(picks?.type ?? type ?? 'growth') === option.type ? 'border-accent-hue bg-selected text-on-selected' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
        :aria-pressed="(picks?.type ?? type ?? 'growth') === option.type"
        @click="emit('update:type', option.type)"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="status === 'loading'" class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      <SkeletonBlock v-for="n in 4" :key="n" class="h-[22rem] w-full rounded-none" />
    </div>
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-body text-danger">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-2 py-0.5 text-button" @click="load">重試</button>
    </div>
    <template v-else-if="picks">
      <DashboardStockTable v-if="picks.items.length && view === 'table'" :rows="tableRows" @open="openByCode" />
      <div v-else-if="picks.items.length" class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        <DashboardStockCard
          v-for="item in pageItems"
          :key="item.code"
          :code="item.code"
          :name="item.name"
          :tags="item.reasons"
          @open="analysisFor = item"
        />
      </div>
      <p v-else class="border-2 border-dashed border-tint/15 px-3 py-4 text-center text-body text-ink-muted">今天沒有符合條件的股票，換一種類型看看。</p>
      <ListPager v-if="picks.items.length" v-model:page="page" v-model:page-size="pageSize" :total="total" />
      <p class="text-caption text-ink-muted">
        {{ picks.quoteDate ? `${picks.quoteDate} 收盤資料。` : '' }}挑選方式：{{ picks.rule }}。依公開資料用固定規則挑出，<span class="text-warn">不是投資建議</span>。
      </p>
      <p v-for="note in picks.notes" :key="note" class="text-caption text-ink-muted">{{ note }}</p>
    </template>

    <!-- 個股分析：推薦的股票通常沒追蹤，用代號開（有追蹤的後端會自動帶持股） -->
    <StockAnalysisDialog v-if="analysisFor" :code="analysisFor.code" :name="analysisFor.name" @close="analysisFor = null" />
  </div>
</template>
