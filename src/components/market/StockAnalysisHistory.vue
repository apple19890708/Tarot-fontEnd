<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { deleteStockAnalysis, fetchStockAnalyses, fetchStockAnalysisRecord, UnauthorizedError } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { prefersReducedMotion } from '../../lib/motion'
import MarketPanel from '../MarketPanel.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import StockAiText from './StockAiText.vue'
import StockHoldingSummary from './StockHoldingSummary.vue'
import type { StockAnalysisRecord, StockAnalysisSummary } from '../../types'

// 「我的紀錄」的股票分析（v17 規格 F）：個股彈窗裡跑過的 AI 深度分析，和塔羅紀錄分開。
// 選中的那一筆放在網址（?tab=stock&id=），重新整理還是同一筆
const route = useRoute()
const router = useRouter()

const list = ref<StockAnalysisSummary[]>([])
const listStatus = ref<'loading' | 'ready' | 'error'>('loading')
const listError = ref('')

const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const detail = ref<StockAnalysisRecord | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

// 依股票篩選（空字串＝全部）
const stockFilter = ref('')
const keyOf = (item: StockAnalysisSummary) => item.target.symbol || `${item.target.exchange}_${item.target.code}`
const idOf = (item: StockAnalysisSummary) =>
  item.target.market === 'tw' && item.target.kind === 'stock' ? item.target.code : item.target.symbol || item.target.code

const stockOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const item of list.value) if (!seen.has(keyOf(item))) seen.set(keyOf(item), `${item.target.name} ${idOf(item) ?? ''}`.trim())
  return [...seen].map(([value, label]) => ({ value, label }))
})

