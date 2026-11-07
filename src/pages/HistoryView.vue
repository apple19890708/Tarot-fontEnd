<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { confirmDialog } from '../lib/confirm'

import ReadingHistoryIndex from '../components/ReadingHistoryIndex.vue'
import RecordListShell from '../components/RecordListShell.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import StepResult from '../components/StepResult.vue'
import FinanceNewsAnalysisHistory from '../components/market/FinanceNewsAnalysisHistory.vue'
import StockAnalysisHistory from '../components/market/StockAnalysisHistory.vue'
import {
  deleteReading,
  fetchReadingDetail,
  fetchReadingHistory,
  fetchSpreads,
  fetchMarketSnapshot,
  streamNarration,
  UnauthorizedError,
} from '../lib/api'
import { canUseAi, canUseStock } from '../lib/auth'
import { smoothScrollTo } from '../lib/motion'
import { installWashi } from '../lib/pixelArt'
import type { MarketSnapshot, MarketStatus, NarrationStatus, ReadingDetail, ReadingSummary, Spread } from '../types'

// 右側的紀錄是和紙菜單，紋理要在畫出來之前放進 CSS 變數
installWashi()

// 每人最多 100 筆、摘要很小，左欄一次載完（後端每頁上限 50），篩選才涵蓋全部紀錄
const LIST_PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()

const readings = ref<ReadingSummary[]>([])
const isListLoading = ref(false)
const listError = ref('')
// 確定載入成功過才算數；載入中或失敗都不能當成「沒有紀錄」
const isListLoaded = ref(false)

const spreads = ref<Spread[]>([])

// 上方切換：塔羅紀錄（預設）／股票分析（?tab=stock）／財經新聞分析（?tab=news）。
// 後兩個只有股市權限的人看得到；各分頁的清單與內容完全分開
type HistoryTab = 'tarot' | 'stock' | 'news'
const TABS = [
  { value: 'tarot', label: '塔羅紀錄' },
  { value: 'stock', label: '股票分析' },
  { value: 'news', label: '財經新聞' },
] as const
const tab = computed<HistoryTab>(() => {
  const wanted = route.query.tab
  return (wanted === 'stock' || wanted === 'news') && canUseStock.value ? wanted : 'tarot'
})
function switchTab(next: HistoryTab) {
  if (next === tab.value) return
  // 換分頁時不帶 id：各分頁的 id 是不同的紀錄
  router.replace({ query: next === 'tarot' ? {} : { tab: next } })
}
const HEADINGS = {
  tarot: { eyebrow: 'Reading History', title: '我的占卜紀錄' },
  stock: { eyebrow: 'Stock Analysis', title: '我的股票分析' },
  news: { eyebrow: 'Finance News Analysis', title: '我的財經新聞分析' },
} as const

// 選中的那一筆放在網址（?id=），重新整理還是同一筆；在股票分析那一邊時 id 屬於股票紀錄，這裡不理它
const selectedId = computed(() => (tab.value === 'tarot' && typeof route.query.id === 'string' ? route.query.id : ''))

const detail = ref<ReadingDetail | null>(null)
const isDetailLoading = ref(false)
const detailError = ref('')

// 刪除前用共用的確認彈窗確認
const deletingId = ref('')
const deleteError = ref('')

// ---- 版面：桌機兩欄、左欄可收合；手機清單滿版，選了就收合（外框是共用的 RecordListShell）----
const isMobileIndexOpen = ref(false)

// ---- AI 解讀（沒用過的紀錄仍可補做）----
const narrationText = ref('')
const narrationStatus = ref<NarrationStatus>('idle')
const narrationError = ref('')
// 最近一次重新產生的解讀有沒有存回這筆紀錄
const narrationSaved = ref<boolean | null>(null)
// 股市諮詢的行情：先顯示當時存下來的那一份，按了才查最新報價
const marketSnapshot = ref<MarketSnapshot | null>(null)
const marketStatus = ref<MarketStatus>('idle')
const marketError = ref('')
// 重複按「更新報價」或換了結果時，只採用最新一次的回應
let marketRequestId = 0
// 目前顯示的是紀錄裡存下來的（true），還是剛查到的最新報價（false）
const marketIsSaved = ref(false)
let narrationController: AbortController | null = null

