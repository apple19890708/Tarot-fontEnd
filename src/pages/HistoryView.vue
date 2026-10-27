<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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

const PAGE_SIZE = 10

const readings = ref<ReadingSummary[]>([])
const total = ref(0)
const page = ref(1)
const isLoading = ref(false)
const errorMessage = ref('')

const spreads = ref<Spread[]>([])

// 展開中的那一筆。詳情要回後端重算分析，所以點開才載入
const detail = ref<ReadingDetail | null>(null)
const detailId = ref('')
const isDetailLoading = ref(false)
const detailError = ref('')

// 刪除採二段式：第一次點變成「確定刪除」，再點才真的送出
const pendingDeleteId = ref('')
const deletingId = ref('')

// ---- AI 解讀（沒用過的紀錄仍可補做）----
const narrationText = ref('')
const narrationStatus = ref<NarrationStatus>('idle')
const narrationError = ref('')
let narrationController: AbortController | null = null

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

// 結果頁的排列圖需要完整牌陣定義，結果本身只帶 key
const detailSpread = computed(
  () => spreads.value.find((spread) => spread.key === detail.value?.reading.spread.key) || null,
)

// 同一頁可能被連點多次（換頁、刪除後重載），只認最後一次的回應
let listRequestId = 0

async function loadList() {
  const requestId = (listRequestId += 1)
  isLoading.value = true
  errorMessage.value = ''

  try {
    const response = await fetchReadingHistory({ page: page.value, pageSize: PAGE_SIZE })
    if (requestId !== listRequestId) {
      return
    }
    readings.value = response.readings
    total.value = response.total

    // 刪到整頁空掉時往前一頁，不要停在空白頁
    if (readings.value.length === 0 && page.value > 1) {
      page.value -= 1
      await loadList()
    }
  } catch (error) {
    if (requestId !== listRequestId) {
      return
    }
    errorMessage.value = error instanceof Error ? error.message : '無法載入占卜紀錄'
  } finally {
    if (requestId === listRequestId) {
      isLoading.value = false
    }
  }
}

let detailRequestId = 0

async function openDetail(id: string) {
  if (detailId.value === id) {
    closeDetail()
    return
  }

  cancelNarration()
  const requestId = (detailRequestId += 1)
  detailId.value = id
  detail.value = null
  detailError.value = ''
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
    detailError.value = error instanceof Error ? error.message : '無法載入這筆紀錄'
  } finally {
    if (requestId === detailRequestId) {
      isDetailLoading.value = false
    }
  }
}

function closeDetail() {
  cancelNarration()
  detailId.value = ''
  detail.value = null
  detailError.value = ''
  narrationText.value = ''
  narrationStatus.value = 'idle'
}

async function confirmDelete(id: string) {
  if (pendingDeleteId.value !== id) {
    pendingDeleteId.value = id
    return
  }

  deletingId.value = id
  errorMessage.value = ''

  try {
    await deleteReading(id)
    if (detailId.value === id) {
      closeDetail()
    }
    pendingDeleteId.value = ''
    await loadList()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '刪除失敗'
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
      // 後端已把文字存進這筆紀錄，列表的標記跟著更新
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

async function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) {
    return
  }
  closeDetail()
  page.value = next
  await loadList()
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { hour12: false })
}

function cardLabel(card: { nameZh: string; orientation: 'upright' | 'reversed' }) {
  return card.orientation === 'reversed' ? `${card.nameZh}（逆）` : card.nameZh
}

onMounted(async () => {
  await loadList()
  try {
    spreads.value = await fetchSpreads()
  } catch {
    // 牌陣載不到只是少了排列圖，牌義與分析照常顯示
  }
})

// 離開頁面時停止 AI 生成，避免繼續計費
onBeforeUnmount(cancelNarration)
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 py-4">
    <header class="rounded-[2rem] border border-white/10 bg-white/8 p-6 backdrop-blur">
      <p class="text-xs uppercase tracking-[0.35em] text-amber-100/70">Reading History</p>
      <h1 class="mt-2 text-2xl font-semibold text-stone-50">我的占卜紀錄</h1>
      <p class="mt-1 text-sm leading-6 text-stone-300/75">
        在結果頁按「保存紀錄」的占卜會留在這裡，最多 100 筆。點開可以重看當時的牌與分析；
        保存時已經產生的 AI 解讀會一併留著，沒用過的也還能在這裡請 AI 解讀。
      </p>
    </header>

    <p
      v-if="errorMessage"
      class="rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
    >
      {{ errorMessage }}
    </p>

    <div v-if="isLoading && readings.length === 0" class="space-y-3">
      <div v-for="n in 3" :key="n" class="h-20 animate-pulse rounded-[1.75rem] bg-white/5" />
    </div>

    <p
      v-else-if="readings.length === 0"
      class="rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 px-5 py-10 text-center text-sm text-stone-400"
    >
      還沒有占卜紀錄。回到占卜頁抽一次牌，在結果頁按「保存紀錄」就會留在這裡。
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="item in readings"
        :key="item.id"
        class="rounded-[1.75rem] border bg-white/5 p-5 transition"
        :class="detailId === item.id ? 'border-amber-200/40' : 'border-white/10'"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs text-stone-400">
              {{ formatDate(item.createdAt) }}・{{ item.spreadName || '自選牌' }}・{{ item.cardCount }} 張
            </p>
            <p class="mt-1 text-base font-medium leading-relaxed text-amber-50">
              {{ item.question || '未填寫問題' }}
            </p>
            <p class="mt-1 text-sm leading-6 text-stone-300/75">
              {{ item.cards.map(cardLabel).join('、') }}
            </p>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <span
              v-if="item.hasNarration"
              class="rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs text-amber-50"
            >
              已有 AI 解讀
            </span>
            <button
              class="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
              type="button"
              @click="openDetail(item.id)"
            >
              {{ detailId === item.id ? '收合' : '查看' }}
            </button>
            <button
              class="cursor-pointer rounded-full border px-4 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              :class="
                pendingDeleteId === item.id
                  ? 'border-rose-300/50 bg-rose-300/15 text-rose-50'
                  : 'border-white/15 text-rose-200/80 hover:bg-rose-300/10'
              "
              type="button"
              :disabled="deletingId === item.id"
              @click="confirmDelete(item.id)"
            >
              {{ deletingId === item.id ? '刪除中…' : pendingDeleteId === item.id ? '確定刪除？' : '刪除' }}
            </button>
          </div>
        </div>

        <!-- 詳情：分析由後端依當時的牌重算，所以點開才載入 -->
        <div v-if="detailId === item.id" class="mt-5 border-t border-white/10 pt-5">
          <div v-if="isDetailLoading" class="space-y-3">
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

          <StepResult
            v-else-if="detail"
            :reading="detail.reading"
            :result-spread="detailSpread"
            :narration-status="narrationStatus"
            :narration-text="narrationText"
            :narration-error="narrationError"
            hide-flow-actions
            @request-narration="requestNarration"
            @stop-narration="stopNarration"
          />
        </div>
      </li>
    </ul>

    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3">
      <button
        class="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        :disabled="page <= 1 || isLoading"
        @click="goToPage(page - 1)"
      >
        上一頁
      </button>
      <span class="text-sm text-stone-400">第 {{ page }} / {{ totalPages }} 頁・共 {{ total }} 筆</span>
      <button
        class="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        :disabled="page >= totalPages || isLoading"
        @click="goToPage(page + 1)"
      >
        下一頁
      </button>
    </div>
  </div>
</template>
