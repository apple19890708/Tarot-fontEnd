<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ReadingHistoryIndex from '../components/ReadingHistoryIndex.vue'
import StepResult from '../components/StepResult.vue'
import {
  deleteReading,
  fetchReadingDetail,
  fetchReadingHistory,
  fetchSpreads,
  streamNarration,
} from '../lib/api'
import { canUseAi } from '../lib/auth'
import type { NarrationStatus, ReadingDetail, ReadingSummary, Spread } from '../types'

// 每人最多 100 筆、摘要很小，左欄一次載完（後端每頁上限 50），篩選才涵蓋全部紀錄
const LIST_PAGE_SIZE = 50
const COLLAPSED_KEY = 'tarot_history_index_collapsed'

const route = useRoute()
const router = useRouter()

const readings = ref<ReadingSummary[]>([])
const isListLoading = ref(false)
const listError = ref('')
// 確定載入成功過才算數；載入中或失敗都不能當成「沒有紀錄」
const isListLoaded = ref(false)

const spreads = ref<Spread[]>([])

// 選中的那一筆放在網址（?id=），重新整理還是同一筆
const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))

const detail = ref<ReadingDetail | null>(null)
const isDetailLoading = ref(false)
const detailError = ref('')

// 刪除採二段式：第一次點變成「確定刪除」，再點才真的送出
const pendingDeleteId = ref('')
const deletingId = ref('')
const deleteError = ref('')

// ---- 版面：桌機兩欄、左欄可收合；手機清單滿版，選了就收合 ----
const desktopQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 64rem)') : null
const isDesktop = ref(desktopQuery?.matches ?? true)
const isIndexCollapsed = ref(readCollapsed())
const isMobileIndexOpen = ref(false)

// ---- AI 解讀（沒用過的紀錄仍可補做）----
const narrationText = ref('')
const narrationStatus = ref<NarrationStatus>('idle')
const narrationError = ref('')
let narrationController: AbortController | null = null

const isEmpty = computed(() => isListLoaded.value && readings.value.length === 0)
const showRail = computed(() => isDesktop.value && isIndexCollapsed.value)

// 結果頁的排列圖需要完整牌陣定義，結果本身只帶 key
const detailSpread = computed(
  () => spreads.value.find((spread) => spread.key === detail.value?.reading.spread.key) || null,
)

// 無痕視窗或封鎖儲存時 localStorage 會丟例外，當成沒有偏好（展開）
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function toggleIndex() {
  isIndexCollapsed.value = !isIndexCollapsed.value
  try {
    localStorage.setItem(COLLAPSED_KEY, isIndexCollapsed.value ? '1' : '0')
  } catch {
    // 存不了只是下次不記得，不影響功能
  }
}

function onDesktopChange(event: MediaQueryListEvent) {
  isDesktop.value = event.matches
  if (event.matches) {
    isMobileIndexOpen.value = false
  }
}