const isEmpty = computed(() => isListLoaded.value && readings.value.length === 0)

// 內容還沒載到之前，先用清單裡那一筆的張數決定骨架要排幾張牌，骨架才貼近真正的版面
const selectedSummary = computed(() => readings.value.find((item) => item.id === selectedId.value) || null)
const skeletonCardCount = computed(() => selectedSummary.value?.cardCount || 3)
// 牌卡區是兩欄，骨架排滿兩格就夠，再多只是讓等待的畫面變長
const skeletonPanelCount = computed(() => Math.min(skeletonCardCount.value, 2))

// 結果頁的排列圖需要完整牌陣定義，結果本身只帶 key
const detailSpread = computed(
  () => spreads.value.find((spread) => spread.key === detail.value?.reading.spread.key) || null,
)


let listRequestId = 0

async function loadList() {
  const requestId = (listRequestId += 1)
  isListLoading.value = true
  listError.value = ''

  try {
    const first = await fetchReadingHistory({ page: 1, pageSize: LIST_PAGE_SIZE })
    const all = [...first.readings]
    const pageCount = Math.ceil(first.total / first.pageSize)
    for (let page = 2; page <= pageCount; page += 1) {
      const next = await fetchReadingHistory({ page, pageSize: LIST_PAGE_SIZE })
      all.push(...next.readings)
    }
    if (requestId !== listRequestId) {
      return
    }
    // 分頁之間若剛好有新紀錄插入，同一筆可能出現兩次
    const seen = new Set<string>()
    readings.value = all.filter((item) => !seen.has(item.id) && seen.add(item.id))
    isListLoaded.value = true

    // 網址沒指定時預設看最新一筆（在股票分析那一邊時不動網址）
    if (tab.value === 'tarot' && !selectedId.value && readings.value[0]) {
      selectReading(readings.value[0].id)
    }
  } catch (error) {
    // 401：登入狀態已被清掉，router 的 watch 會把人導去登入頁，這裡不必再顯示「請先登入」
    if (requestId !== listRequestId || error instanceof UnauthorizedError) {
      return
    }
    listError.value = error instanceof Error ? error.message : '無法載入占卜紀錄'
  } finally {
    if (requestId === listRequestId) {
      isListLoading.value = false
    }
  }
}

function selectReading(id: string) {
  isMobileIndexOpen.value = false
  if (id === selectedId.value) {
    return
  }
  // replace：切換紀錄不堆疊瀏覽紀錄，上一頁直接離開這頁
  router.replace({ query: { ...route.query, id } })
  // 換了一筆就回到頂端，從標題開始讀（桌機也一樣；減少動態時直接跳）
  smoothScrollTo(0)
}

function clearSelection() {
  const query = { ...route.query }
  delete query.id
  router.replace({ query })
}

let detailRequestId = 0

async function loadDetail(id: string) {
  cancelNarration()
  const requestId = (detailRequestId += 1)
  detail.value = null
  detailError.value = ''
  deleteError.value = ''
  isDetailLoading.value = true
  narrationText.value = ''
  narrationError.value = ''
  narrationStatus.value = 'idle'
  narrationSaved.value = null
  marketSnapshot.value = null
  marketStatus.value = 'idle'
  marketError.value = ''
  marketRequestId += 1

  try {
    const response = await fetchReadingDetail(id)
    if (requestId !== detailRequestId) {
      return
    }
    detail.value = response
    // 當初用過 AI 就直接顯示存下來的那一份；沒用過的留著「請 AI 解讀」的選項
    if (response.narration) {
      narrationText.value = response.narration.text
      marketSnapshot.value = response.narration.market ?? null
      marketStatus.value = marketSnapshot.value ? 'ready' : 'idle'
      marketIsSaved.value = Boolean(marketSnapshot.value)
      narrationStatus.value = 'done'
    } else {
      narrationStatus.value = response.reading.analysis ? 'ready' : 'idle'
    }
  } catch (error) {
    if (requestId !== detailRequestId || error instanceof UnauthorizedError) {
      return
    }
    detailError.value = error instanceof Error ? error.message : '找不到這筆紀錄'
  } finally {
    if (requestId === detailRequestId) {
      isDetailLoading.value = false
    }
  }
}

