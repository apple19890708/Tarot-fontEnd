<script setup lang="ts">
// 雷諾曼紀錄（v27 階段 6，計畫書 3-10、3-13）：HistoryView 的 lenormand 分頁（/lenormand/records）。
// 排法和股票分析紀錄（StockAnalysisHistory）一樣：左欄共用的清單外框＋索引標籤，右欄和紙菜單裡放這筆的結果。
// 結果用占卜頁同一個 LenormandResult（大藍圖也一樣），分析每次打開都由後端依存下來的牌號重算。
// 選中的那一筆放在網址（?id=），重新整理、從月曆點進來都是同一筆。
// AI 解讀（階段 7）：存下來的那篇直接顯示；沒有的可以在這裡補做，帶著這筆的 id，後端寫完會存回來（重新產生會取代舊的）
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BackToTop from '../BackToTop.vue'
import RecordIndex, { type RecordIndexItem } from '../RecordIndex.vue'
import RecordListShell from '../RecordListShell.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import LenormandResult from './LenormandResult.vue'
import {
  deleteLenormandReading,
  fetchLenormandCards,
  fetchLenormandReadingDetail,
  fetchLenormandReadings,
  fetchLenormandSpreads,
  UnauthorizedError,
} from '../../lib/api'
import { confirmDialog } from '../../lib/confirm'
import { smoothScrollTo } from '../../lib/motion'
import { useLenormandNarration } from '../../lib/useLenormandNarration'
import type { LenormandCard, LenormandPlayingCardGuide, LenormandReadingDetail, LenormandReadingSummary, LenormandSpread } from '../../types'

const route = useRoute()
const router = useRouter()

// 每人最多 100 筆、摘要很小，一次載完（後端每頁上限 50），篩選才涵蓋全部
const PAGE_SIZE = 50

const list = ref<LenormandReadingSummary[]>([])
const listStatus = ref<'loading' | 'ready' | 'error'>('loading')
const listError = ref('')

const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const detail = ref<LenormandReadingDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')

// 排列圖要完整的牌陣定義、牌義與花色解說表在 /cards（api.ts 快取）；載不到只是少了排列圖或牌義，紀錄照常顯示
const spreads = ref<LenormandSpread[]>([])
const cardsById = ref(new Map<number, LenormandCard>())
const guide = ref<LenormandPlayingCardGuide | null>(null)
const meaningsLoading = ref(true)
const meaningsError = ref('')

// ---- 清單：搜尋問題或牌名，篩選小牌陣／大藍圖 ----
const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'small', label: '小牌陣' },
  { value: 'grand', label: '大藍圖' },
] as const
const keyword = ref('')
const spreadFilter = ref<string>('all')
const indexOpen = ref(false)

const indexItems = computed<RecordIndexItem[]>(() => {
  const term = keyword.value.trim().toLowerCase()
  return list.value
    .filter((item) => spreadFilter.value === 'all' || (spreadFilter.value === 'grand') === (item.spreadKey === 'grand-tableau'))
    .filter((item) => !term || `${item.question} ${item.cards.map((card) => card.nameZh).join(' ')}`.toLowerCase().includes(term))
    .map((item) => ({
      id: item.id,
      title: item.question || '（沒有寫問題）',
      createdAt: item.createdAt,
      meta: [{ text: item.spreadName }, { text: item.cards.map((card) => card.nameZh).join('、') + (item.cardCount > item.cards.length ? '…' : '') }],
      badge: item.hasNarration ? 'AI' : undefined,
    }))
})

let listRequestId = 0
async function loadList() {
  const requestId = (listRequestId += 1)
  listStatus.value = 'loading'
  listError.value = ''
  try {
    const first = await fetchLenormandReadings({ page: 1, pageSize: PAGE_SIZE })
    const all = [...first.readings]
    const pageCount = Math.ceil(first.total / first.pageSize)
    for (let page = 2; page <= pageCount; page += 1) {
      const next = await fetchLenormandReadings({ page, pageSize: PAGE_SIZE })
      all.push(...next.readings)
    }
    if (requestId !== listRequestId) return
    // 分頁之間剛好有新紀錄插入時，同一筆可能出現兩次
    const seen = new Set<string>()
    list.value = all.filter((item) => !seen.has(item.id) && seen.add(item.id))
    listStatus.value = 'ready'
    // 網址沒指定時預設看最新一筆
    if (!selectedId.value && list.value[0]) select(list.value[0].id)
  } catch (error) {
    if (requestId !== listRequestId || error instanceof UnauthorizedError) return
    listError.value = error instanceof Error ? error.message : '雷諾曼紀錄暫時讀不到。'
    listStatus.value = 'error'
  }
}

