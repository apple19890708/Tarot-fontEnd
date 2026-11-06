<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { deleteFinanceNewsAnalysis, fetchFinanceNewsAnalyses, fetchFinanceNewsAnalysis, UnauthorizedError } from '../../lib/api'
import { confirmDialog } from '../../lib/confirm'
import { smoothScrollTo } from '../../lib/motion'
import { provideSectionNav, type SectionNavItem } from '../../lib/sectionNav'
import BackToTop from '../BackToTop.vue'
import RecordIndex, { type RecordIndexItem } from '../RecordIndex.vue'
import RecordListShell from '../RecordListShell.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import StockAiText from './StockAiText.vue'
import type { FinanceNewsAnalysisDetail, FinanceNewsAnalysisSummary } from '../../types'

// 「我的紀錄」的財經新聞分析（v17 規格 G）：股市追蹤「財經新聞」分頁跑過的 AI 影響分析。
// 股市頁只留今天最新的一份，過去的都在這裡看。選中的那一筆放在網址（?tab=news&id=），重新整理還是同一筆
const route = useRoute()
const router = useRouter()

const list = ref<FinanceNewsAnalysisSummary[]>([])
const listStatus = ref<'loading' | 'ready' | 'error'>('loading')
const listError = ref('')

const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const detail = ref<FinanceNewsAnalysisDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

// 範圍說明由後端給（主題名稱以後端主題表為準）；舊版後端沒有就只寫區域
const REGION_FALLBACK = { all: '國內外新聞', tw: '國內新聞', intl: '國外新聞' } as const
const scopeOf = (item: FinanceNewsAnalysisSummary) => item.scopeLabel || REGION_FALLBACK[item.region]

function dateTime(iso: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

// 清單（和塔羅紀錄同一套 RecordIndex）：搜尋範圍文字（主題名稱），篩選區域。
// 「國內」列出有包含國內新聞的分析（只分析國內的，加上國內外一起分析的），「國外」同理；
// 不另外放「國內外」按鈕，和「全部」並排容易混淆
const FILTERS = [
  { value: 'any', label: '全部' },
  { value: 'tw', label: '國內' },
  { value: 'intl', label: '國外' },
] as const
const keyword = ref('')
const regionFilter = ref<string>('any')
const indexOpen = ref(false)
const indexItems = computed<RecordIndexItem[]>(() => {
  const term = keyword.value.trim().toLowerCase()
  return list.value
    .filter((item) => regionFilter.value === 'any' || item.region === regionFilter.value || item.region === 'all')
    .filter((item) => !term || scopeOf(item).toLowerCase().includes(term))
    .map((item) => ({ id: item.id, title: scopeOf(item), createdAt: item.createdAt, meta: [{ text: `${item.newsCount} 則新聞` }] }))
})

let listRequestId = 0
async function loadList() {
  const id = (listRequestId += 1)
  listStatus.value = 'loading'
  listError.value = ''
  try {
    const result = await fetchFinanceNewsAnalyses()
    if (id !== listRequestId) return
    list.value = result.analyses
    listStatus.value = 'ready'
    // 網址沒指定時預設看最新一筆
    if (!selectedId.value && list.value[0]) select(list.value[0].id)
  } catch (error) {
    if (id !== listRequestId || error instanceof UnauthorizedError) return
    listError.value = error instanceof Error ? error.message : '財經新聞分析紀錄暫時讀不到。'
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
    const result = await fetchFinanceNewsAnalysis(id)
    if (requestId !== detailRequestId) return
    detail.value = result.analysis
  } catch (error) {
    if (requestId !== detailRequestId || error instanceof UnauthorizedError) return
    detailError.value = error instanceof Error ? error.message : '找不到這份分析'
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
  router.replace({ query: { ...route.query, tab: 'news', id } })
  smoothScrollTo(0)
}

// ---- 刪除：用共用的確認彈窗確認 ----
async function confirmDelete(id: string) {
  const ok = await confirmDialog({ title: '刪除分析', message: '確定要刪除這份 AI 影響分析嗎？刪除後無法復原。', confirmText: '刪除', danger: true })
  if (!ok) return
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteFinanceNewsAnalysis(id)
    list.value = list.value.filter((item) => item.id !== id)
    const next = list.value[0]
    const query: Record<string, string> = { tab: 'news' }
    if (next) query.id = next.id
    router.replace({ query })
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '刪除失敗'
  } finally {
    deletingId.value = ''
  }
}

// ---- 文中的引用上標：展開「引用的新聞」，捲到那一則並亮一下 ----
const citeList = ref<HTMLDetailsElement | null>(null)
const highlighted = ref(0)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
async function showCited(index: number) {
  if (!citeList.value) return
  citeList.value.open = true
  await nextTick()
  // 捲整頁，讓那一則落在畫面中間
  const row = citeList.value.querySelector<HTMLElement>(`[data-ref="${index}"]`)
  if (row) {
    const rect = row.getBoundingClientRect()
    smoothScrollTo(rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2)
  }
  highlighted.value = index
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlighted.value = 0), 2000)
}