function resetDetail() {
  cancelNarration()
  detailRequestId += 1
  detail.value = null
  detailError.value = ''
  isDetailLoading.value = false
  narrationText.value = ''
  narrationStatus.value = 'idle'
  narrationSaved.value = null
  marketSnapshot.value = null
  marketStatus.value = 'idle'
  marketError.value = ''
  marketRequestId += 1
}

watch(selectedId, (id) => (id ? loadDetail(id) : resetDetail()), { immediate: true })

// 從股票分析切回來：沒有選中的就看最新一筆
watch(tab, (current) => {
  if (current === 'tarot' && !selectedId.value && readings.value[0]) selectReading(readings.value[0].id)
})

// ---- 股市諮詢的行情 ----
async function loadMarket() {
  const question = detail.value?.domain === 'stock' ? detail.value.reading.question : null
  if (question === null) {
    return
  }
  const requestId = (marketRequestId += 1)
  marketStatus.value = 'loading'
  marketError.value = ''
  try {
    const { snapshot } = await fetchMarketSnapshot(question)
    if (requestId === marketRequestId) {
      marketSnapshot.value = snapshot
      marketStatus.value = 'ready'
    }
  } catch (error) {
    if (requestId === marketRequestId) {
      marketError.value = error instanceof Error ? error.message : '行情暫時查不到，請稍後再試。'
      marketStatus.value = 'error'
    }
  }
}

async function refreshMarket() {
  await loadMarket()
  if (marketStatus.value === 'ready') {
    marketIsSaved.value = false
  }
}

// 股市諮詢的舊紀錄沒有存到行情（例如當時沒做 AI 解讀）時，直接查最新的
watch(detail, (current) => {
  if (current?.domain === 'stock' && !marketSnapshot.value) {
    void loadMarket()
  }
})

async function confirmDelete(id: string) {
  const ok = await confirmDialog({ title: '刪除紀錄', message: '確定要刪除這筆占卜紀錄嗎？刪除後無法復原。', confirmText: '刪除', danger: true })
  if (!ok) return

  deletingId.value = id
  deleteError.value = ''

  try {
    await deleteReading(id)

    // 刪掉後改看相鄰的下一筆，沒有就看上一筆
    const index = readings.value.findIndex((item) => item.id === id)
    const neighbor = index === -1 ? readings.value[0] : readings.value[index + 1] || readings.value[index - 1]
    readings.value = readings.value.filter((item) => item.id !== id)
    if (neighbor && neighbor.id !== id) {
      selectReading(neighbor.id)
    } else {
      clearSelection()
    }
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '刪除失敗'
  } finally {
    deletingId.value = ''
  }
}

function cancelNarration() {
  narrationController?.abort()
  narrationController = null
}

async function requestNarration() {
  const current = detail.value
  if (!current || !canUseAi.value) {
    return
  }
  const isNarrating = narrationStatus.value === 'loading' || narrationStatus.value === 'streaming'
  if (isNarrating) {
    return
  }

  cancelNarration()
  const controller = new AbortController()
  narrationController = controller
  narrationText.value = ''
  narrationError.value = ''
  narrationSaved.value = null
  // 行情不清掉：AI 開始寫之前畫面上照樣有數字，收到 AI 用的那一份再換掉
  narrationStatus.value = 'loading'

  try {
    const { saved } = await streamNarration(current.reading, {
      signal: controller.signal,
      domain: current.domain || undefined,
      // 回顧舊紀錄時 reading 本身沒有 id，要用紀錄的 id，解讀才會存回同一筆
      readingId: current.id,
      onMarket: (snapshot) => {
        if (controller === narrationController) {
          // AI 用的是這一份，畫面跟著換成同一份，兩邊講的數字才會一致
          marketRequestId += 1
          marketSnapshot.value = snapshot
          marketStatus.value = 'ready'
          marketError.value = ''
          marketIsSaved.value = false
        }
      },
      onDelta: (text) => {
        if (controller === narrationController) {
          narrationText.value += text
          narrationStatus.value = 'streaming'
        }
      },
    })
    if (controller === narrationController) {
      narrationStatus.value = 'done'
      narrationSaved.value = saved
      // 後端已把文字存進這筆紀錄（重新產生時是覆蓋同一筆），讓「有 AI 解讀」篩選跟著更新。
      // 明確回報失敗時不改；舊版後端回 null，照舊當成有存
      const summary = readings.value.find((item) => item.id === current.id)
      if (summary && saved !== false) {
        summary.hasNarration = true
      }
    }
  } catch (error) {
    if (controller !== narrationController) {
      return
    }
    narrationError.value = error instanceof Error ? error.message : 'AI 解讀暫時無法使用'
    narrationStatus.value = 'error'
  } finally {
    if (controller === narrationController) {
      narrationController = null
    }
  }
}