// 刪除的狀態與 AI 解讀要在 loadDetail 之前宣告：下面的 watch 是 immediate，網址帶著 id 時建立元件當下就會呼叫 loadDetail
const deletingId = ref('')
const deleteError = ref('')

const narration = useLenormandNarration({
  reading: detail,
  readingId: computed(() => detail.value?.id ?? ''),
  // 照紀錄存下的問題類型送，後端才會把解讀存回這一筆（3-14：問題類型也要一致）。清單的摘要有這個欄位，詳情沒有
  // 清單還沒載到這一筆時給 undefined：退回用詳情的分析判斷（紀錄有存類型時，重算的分析就是「使用者選的」）
  recordDomain: computed(() => {
    const item = detail.value ? list.value.find((entry) => entry.id === detail.value!.id) : undefined
    return item ? item.domain : undefined
  }),
  onDone: (result) => {
    // 存回這筆了：清單上補「AI」標記
    if (result.saved) {
      const item = list.value.find((entry) => entry.id === result.readingIdAtStart)
      if (item) item.hasNarration = true
    }
  },
})

let detailRequestId = 0
async function loadDetail(id: string) {
  const requestId = (detailRequestId += 1)
  narration.reset(false)
  detail.value = null
  detailError.value = ''
  deleteError.value = ''
  detailLoading.value = true
  try {
    const result = await fetchLenormandReadingDetail(id)
    if (requestId !== detailRequestId) return
    detail.value = result
    if (result.narration?.text) narration.restore(result.narration)
    else narration.reset(true)
  } catch (error) {
    if (requestId !== detailRequestId || error instanceof UnauthorizedError) return
    detailError.value = error instanceof Error ? error.message : '找不到這筆紀錄。'
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
  router.replace({ query: { ...route.query, id } })
  smoothScrollTo(0)
}

// 這筆的排列圖用的完整牌陣定義
const detailSpread = computed(() => spreads.value.find((spread) => spread.key === detail.value?.spread.key) ?? null)

// ---- 刪除：共用的確認彈窗 ----
async function confirmDelete(id: string) {
  const ok = await confirmDialog({
    title: '刪除雷諾曼紀錄',
    message: '確定要刪除這筆紀錄嗎？寫在這筆底下的日記會一起刪除，刪除後無法復原。',
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  deletingId.value = id
  deleteError.value = ''
  try {
    await deleteLenormandReading(id)
    list.value = list.value.filter((item) => item.id !== id)
    const next = list.value[0]
    const query = { ...route.query }
    if (next) router.replace({ query: { ...query, id: next.id } })
    else {
      delete query.id
      router.replace({ query })
    }
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '刪除失敗'
  } finally {
    deletingId.value = ''
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { hour12: false })
}

async function loadSupport() {
  const [spreadResult, cardResult] = await Promise.allSettled([fetchLenormandSpreads(), fetchLenormandCards()])
  if (spreadResult.status === 'fulfilled') spreads.value = spreadResult.value.spreads
  if (cardResult.status === 'fulfilled') {
    cardsById.value = new Map(cardResult.value.cards.map((card) => [card.id, card]))
    guide.value = cardResult.value.playingCardGuide
  } else {
    meaningsError.value = cardResult.reason instanceof Error ? cardResult.reason.message : '牌義載入失敗，請重新整理再試一次。'
  }
  meaningsLoading.value = false
}

onMounted(() => {
  void loadList()
  void loadSupport()
})
</script>

<template>
  <div v-if="listStatus === 'error'" class="flex flex-wrap items-center justify-between gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
    <span>{{ listError }}</span>
    <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-4 py-1 font-pixel text-button text-danger transition hover:bg-danger-hue/15 active:translate-x-[1px] active:translate-y-[1px]" @click="loadList">
      重試
    </button>
  </div>

  <div v-else class="flex min-w-0 items-start gap-6 lg:gap-0">
    <!-- 左欄：共用外框（桌機可收合、手機滿版抽屜），清單和塔羅紀錄同一套 -->
    <RecordListShell v-model:open="indexOpen" label="紀錄清單" :count="list.length" collapse-key="lenormand_history_index_collapsed">
      <!-- 骨架照著真正的列排：標題一行、底下一行資訊 -->
      <div v-if="listStatus === 'loading'" class="space-y-2">
        <div v-for="n in 4" :key="n" class="border-2 border-tint/10 bg-tint/5 px-4 py-3">
          <SkeletonBlock class="h-4 w-4/5 rounded-none" />
          <SkeletonBlock class="mt-2.5 h-3 w-32 rounded-none" />
        </div>
      </div>
      <p v-else-if="!list.length" class="px-1 text-body text-ink-muted">還沒有雷諾曼紀錄</p>
      <RecordIndex
        v-else
        v-model:keyword="keyword"
        v-model:filter="spreadFilter"
        :items="indexItems"
        :total="list.length"
        :selected-id="selectedId"
        placeholder="搜尋問題或牌名"
        :filter-options="FILTERS"
        list-label="雷諾曼紀錄"
        @select="select"
      />
    </RecordListShell>

    <!-- 右欄：和塔羅紀錄一樣的和紙菜單 -->
    <section class="w-full min-w-0 flex-1 border-4 border-frame bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] [image-rendering:pixelated] p-3 shadow-[6px_6px_0_var(--c-shade)] sm:p-5">
      <div class="space-y-4 border-2 border-frame bg-surface p-3 [image-rendering:auto] sm:p-5">
        <!-- 手機：清單是滿版抽屜，從這裡打開 -->
        <button
          v-if="listStatus === 'ready' && list.length"
          type="button"
          class="w-full cursor-pointer border-2 border-tint/15 bg-tint/5 px-4 py-2 text-button text-ink-soft transition hover:bg-tint/10 active:bg-tint/15 lg:hidden"
          @click="indexOpen = true"
        >
          開啟紀錄清單（共 {{ list.length }} 筆）
        </button>

        <div v-if="listStatus === 'ready' && !list.length" class="border-2 border-dashed border-tint/15 bg-sink/10 px-5 py-14 text-center">
          <p class="text-subtitle text-ink-soft">還沒有雷諾曼紀錄</p>
          <p class="mt-2 text-body text-ink-muted">在雷諾曼占卜的結果頁按「保存紀錄」，那次的牌與分析就會出現在這裡。</p>
          <router-link
            :to="{ name: 'lenormand' }"
            class="mt-6 inline-block cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-6 py-2 font-pixel text-button text-accent transition hover:bg-accent-hue/25 active:translate-x-[1px] active:translate-y-[1px]"
          >
            前往雷諾曼占卜
          </router-link>
        </div>

        <div v-else-if="detailLoading || (listStatus === 'loading' && selectedId)" class="space-y-3">
          <SkeletonBlock class="h-4 w-56 max-w-[60%] rounded-none" />
          <SkeletonBlock class="h-8 w-72 max-w-full rounded-none" />
          <div class="flex gap-3">
            <SkeletonBlock v-for="n in 3" :key="n" class="aspect-[7/12] w-20 rounded-none" />
          </div>
          <SkeletonBlock v-for="n in 4" :key="n" class="h-3 w-full rounded-none" />
        </div>

        <p v-else-if="detailError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">{{ detailError }}</p>

        <template v-else-if="detail">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-body text-ink-muted">{{ formatDate(detail.createdAt) }}・雷諾曼{{ detail.mode === 'manual' ? '・自己挑選的牌' : '' }}</p>
            <div class="flex flex-wrap items-start gap-2">
              <!-- 日記（v26 計畫 2）：寫在這筆紀錄底下 -->
              <router-link
                :to="{ path: `/journal/lenormand/${detail.id}` }"
                class="inline-flex cursor-pointer items-center border-2 border-accent-hue/40 bg-accent-hue/10 px-3 py-1 font-pixel text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[1px] active:translate-y-[1px]"
              >
                日記
              </router-link>
              <button
                type="button"
                class="cursor-pointer border-2 border-tint/15 px-3 py-1 font-pixel text-button text-up-ink transition hover:bg-up-hue/10 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-[1px] active:translate-y-[1px]"
                :disabled="deletingId === detail.id"
                @click="confirmDelete(detail.id)"
              >
                {{ deletingId === detail.id ? '刪除中…' : '刪除' }}
              </button>
            </div>
          </div>
          <p v-if="deleteError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">{{ deleteError }}</p>

          <LenormandResult
            :key="detail.id"
            :reading="detail"
            :spread="detailSpread"
            :cards-by-id="cardsById"
            :guide="guide"
            :meanings-loading="meaningsLoading"
            :meanings-error="meaningsError"
            :narration="{
              status: narration.status.value,
              text: narration.text.value,
              error: narration.error.value,
              saved: narration.saved.value,
              isRecord: true,
            }"
            hide-flow-actions
            @request-narration="narration.request"
            @stop-narration="narration.stop"
          />
        </template>

        <p v-else-if="listStatus === 'ready'" class="border-2 border-dashed border-tint/15 bg-sink/10 px-5 py-10 text-center text-body text-ink-muted">
          從清單選一筆紀錄來看
        </p>
      </div>
    </section>

    <!-- 往下捲超過一個畫面高就出現 -->
    <BackToTop />
  </div>
</template>
