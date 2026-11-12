<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { confirmDialog } from '../../lib/confirm'

import { deleteStockAnalysis, fetchStockAnalyses, fetchStockAnalysisRecord, UnauthorizedError } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { smoothScrollTo } from '../../lib/motion'
import { provideSectionNav, type SectionNavItem } from '../../lib/sectionNav'
import BackToTop from '../BackToTop.vue'
import RecordIndex, { type RecordIndexItem } from '../RecordIndex.vue'
import RecordListShell from '../RecordListShell.vue'
import SelectField from '../SelectField.vue'
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

const idOf = (item: StockAnalysisSummary) =>
  item.target.market === 'tw' && item.target.kind === 'stock' ? item.target.code : item.target.symbol || item.target.code

// 清單（和塔羅紀錄同一套 RecordIndex）：搜尋股票名稱或代號，篩選市場
const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'tw', label: '台股' },
  { value: 'us', label: '美股' },
] as const
const keyword = ref('')
const marketFilter = ref<string>('all')
const indexOpen = ref(false)

// 依股票篩選（下拉選單，空字串＝全部）：選項跟著市場篩選，每檔後面帶筆數
const stockFilter = ref('')
const stockKey = (item: StockAnalysisSummary) => `${item.target.market}:${item.target.symbol || item.target.code}`
const inMarket = computed(() => list.value.filter((item) => marketFilter.value === 'all' || item.target.market === marketFilter.value))
const stockOptions = computed(() => {
  const options = new Map<string, { value: string; label: string; count: number }>()
  for (const item of inMarket.value) {
    const key = stockKey(item)
    const option = options.get(key)
    if (option) option.count += 1
    else options.set(key, { value: key, label: `${item.target.name} ${idOf(item) ?? ''}`.trim(), count: 1 })
  }
  return [...options.values()]
})
// 下拉的選項：第一個是全部
const stockSelectOptions = computed(() => [
  { value: '', label: `全部股票（${inMarket.value.length} 筆）` },
  ...stockOptions.value.map((o) => ({ value: o.value, label: `${o.label}（${o.count} 筆）` })),
])
// 換市場後選的股票不在選項裡了，就回到全部
watch(stockOptions, (options) => {
  if (stockFilter.value && !options.some((o) => o.value === stockFilter.value)) stockFilter.value = ''
})