function stopNarration() {
  cancelNarration()
  narrationStatus.value = narrationText.value ? 'stopped' : 'ready'
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { hour12: false })
}

onMounted(async () => {
  await loadList()
  try {
    spreads.value = await fetchSpreads()
  } catch {
    // 牌陣載不到只是少了排列圖，牌義與分析照常顯示
  }
})

onBeforeUnmount(() => {
  // 離開頁面時停止 AI 生成，避免繼續計費
  cancelNarration()
})
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 flex-col gap-6 py-4">
    <header class="rounded-[2rem] border border-tint/10 bg-surface p-6">
      <p class="text-caption uppercase tracking-[0.35em] text-accent">{{ HEADINGS[tab].eyebrow }}</p>
      <h1 class="mt-2 text-display font-semibold text-ink">{{ HEADINGS[tab].title }}</h1>
      <p v-if="tab === 'news'" class="mt-1 text-body text-ink-muted">
        在「股市追蹤」的「財經新聞」分頁跑過的 AI 影響分析會留在這裡，最多 30 份；股市頁只顯示今天最新的一份。
        每一份都留著當時交給 AI 的新聞，點文中的小編號可以對回原始新聞。
      </p>
      <p v-else-if="tab === 'stock'" class="mt-1 text-body text-ink-muted">
        在「股市追蹤」的個股分析裡跑過的 AI 深度分析會留在這裡，最多 100 筆。每一筆都留著當時的行情與持股，
        回頭看得出 AI 是根據什麼寫的。
      </p>
      <p v-else class="mt-1 text-body text-ink-muted">
        在結果頁按「保存紀錄」的占卜會留在這裡，最多 100 筆。從清單選一筆，就能重看當時的牌與分析；
        保存時已經產生的 AI 解讀會一併留著，沒用過的也還能在這裡請 AI 解讀。
      </p>

      <!-- 紀錄類別：一排等寬的分段切換（像素框），選中的那格亮琥珀色、底下一道粗線；手機也不換行 -->
      <div
        v-if="canUseStock"
        class="mt-5 grid grid-cols-3 border-2 border-frame bg-sink/25 shadow-[3px_3px_0_var(--c-shade)]"
        role="tablist"
        aria-label="紀錄類別"
      >
        <button
          v-for="(option, index) in TABS"
          :key="option.value"
          type="button"
          role="tab"
          :aria-selected="tab === option.value"
          class="relative min-w-0 cursor-pointer touch-manipulation truncate px-2 py-2.5 text-center font-pixel text-button transition-colors active:bg-tint/15"
          :class="[
            index > 0 ? 'border-l-2 border-frame' : '',
            tab === option.value
              ? 'bg-selected text-on-selected after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-accent-hue'
              : 'text-ink-muted hover:bg-tint/5 hover:text-ink-soft',
          ]"
          @click="switchTab(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </header>

    <StockAnalysisHistory v-if="tab === 'stock'" />
    <FinanceNewsAnalysisHistory v-else-if="tab === 'news'" />

    <template v-else>

    <div
      v-if="listError"
      class="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger"
    >
      <span>{{ listError }}</span>
      <button
        type="button"
        class="cursor-pointer rounded-full border border-danger-hue/30 px-4 py-1.5 text-button text-danger transition hover:bg-danger-hue/15"
        :disabled="isListLoading"
        @click="loadList"
      >
        重試
      </button>
    </div>

    <!--
      桌機上左邊的索引標籤緊貼著菜單，中間不留空。
      清單載入失敗、一筆都沒拿到時整塊不顯示，只留上面的錯誤訊息與重試，不要擺一個空的菜單框
    -->
    <div v-if="isListLoaded || !listError" class="flex min-w-0 items-start gap-6 lg:gap-0">
      <!-- 左欄：共用外框（桌機可收合、手機滿版抽屜），清單用共用的索引標籤 -->
      <RecordListShell v-model:open="isMobileIndexOpen" label="紀錄清單" :count="readings.length" collapse-key="tarot_history_index_collapsed">
        <!-- 骨架照著真正的列排：標題兩行、底下一行資訊，載完不會換高度 -->
        <div v-if="isListLoading && !isListLoaded" class="space-y-2">
          <div v-for="n in 4" :key="n" class="rounded-2xl border border-tint/10 bg-tint/5 px-4 py-3">
            <SkeletonBlock class="h-4 w-full rounded-full" />
            <SkeletonBlock class="mt-2 h-4 w-3/5 rounded-full" />
            <SkeletonBlock class="mt-2.5 h-3 w-28 rounded-full" />
          </div>
        </div>
        <p v-else-if="isEmpty" class="px-1 text-body text-ink-muted">還沒有紀錄</p>
        <ReadingHistoryIndex v-else-if="isListLoaded" :readings="readings" :selected-id="selectedId" @select="selectReading" />
      </RecordListShell>

      <!-- 右欄：所選紀錄的內容 -->
      <!--
        右側的紀錄內容放在桌上的和紙菜單上（計畫書 2.8.4）：外圍是米白和紙、深木色粗框，
        裡面墊一塊深黑藍的內頁，內容和首頁結果頁共用元件，維持原本的深底淺字
        （之前用反轉濾鏡把內容變成淺底深字，使用者偏好內頁維持深色，已拿掉）
      -->
      <section class="min-w-0 flex-1 border-4 border-frame bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] [image-rendering:pixelated] p-3 shadow-[6px_6px_0_var(--c-shade)] sm:p-5">
        <div class="space-y-4 border-2 border-frame bg-surface p-3 [image-rendering:auto] sm:p-5">
        <button
          v-if="isListLoaded && !isEmpty"
          type="button"
          class="w-full cursor-pointer rounded-full border border-tint/15 bg-tint/5 px-4 py-2 text-button text-ink-soft transition hover:bg-tint/10 lg:hidden"
          @click="isMobileIndexOpen = true"
        >
          開啟紀錄清單（共 {{ readings.length }} 筆）
        </button>

        <div
          v-if="isEmpty"
          class="rounded-[1.75rem] border border-dashed border-tint/15 bg-sink/10 px-5 py-14 text-center"
        >
          <p class="text-subtitle text-ink-soft">還沒有占卜紀錄</p>
          <p class="mt-2 text-body text-ink-muted">
            占卜後在結果頁按「保存紀錄」，那次的牌與分析就會出現在這裡。
          </p>
          <router-link
            :to="{ name: 'home' }"
            class="mt-6 inline-block cursor-pointer rounded-full border border-accent-hue/40 bg-accent-hue/15 px-6 py-3 text-button font-medium text-accent transition hover:bg-accent-hue/25"
          >
            立即占卜
          </router-link>
        </div>

        <template v-else-if="selectedId">
          <!-- 骨架照著結果頁的版面排：日期列、標題、牌陣框、牌卡，資料進來時版面不會整個跳一次 -->
          <div v-if="isDetailLoading" class="space-y-4 sm:space-y-6">
            <div class="flex items-center justify-between gap-3">
              <SkeletonBlock class="h-4 w-56 max-w-[60%] rounded-full" />
              <SkeletonBlock class="h-8 w-16 rounded-full" />
            </div>

            <div class="space-y-3 border-b border-tint/10 pb-4 sm:space-y-4 sm:pb-6">
              <SkeletonBlock class="h-3 w-24 rounded-full" />
              <SkeletonBlock class="h-8 w-48 sm:h-9 sm:w-64" />
              <SkeletonBlock class="h-5 w-full max-w-xl rounded-full" />
            </div>

            <div class="rounded-[1.5rem] border border-tint/10 bg-sink/45 p-3 sm:rounded-[1.75rem] sm:p-5">
              <SkeletonBlock class="mb-3 h-3 w-20 rounded-full" />
              <div class="flex flex-wrap justify-center gap-1.5 sm:gap-3">
                <SkeletonBlock
                  v-for="n in skeletonCardCount"
                  :key="n"
                  class="h-24 w-16 sm:h-28 sm:w-20 lg:h-40 lg:w-28"
                />
              </div>
            </div>

            <div class="grid min-w-0 gap-4 xl:grid-cols-2">
              <div
                v-for="n in skeletonPanelCount"
                :key="n"
                class="rounded-[1.5rem] border border-tint/10 bg-tint/5 p-4 sm:p-5"
              >
                <div class="flex gap-3 sm:gap-4">
                  <SkeletonBlock class="h-20 w-[3.25rem] flex-shrink-0 sm:h-24 sm:w-16" />
                  <div class="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock class="h-3 w-12 rounded-full" />
                    <SkeletonBlock class="h-6 w-28 sm:h-7 sm:w-32" />
                    <SkeletonBlock class="h-3 w-20 rounded-full" />
                  </div>
                </div>
                <div class="mt-4 space-y-2">
                  <SkeletonBlock class="h-3 w-full rounded-full" />
                  <SkeletonBlock class="h-3 w-5/6 rounded-full" />
                  <SkeletonBlock class="h-3 w-4/6 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <p
            v-else-if="detailError"
            class="rounded-3xl border border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger"
          >
            {{ detailError }}
          </p>

          <template v-else-if="detail">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-body text-ink-muted">
                {{ formatDate(detail.createdAt) }}・{{ detail.reading.spread.name || '自選牌' }}・{{
                  detail.reading.cards.length
                }}
                張
              </p>
              <button
                class="cursor-pointer rounded-full border border-tint/15 px-4 py-1.5 text-button text-up-ink transition hover:bg-up-hue/10 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                :disabled="deletingId === detail.id"
                @click="confirmDelete(detail.id)"
              >
                {{ deletingId === detail.id ? '刪除中…' : '刪除' }}
              </button>
            </div>

            <p
              v-if="deleteError"
              class="rounded-3xl border border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger"
            >
              {{ deleteError }}
            </p>

            <StepResult
              :reading="detail.reading"
              :result-spread="detailSpread"
              :narration-status="narrationStatus"
              :narration-text="narrationText"
              :narration-error="narrationError"
              :narration-saved="narrationSaved"
              :stock-mode="detail.domain === 'stock'"
              :market="marketSnapshot"
              :market-status="marketStatus"
              :market-error="marketError"
              :market-is-saved="marketIsSaved"
              @refresh-market="refreshMarket"
              is-record
              hide-flow-actions
              @request-narration="requestNarration"
              @stop-narration="stopNarration"
            />
          </template>
        </template>

        <div
          v-else-if="isListLoading"
          class="space-y-3 rounded-[1.75rem] border border-tint/10 bg-tint/5 p-6"
        >
          <SkeletonBlock class="h-6 w-40" />
          <SkeletonBlock class="h-3 w-full rounded-full" />
          <SkeletonBlock class="h-3 w-4/5 rounded-full" />
        </div>

        <p
          v-else-if="isListLoaded"
          class="rounded-[1.75rem] border border-dashed border-tint/15 bg-sink/10 px-5 py-10 text-center text-body text-ink-muted"
        >
          從清單選一筆紀錄來看
        </p>
        </div>
      </section>
    </div>
    </template>
  </div>
</template>