// ---- 浮動選單的「跳到段落」：打開一份分析時登記 AI 全文的 ## 小標 ----
const aiEl = ref<HTMLElement | null>(null)
function scrollToEl(el: HTMLElement) {
  const top = el.getBoundingClientRect().top + window.scrollY - 16
  smoothScrollTo(top)
}
function collectSections(): SectionNavItem[] {
  const items: SectionNavItem[] = []
  const add = (el: HTMLElement | null | undefined, label: string, level: 1 | 2) => {
    if (el && label) items.push({ label, level, go: () => scrollToEl(el) })
  }
  add(aiEl.value, 'AI 影響分析', 1)
  for (const heading of aiEl.value?.querySelectorAll<HTMLElement>('h2') ?? []) add(heading, heading.textContent?.trim() ?? '', 2)
  add(citeList.value, '引用的新聞', 1)
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
onBeforeUnmount(() => {
  releaseSectionNav?.()
  if (highlightTimer) clearTimeout(highlightTimer)
})

onMounted(loadList)
</script>

<template>
  <div v-if="listStatus === 'error'" class="flex flex-wrap items-center justify-between gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
    <span>{{ listError }}</span>
    <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-4 py-1 font-pixel text-[14px] text-rose-50 transition hover:bg-rose-300/15 active:translate-x-[2px] active:translate-y-[2px]" @click="loadList">
      重試
    </button>
  </div>

  <div v-else class="flex min-w-0 items-start gap-6 lg:gap-0">
    <!-- 左欄：共用外框（桌機可收合、手機滿版抽屜），清單和塔羅紀錄同一套 -->
    <RecordListShell v-model:open="indexOpen" label="分析清單" :count="list.length" collapse-key="news_history_index_collapsed">
      <!-- 骨架照著真正的列排：標題一行、底下一行資訊 -->
      <div v-if="listStatus === 'loading'" class="space-y-2">
        <div v-for="n in 4" :key="n" class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <SkeletonBlock class="h-4 w-4/5 rounded-full" />
          <SkeletonBlock class="mt-2.5 h-3 w-32 rounded-full" />
        </div>
      </div>
      <p v-else-if="!list.length" class="px-1 text-sm text-stone-400">還沒有財經新聞分析</p>
      <RecordIndex
        v-else
        v-model:keyword="keyword"
        v-model:filter="regionFilter"
        :items="indexItems"
        :total="list.length"
        :selected-id="selectedId"
        placeholder="搜尋主題"
        :filter-options="FILTERS"
        list-label="財經新聞分析紀錄"
        @select="select"
      />
    </RecordListShell>

    <!-- 右欄：和其他紀錄一樣的和紙菜單 -->
    <section class="w-full min-w-0 flex-1 border-4 border-[#3b2618] bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] [image-rendering:pixelated] p-3 shadow-[6px_6px_0_rgba(0,0,0,0.45)] sm:p-5">
      <div class="space-y-4 border-2 border-[#3b2618] bg-[#0f1526] p-3 [image-rendering:auto] sm:p-5">
        <!-- 手機：清單是滿版抽屜，從這裡打開 -->
        <button
          v-if="listStatus === 'ready' && list.length"
          type="button"
          class="w-full cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/10 active:bg-white/15 lg:hidden"
          @click="indexOpen = true"
        >
          開啟分析清單（共 {{ list.length }} 筆）
        </button>

        <div v-if="listStatus === 'ready' && !list.length" class="border-2 border-dashed border-white/15 bg-black/10 px-5 py-14 text-center">
          <p class="text-base text-stone-200">還沒有財經新聞分析紀錄</p>
          <p class="mt-2 text-sm leading-6 text-stone-400">
            在「股市追蹤」的「財經新聞」分頁按「分析影響」，完成的分析會出現在這裡。
          </p>
          <router-link
            :to="{ name: 'market' }"
            class="mt-6 inline-block cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-6 py-2 font-pixel text-[14px] text-amber-50 transition hover:bg-amber-200/25 active:translate-x-[2px] active:translate-y-[2px]"
          >
            前往股市追蹤
          </router-link>
        </div>

        <!-- 骨架：標題列（日期＋刪除）、範圍標題、全文 -->
        <div v-else-if="detailLoading || (listStatus === 'loading' && selectedId)" class="space-y-3">
          <div class="flex items-center justify-between">
            <SkeletonBlock class="h-4 w-40" />
            <SkeletonBlock class="h-8 w-16" />
          </div>
          <SkeletonBlock class="h-7 w-56 max-w-[70%]" />
          <SkeletonBlock v-for="n in 8" :key="n" class="h-3 w-full" />
        </div>

        <p v-else-if="detailError" class="border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{{ detailError }}</p>

        <template v-else-if="detail">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-stone-400">{{ dateTime(detail.createdAt) }}・財經新聞分析</p>
            <button
              type="button"
              class="cursor-pointer border-2 border-white/15 px-3 py-1 font-pixel text-[14px] text-rose-200/80 transition hover:bg-rose-300/10 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="deletingId === detail.id"
              @click="confirmDelete(detail.id)"
            >
              {{ deletingId === detail.id ? '刪除中…' : '刪除' }}
            </button>
          </div>
          <p v-if="deleteError" class="border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{{ deleteError }}</p>

          <div class="border-b border-white/10 pb-4">
            <p class="text-[10px] uppercase tracking-[0.3em] text-stone-400">Impact Report</p>
            <h2 class="mt-1.5 text-xl font-semibold text-stone-50">AI 影響分析</h2>
            <p class="mt-1 text-sm text-stone-300">範圍：{{ scopeOf(detail) }} · {{ detail.newsCount }} 則新聞</p>
          </div>

          <div ref="aiEl" class="scroll-mt-4">
            <StockAiText :text="detail.text" citations @cite="showCited" />
          </div>

          <!-- AI 引用的 [n] 對應的新聞 -->
          <details v-if="detail.news.length" ref="citeList" class="scroll-mt-4 border-t border-white/10 pt-4 text-xs">
            <summary class="cursor-pointer text-stone-300 hover:text-stone-100">引用的新聞（{{ detail.news.length }}）</summary>
            <ol class="mt-2 space-y-1.5 pl-1">
              <li
                v-for="(cited, index) in detail.news"
                :key="index"
                :data-ref="index + 1"
                class="flex gap-2 px-1 leading-5 transition-colors duration-500"
                :class="highlighted === index + 1 ? 'bg-sky-300/15' : ''"
              >
                <span class="shrink-0 tabular-nums text-stone-500">[{{ index + 1 }}]</span>
                <span class="min-w-0">
                  <a :href="cited.url" target="_blank" rel="noopener noreferrer" class="text-stone-200 underline-offset-2 hover:text-amber-100 hover:underline">{{ cited.title }}</a>
                  <span class="ml-1 text-stone-500">{{ cited.sourceLabel }}<template v-if="cited.publishedAt"> · {{ dateTime(cited.publishedAt) }}</template></span>
                </span>
              </li>
            </ol>
          </details>

          <p class="text-[11px] text-stone-500">AI 只根據當時的新聞標題與摘要撰寫，族群與個股是依產業關聯推估，僅供參考，不是投資建議。</p>
        </template>

        <p v-else-if="listStatus === 'ready'" class="border-2 border-dashed border-white/15 bg-black/10 px-5 py-10 text-center text-sm text-stone-400">
          從清單選一份分析來看
        </p>
      </div>
    </section>

    <!-- 往下捲超過一個畫面高就出現 -->
    <BackToTop />
  </div>
</template>