// 手機清單滿版時，背後的頁面不要跟著捲
watch(
  () => isMobileIndexOpen.value && !isDesktop.value,
  (locked) => document.body.classList.toggle('overflow-hidden', locked),
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

    // 網址沒指定時預設看最新一筆
    if (!selectedId.value && readings.value[0]) {
      selectReading(readings.value[0].id)
    }
  } catch (error) {
    if (requestId !== listRequestId) {
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
  if (!isDesktop.value) {
    window.scrollTo({ top: 0 })
  }
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
  pendingDeleteId.value = ''
  isDetailLoading.value = true
  narrationText.value = ''
  narrationError.value = ''
  narrationStatus.value = 'idle'

  try {
    const response = await fetchReadingDetail(id)
    if (requestId !== detailRequestId) {
      return
    }
    detail.value = response
    // 當初用過 AI 就直接顯示存下來的那一份；沒用過的留著「請 AI 解讀」的選項
    if (response.narration) {
      narrationText.value = response.narration.text
      narrationStatus.value = 'done'
    } else {
      narrationStatus.value = response.reading.analysis ? 'ready' : 'idle'
    }
  } catch (error) {
    if (requestId !== detailRequestId) {
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
}

watch(selectedId, (id) => (id ? loadDetail(id) : resetDetail()), { immediate: true })

async function confirmDelete(id: string) {
  if (pendingDeleteId.value !== id) {
    pendingDeleteId.value = id
    return
  }

  deletingId.value = id
  deleteError.value = ''

  try {
    await deleteReading(id)
    pendingDeleteId.value = ''

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
  narrationStatus.value = 'loading'

  try {
    await streamNarration(current.reading, {
      signal: controller.signal,
      domain: current.domain || undefined,
      // 回顧舊紀錄時 reading 本身沒有 id，要用紀錄的 id，解讀才會存回同一筆
      readingId: current.id,
      onDelta: (text) => {
        if (controller === narrationController) {
          narrationText.value += text
          narrationStatus.value = 'streaming'
        }
      },
    })
    if (controller === narrationController) {
      narrationStatus.value = 'done'
      // 後端已把文字存進這筆紀錄，讓「有 AI 解讀」篩選跟著更新
      const summary = readings.value.find((item) => item.id === current.id)
      if (summary) {
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
  desktopQuery?.addEventListener('change', onDesktopChange)
  await loadList()
  try {
    spreads.value = await fetchSpreads()
  } catch {
    // 牌陣載不到只是少了排列圖，牌義與分析照常顯示
  }
})

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener('change', onDesktopChange)
  document.body.classList.remove('overflow-hidden')
  // 離開頁面時停止 AI 生成，避免繼續計費
  cancelNarration()
})
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 flex-col gap-6 py-4">
    <header class="rounded-[2rem] border border-white/10 bg-white/8 p-6 backdrop-blur">
      <p class="text-xs uppercase tracking-[0.35em] text-amber-100/70">Reading History</p>
      <h1 class="mt-2 text-2xl font-semibold text-stone-50">我的占卜紀錄</h1>
      <p class="mt-1 text-sm leading-6 text-stone-300/75">
        在結果頁按「保存紀錄」的占卜會留在這裡，最多 100 筆。從清單選一筆，就能重看當時的牌與分析；
        保存時已經產生的 AI 解讀會一併留著，沒用過的也還能在這裡請 AI 解讀。
      </p>
    </header>

    <div
      v-if="listError"
      class="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
    >
      <span>{{ listError }}</span>
      <button
        type="button"
        class="cursor-pointer rounded-full border border-rose-200/30 px-4 py-1.5 text-sm text-rose-50 transition hover:bg-rose-300/15"
        :disabled="isListLoading"
        @click="loadList"
      >
        重試
      </button>
    </div>

    <div class="flex min-w-0 items-start gap-6">
      <!-- 左欄：桌機黏在畫面上、可收合成窄欄；手機只在打開時滿版顯示 -->
      <aside
        class="lg:sticky lg:top-5 lg:z-auto lg:flex lg:max-h-[calc(100vh-2.5rem)] lg:shrink-0 lg:rounded-[1.75rem] lg:border lg:border-white/10 lg:bg-white/5"
        :class="[
          isMobileIndexOpen ? 'fixed inset-0 z-40 flex flex-col bg-neutral-950/95 p-5 backdrop-blur' : 'hidden',
          showRail ? 'lg:w-14 lg:flex-col lg:items-center lg:p-2' : 'lg:w-80 lg:flex-col lg:p-4',
        ]"
        aria-label="紀錄清單"
      >
        <template v-if="showRail">
          <button
            type="button"
            class="cursor-pointer rounded-full border border-white/15 px-2 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
            title="展開紀錄清單"
            aria-label="展開紀錄清單"
            @click="toggleIndex"
          >
            »
          </button>
          <span class="mt-3 text-xs text-stone-400 [writing-mode:vertical-rl]">共 {{ readings.length }} 筆</span>
        </template>

        <template v-else>
          <div class="mb-4 flex items-center justify-between gap-3">
            <p class="text-sm font-medium text-stone-100">紀錄清單</p>
            <button
              type="button"
              class="hidden cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs text-stone-200 transition hover:bg-white/10 lg:block"
              @click="toggleIndex"
            >
              « 收合
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-sm text-stone-200 transition hover:bg-white/10 lg:hidden"
              @click="isMobileIndexOpen = false"
            >
              關閉
            </button>
          </div>

          <div v-if="isListLoading && !isListLoaded" class="space-y-2">
            <div v-for="n in 4" :key="n" class="h-16 animate-pulse rounded-2xl bg-white/5" />
          </div>
          <p v-else-if="isEmpty" class="px-1 text-sm text-stone-400">還沒有紀錄</p>
          <ReadingHistoryIndex
            v-else-if="isListLoaded"
            :readings="readings"
            :selected-id="selectedId"
            @select="selectReading"
          />
        </template>
      </aside>

      <!-- 右欄：所選紀錄的內容 -->
      <section class="min-w-0 flex-1 space-y-4">
        <button
          v-if="isListLoaded && !isEmpty"
          type="button"
          class="w-full cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/10 lg:hidden"
          @click="isMobileIndexOpen = true"
        >
          開啟紀錄清單（共 {{ readings.length }} 筆）
        </button>

        <div
          v-if="isEmpty"
          class="rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 px-5 py-14 text-center"
        >
          <p class="text-base text-stone-200">還沒有占卜紀錄</p>
          <p class="mt-2 text-sm leading-6 text-stone-400">
            占卜後在結果頁按「保存紀錄」，那次的牌與分析就會出現在這裡。
          </p>
          <router-link
            :to="{ name: 'home' }"
            class="mt-6 inline-block rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
          >
            立即占卜
          </router-link>
        </div>

        <template v-else-if="selectedId">
          <div v-if="isDetailLoading" class="space-y-3 rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
            <div class="h-3 w-full animate-pulse rounded-full bg-white/10" />
            <div class="h-3 w-10/12 animate-pulse rounded-full bg-white/10" />
            <div class="h-3 w-8/12 animate-pulse rounded-full bg-white/10" />
          </div>

          <p
            v-else-if="detailError"
            class="rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
          >
            {{ detailError }}
          </p>

          <template v-else-if="detail">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-stone-400">
                {{ formatDate(detail.createdAt) }}・{{ detail.reading.spread.name || '自選牌' }}・{{
                  detail.reading.cards.length
                }}
                張
              </p>
              <button
                class="cursor-pointer rounded-full border px-4 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  pendingDeleteId === detail.id
                    ? 'border-rose-300/50 bg-rose-300/15 text-rose-50'
                    : 'border-white/15 text-rose-200/80 hover:bg-rose-300/10'
                "
                type="button"
                :disabled="deletingId === detail.id"
                @click="confirmDelete(detail.id)"
              >
                {{ deletingId === detail.id ? '刪除中…' : pendingDeleteId === detail.id ? '確定刪除？' : '刪除' }}
              </button>
            </div>

            <p
              v-if="deleteError"
              class="rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
            >
              {{ deleteError }}
            </p>

            <StepResult
              :reading="detail.reading"
              :result-spread="detailSpread"
              :narration-status="narrationStatus"
              :narration-text="narrationText"
              :narration-error="narrationError"
              hide-flow-actions
              @request-narration="requestNarration"
              @stop-narration="stopNarration"
            />
          </template>
        </template>

        <div v-else-if="isListLoading" class="h-40 animate-pulse rounded-[1.75rem] bg-white/5" />

        <p
          v-else-if="isListLoaded"
          class="rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 px-5 py-10 text-center text-sm text-stone-400"
        >
          從清單選一筆紀錄來看
        </p>
      </section>
    </div>
  </div>
</template>