// 依月份分組，新的在前（後端已排好）
const groups = computed(() => {
  const result: { key: string; label: string; items: StockAnalysisSummary[] }[] = []
  for (const item of list.value) {
    if (stockFilter.value && keyOf(item) !== stockFilter.value) continue
    const date = new Date(item.createdAt)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    let group = result.find((g) => g.key === key)
    if (!group) {
      group = { key, label: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`, items: [] }
      result.push(group)
    }
    group.items.push(item)
  }
  return result
})

let listRequestId = 0
async function loadList() {
  const id = (listRequestId += 1)
  listStatus.value = 'loading'
  listError.value = ''
  try {
    const result = await fetchStockAnalyses()
    if (id !== listRequestId) return
    list.value = result.analyses
    listStatus.value = 'ready'
    // 網址沒指定時預設看最新一筆
    if (!selectedId.value && list.value[0]) select(list.value[0].id)
  } catch (error) {
    if (id !== listRequestId || error instanceof UnauthorizedError) return
    listError.value = error instanceof Error ? error.message : '股票分析紀錄暫時讀不到。'
    listStatus.value = 'error'
  }
}

let detailRequestId = 0
async function loadDetail(id: string) {
  const requestId = (detailRequestId += 1)
  detail.value = null
  detailError.value = ''
  deleteError.value = ''
  pendingDeleteId.value = ''
  detailLoading.value = true
  try {
    const result = await fetchStockAnalysisRecord(id)
    if (requestId !== detailRequestId) return
    detail.value = result.analysis
  } catch (error) {
    if (requestId !== detailRequestId || error instanceof UnauthorizedError) return
    detailError.value = error instanceof Error ? error.message : '找不到這筆分析紀錄'
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false
  }
}

watch(
  selectedId,
  (id) => {
    if (id) void loadDetail(id)
    else {
      detailRequestId += 1
      detail.value = null
      detailLoading.value = false
    }
  },
  { immediate: true },
)

function select(id: string) {
  if (id === selectedId.value) return
  router.replace({ query: { ...route.query, tab: 'stock', id } })
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

// ---- 刪除：二段式，第一次點變成「確定刪除？」----
const pendingDeleteId = ref('')
const deletingId = ref('')
const deleteError = ref('')
async function confirmDelete(id: string) {
  if (pendingDeleteId.value !== id) {
    pendingDeleteId.value = id
    return
  }
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteStockAnalysis(id)
    list.value = list.value.filter((item) => item.id !== id)
    pendingDeleteId.value = ''
    const next = list.value[0]
    const query = { ...route.query, tab: 'stock' }
    if (next) router.replace({ query: { ...query, id: next.id } })
    else {
      delete (query as Record<string, unknown>).id
      router.replace({ query })
    }
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '刪除失敗'
  } finally {
    deletingId.value = ''
  }
}

// MarketPanel 吃股市諮詢的快照格式；紀錄裡存的就是那一份（多了 events）
const savedSnapshot = computed(() => detail.value?.snapshot ?? null)

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { hour12: false })
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-400'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

onMounted(loadList)
</script>

<template>
  <div v-if="listStatus === 'error'" class="flex flex-wrap items-center justify-between gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
    <span>{{ listError }}</span>
    <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-4 py-1 font-pixel text-[12px] text-rose-50 transition hover:bg-rose-300/15" @click="loadList">
      重試
    </button>
  </div>

  <div v-else class="flex min-w-0 flex-col items-start gap-6 lg:flex-row lg:gap-0">
    <!-- 左欄：清單（手機在上面，桌機黏在左邊） -->
    <aside
      class="w-full bg-[#161d33] p-4 lg:sticky lg:top-5 lg:max-h-[calc(100vh-2.5rem)] lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-4 lg:border-r-0 lg:border-[#3b2618] lg:shadow-[6px_6px_0_rgba(0,0,0,0.45)]"
      aria-label="股票分析清單"
    >
      <p class="mb-3 font-pixel text-[12px] tracking-[0.2em] text-amber-200">分析清單</p>

      <div v-if="listStatus === 'loading'" class="space-y-2">
        <div v-for="n in 3" :key="n" class="border-2 border-white/10 bg-white/5 px-3 py-2.5">
          <SkeletonBlock class="h-4 w-3/5" />
          <SkeletonBlock class="mt-2 h-3 w-28" />
        </div>
      </div>

      <template v-else-if="list.length">
        <select
          v-if="stockOptions.length > 1"
          v-model="stockFilter"
          class="mb-3 w-full cursor-pointer border-2 border-[#f1e7cf]/20 bg-[#0f1526] px-2 py-1.5 text-xs text-stone-200 outline-none focus:border-amber-200/50"
          aria-label="依股票篩選"
        >
          <option value="">全部股票（{{ list.length }} 筆）</option>
          <option v-for="option in stockOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>

        <div class="max-h-[45vh] space-y-4 overflow-y-auto pr-1 [scrollbar-color:#3b2618_transparent] [scrollbar-width:thin] lg:max-h-none">
          <div v-for="group in groups" :key="group.key">
            <p class="mb-2 border-b-2 border-dashed border-[#f1e7cf]/15 pb-1 font-pixel text-[12px] tracking-[0.2em] text-amber-200/90">{{ group.label }}</p>
            <ul class="space-y-1.5">
              <li v-for="item in group.items" :key="item.id">
                <button
                  type="button"
                  class="w-full cursor-pointer border-2 border-l-[6px] px-3 py-2 text-left transition"
                  :class="item.id === selectedId
                    ? 'border-[#3b2618] border-l-[#a8322a] bg-[#f1e7cf] text-[#2a1a10]'
                    : 'border-transparent border-l-[#3d5a80] bg-white/5 text-stone-200 hover:bg-white/10'"
                  :aria-current="item.id === selectedId ? 'true' : undefined"
                  @click="select(item.id)"
                >
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="truncate text-sm font-medium">{{ item.target.name }}<span class="ml-1 text-xs opacity-60">{{ idOf(item) }}</span></span>
                    <span class="shrink-0 text-xs tabular-nums">{{ formatNumber(item.quote.price) }}</span>
                  </span>
                  <span class="mt-0.5 flex items-baseline justify-between gap-2 text-[11px]">
                    <span class="opacity-60">{{ formatDate(item.createdAt) }}</span>
                    <span class="tabular-nums" :class="item.id === selectedId ? '' : trendClass(item.quote.changePct)">{{ formatSigned(item.quote.changePct, '%') }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </template>

      <p v-else class="px-1 text-sm text-stone-400">還沒有股票分析</p>
    </aside>

    <!-- 右欄：和塔羅紀錄一樣的和紙菜單 -->
    <section class="w-full min-w-0 flex-1 border-4 border-[#3b2618] bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] [image-rendering:pixelated] p-3 shadow-[6px_6px_0_rgba(0,0,0,0.45)] sm:p-5">
      <div class="space-y-4 border-2 border-[#3b2618] bg-[#0f1526] p-3 [image-rendering:auto] sm:p-5">
        <div v-if="listStatus === 'ready' && !list.length" class="border-2 border-dashed border-white/15 bg-black/10 px-5 py-14 text-center">
          <p class="text-base text-stone-200">還沒有股票分析紀錄</p>
          <p class="mt-2 text-sm leading-6 text-stone-400">
            在「股市追蹤」展開一檔股票，按「個股分析」再按「AI 深度分析」，完成的分析會出現在這裡。
          </p>
          <router-link
            :to="{ name: 'market' }"
            class="mt-6 inline-block cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-6 py-2 font-pixel text-[12px] text-amber-50 transition hover:bg-amber-200/25"
          >
            前往股市追蹤
          </router-link>
        </div>

        <div v-else-if="detailLoading || (listStatus === 'loading' && selectedId)" class="space-y-3">
          <SkeletonBlock class="h-4 w-56 max-w-[60%]" />
          <SkeletonBlock class="h-8 w-48" />
          <SkeletonBlock v-for="n in 6" :key="n" class="h-3 w-full" />
        </div>

        <p v-else-if="detailError" class="border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{{ detailError }}</p>

        <template v-else-if="detail">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-stone-400">{{ formatDate(detail.createdAt) }}・股票分析</p>
            <button
              type="button"
              class="cursor-pointer border-2 px-3 py-1 font-pixel text-[12px] transition disabled:cursor-not-allowed disabled:opacity-50"
              :class="pendingDeleteId === detail.id ? 'border-rose-300/50 bg-rose-300/15 text-rose-50' : 'border-white/15 text-rose-200/80 hover:bg-rose-300/10'"
              :disabled="deletingId === detail.id"
              @click="confirmDelete(detail.id)"
            >
              {{ deletingId === detail.id ? '刪除中…' : pendingDeleteId === detail.id ? '確定刪除？' : '刪除' }}
            </button>
          </div>
          <p v-if="deleteError" class="border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{{ deleteError }}</p>

          <div class="border-b border-white/10 pb-4">
            <p class="text-[10px] uppercase tracking-[0.3em] text-stone-400">Stock Analysis</p>
            <h2 class="mt-1.5 text-xl font-semibold text-stone-50">
              {{ detail.target.name }}<span class="ml-2 text-sm font-normal text-stone-400">{{ idOf(detail) }}</span>
            </h2>
            <p class="mt-1 text-sm tabular-nums text-stone-300">
              分析時股價 {{ formatNumber(detail.quote.price) }}
              <span :class="trendClass(detail.quote.change)">{{ formatSigned(detail.quote.change) }}（{{ formatSigned(detail.quote.changePct, '%') }}）</span>
              <span v-if="detail.quote.date" class="text-stone-500"> · {{ detail.quote.date }}</span>
            </p>
          </div>

          <StockAiText :text="detail.text" />
          <p class="text-[11px] text-stone-500">AI 只根據當時的資料撰寫，僅供參考，不是投資建議。</p>

          <section v-if="detail.holding" class="border-2 border-white/10 bg-white/5 p-4">
            <p class="mb-3 font-pixel text-[12px] text-stone-200">當時的持股</p>
            <StockHoldingSummary :holding="detail.holding" />
          </section>

          <!-- 分析依據：當時交給 AI 的資料，預設收合 -->
          <details v-if="savedSnapshot" class="group border-2 border-white/10">
            <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-pixel text-[12px] text-stone-200 hover:bg-white/5 [&::-webkit-details-marker]:hidden">
              <span class="transition group-open:rotate-90">›</span>分析依據（當時的行情與指標）
            </summary>
            <div class="border-t border-white/10 p-3">
              <MarketPanel :snapshot="savedSnapshot" status="ready" is-saved hide-refresh />
            </div>
          </details>
        </template>

        <p v-else-if="listStatus === 'ready'" class="border-2 border-dashed border-white/15 bg-black/10 px-5 py-10 text-center text-sm text-stone-400">
          從清單選一筆分析來看
        </p>
      </div>
    </section>
  </div>
</template>