const indexItems = computed<RecordIndexItem[]>(() => {
  const term = keyword.value.trim().toLowerCase()
  return inMarket.value
    .filter((item) => !stockFilter.value || stockKey(item) === stockFilter.value)
    .filter((item) => !term || `${item.target.name} ${idOf(item) ?? ''} ${item.target.symbol ?? ''}`.toLowerCase().includes(term))
    .map((item) => {
      const pct = item.quote.changePct
      return {
        id: item.id,
        title: `${item.target.name} ${idOf(item) ?? ''}`.trim(),
        createdAt: item.createdAt,
        meta: [
          { text: formatNumber(item.quote.price) },
          { text: formatSigned(pct, '%'), tone: pct ? (pct > 0 ? 'up' : 'down') : undefined },
        ],
      }
    })
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

// 刪除的狀態要在 loadDetail 之前宣告：下面的 watch 是 immediate，網址帶著 id 時建立元件當下就會呼叫 loadDetail
const deletingId = ref('')
const deleteError = ref('')

let detailRequestId = 0
async function loadDetail(id: string) {
  const requestId = (detailRequestId += 1)
  detail.value = null
  detailError.value = ''
  deleteError.value = ''
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
  indexOpen.value = false
  if (id === selectedId.value) return
  router.replace({ query: { ...route.query, tab: 'stock', id } })
  smoothScrollTo(0)
}

// ---- 刪除：用共用的確認彈窗確認 ----
async function confirmDelete(id: string) {
  const ok = await confirmDialog({ title: '刪除股票分析', message: '確定要刪除這筆 AI 分析紀錄嗎？刪除後無法復原。', confirmText: '刪除', danger: true })
  if (!ok) return
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteStockAnalysis(id)
    list.value = list.value.filter((item) => item.id !== id)
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

// ---- 浮動選單的「跳到段落」：打開一筆分析時登記，沒有選任何一筆時取消 ----
const aiEl = ref<HTMLElement | null>(null)
const holdingEl = ref<HTMLElement | null>(null)
const basisEl = ref<HTMLDetailsElement | null>(null)

async function scrollToEl(el: HTMLElement) {
  // 分析依據裡的段落：收合著就先展開
  if (basisEl.value && basisEl.value !== el && basisEl.value.contains(el) && !basisEl.value.open) {
    basisEl.value.open = true
    await nextTick()
  }
  const top = el.getBoundingClientRect().top + window.scrollY - 16
  smoothScrollTo(top)
}

function collectSections(): SectionNavItem[] {
  const items: SectionNavItem[] = []
  const add = (el: HTMLElement | null | undefined, label: string, level: 1 | 2) => {
    if (el && label) items.push({ label, level, go: () => void scrollToEl(el) })
  }
  add(aiEl.value, 'AI 分析', 1)
  // AI 全文裡的 ## 小標（現況、技術面…）
  for (const heading of aiEl.value?.querySelectorAll<HTMLElement>('h2') ?? []) add(heading, heading.textContent?.trim() ?? '', 2)
  add(holdingEl.value, '當時的持股', 1)
  if (basisEl.value) {
    add(basisEl.value, '分析依據', 1)
    // MarketPanel 標了 data-panel-section 的區塊（行情與技術指標、籌碼與估值、歷史回測與模型、操作建議）
    basisEl.value
      .querySelectorAll<HTMLElement>('[data-panel-section]')
      .forEach((el) => add(el, el.dataset.panelSection ?? '', 2))
  }
  return items
}

let releaseSectionNav: (() => void) | null = null
watch(
  detail,
  (current) => {
    releaseSectionNav?.()
    releaseSectionNav = current ? provideSectionNav({ items: collectSections, cardStyle: false }) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => releaseSectionNav?.())

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { hour12: false })
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

onMounted(loadList)
</script>

<template>
  <div v-if="listStatus === 'error'" class="flex flex-wrap items-center justify-between gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
    <span>{{ listError }}</span>
    <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-4 py-1 font-pixel text-button text-danger transition hover:bg-danger-hue/15" @click="loadList">
      重試
    </button>
  </div>

  <div v-else class="flex min-w-0 items-start gap-6 lg:gap-0">
    <!-- 左欄：共用外框（桌機可收合、手機滿版抽屜），清單和塔羅紀錄同一套 -->
    <RecordListShell v-model:open="indexOpen" label="分析清單" :count="list.length" collapse-key="stock_history_index_collapsed">
      <!-- 骨架照著真正的列排：標題一行、底下一行資訊 -->
      <div v-if="listStatus === 'loading'" class="space-y-2">
        <div v-for="n in 4" :key="n" class="rounded-2xl border border-tint/10 bg-tint/5 px-4 py-3">
          <SkeletonBlock class="h-4 w-4/5 rounded-full" />
          <SkeletonBlock class="mt-2.5 h-3 w-32 rounded-full" />
        </div>
      </div>
      <p v-else-if="!list.length" class="px-1 text-body text-ink-muted">還沒有股票分析</p>
      <RecordIndex
        v-else
        v-model:keyword="keyword"
        v-model:filter="marketFilter"
        :items="indexItems"
        :total="list.length"
        :selected-id="selectedId"
        placeholder="搜尋股票名稱或代號"
        :filter-options="FILTERS"
        list-label="股票分析紀錄"
        :extra-condition="stockFilter !== ''"
        @select="select"
        @clear="stockFilter = ''"
      >
        <!-- 依股票：只有兩檔以上才需要；和搜尋框同款的和紙樣式 -->
        <template v-if="stockOptions.length > 1" #controls>
          <SelectField v-model="stockFilter" :options="stockSelectOptions" label="依股票篩選" variant="washi" hide-label />
        </template>
      </RecordIndex>
    </RecordListShell>

    <!-- 右欄：和塔羅紀錄一樣的和紙菜單 -->
    <section class="w-full min-w-0 flex-1 border-4 border-frame bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] [image-rendering:pixelated] p-3 shadow-[6px_6px_0_var(--c-shade)] sm:p-5">
      <div class="space-y-4 border-2 border-frame bg-surface p-3 [image-rendering:auto] sm:p-5">
        <!-- 手機：清單是滿版抽屜，從這裡打開 -->
        <button
          v-if="listStatus === 'ready' && list.length"
          type="button"
          class="w-full cursor-pointer rounded-full border border-tint/15 bg-tint/5 px-4 py-2 text-button text-ink-soft transition hover:bg-tint/10 active:bg-tint/15 lg:hidden"
          @click="indexOpen = true"
        >
          開啟分析清單（共 {{ list.length }} 筆）
        </button>

        <div v-if="listStatus === 'ready' && !list.length" class="border-2 border-dashed border-tint/15 bg-sink/10 px-5 py-14 text-center">
          <p class="text-subtitle text-ink-soft">還沒有股票分析紀錄</p>
          <p class="mt-2 text-body text-ink-muted">
            在「股市追蹤」展開一檔股票，按「個股分析」再按「AI 深度分析」，完成的分析會出現在這裡。
          </p>
          <router-link
            :to="{ name: 'market' }"
            class="mt-6 inline-block cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-6 py-2 font-pixel text-button text-accent transition hover:bg-accent-hue/25"
          >
            前往股市追蹤
          </router-link>
        </div>

        <div v-else-if="detailLoading || (listStatus === 'loading' && selectedId)" class="space-y-3">
          <SkeletonBlock class="h-4 w-56 max-w-[60%]" />
          <SkeletonBlock class="h-8 w-48" />
          <SkeletonBlock v-for="n in 6" :key="n" class="h-3 w-full" />
        </div>

        <p v-else-if="detailError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">{{ detailError }}</p>

        <template v-else-if="detail">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-body text-ink-muted">{{ formatDate(detail.createdAt) }}・股票分析</p>
            <button
              type="button"
              class="cursor-pointer border-2 border-tint/15 px-3 py-1 font-pixel text-button text-up-ink transition hover:bg-up-hue/10 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="deletingId === detail.id"
              @click="confirmDelete(detail.id)"
            >
              {{ deletingId === detail.id ? '刪除中…' : '刪除' }}
            </button>
          </div>
          <p v-if="deleteError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">{{ deleteError }}</p>

          <div class="border-b border-tint/10 pb-4">
            <p class="text-caption uppercase tracking-[0.3em] text-ink-muted">Stock Analysis</p>
            <h2 class="mt-1.5 text-title font-semibold text-ink">
              {{ detail.target.name }}<span class="ml-2 text-caption font-normal text-ink-muted">{{ idOf(detail) }}</span>
            </h2>
            <p class="mt-1 text-body tabular-nums text-ink-muted">
              分析時股價 {{ formatNumber(detail.quote.price) }}
              <span :class="trendClass(detail.quote.change)">{{ formatSigned(detail.quote.change) }}（{{ formatSigned(detail.quote.changePct, '%') }}）</span>
              <span v-if="detail.quote.date" class="text-ink-muted"> · {{ detail.quote.date }}</span>
            </p>
          </div>

          <div ref="aiEl" class="scroll-mt-4">
            <StockAiText :text="detail.text" />
          </div>
          <p class="text-caption text-ink-muted">AI 只根據當時的資料撰寫，僅供參考，不是投資建議。</p>

          <section v-if="detail.holding" ref="holdingEl" class="border-2 border-tint/10 bg-tint/5 p-4">
            <p class="mb-3 font-pixel text-[12px] text-ink-soft">當時的持股</p>
            <StockHoldingSummary :holding="detail.holding" />
          </section>

          <!-- 分析依據：當時交給 AI 的資料，預設收合 -->
          <details v-if="savedSnapshot" ref="basisEl" class="group border-2 border-tint/10">
            <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-pixel text-[12px] text-ink-soft hover:bg-tint/5 [&::-webkit-details-marker]:hidden">
              <span class="transition group-open:rotate-90">›</span>分析依據（當時的行情與指標）
            </summary>
            <div class="border-t border-tint/10 p-3">
              <!-- 和個股分析彈窗同一種分頁排版（2026-11-12 起，快速占卜的結果頁也是） -->
              <MarketPanel :snapshot="savedSnapshot" status="ready" is-saved hide-refresh tabs />
            </div>
          </details>
        </template>

        <p v-else-if="listStatus === 'ready'" class="border-2 border-dashed border-tint/15 bg-sink/10 px-5 py-10 text-center text-body text-ink-muted">
          從清單選一筆分析來看
        </p>
      </div>
    </section>

    <!-- 往下捲超過一個畫面高就出現 -->
    <BackToTop />
  </div>
</template>
