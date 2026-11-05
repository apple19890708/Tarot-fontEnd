<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { fetchStockAnalysis, streamStockAnalysis } from '../../lib/api'
import { canUseAi } from '../../lib/auth'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import MarketPanel from '../MarketPanel.vue'
import MarketNewsList from './MarketNewsList.vue'
import StockAiText from './StockAiText.vue'
import StockHoldingSummary from './StockHoldingSummary.vue'
import type { MarketSnapshot, MarketStatus, StockAnalysisQuota, StockAnalysisView } from '../../types'

// 個股分析彈窗（v17 規格 F）：一次看完這檔的完整分析（沿用股市諮詢的 MarketPanel），
// 有 AI 權限的人可以再要求 AI 深度分析。AI 只在按下按鈕時執行，放行與次數限制在後端
const props = defineProps<{ watchId: string; name: string }>()
const emit = defineEmits<{ close: [] }>()

// ---- 分析資料（不呼叫 AI）----
const view = ref<StockAnalysisView | null>(null)
const status = ref<MarketStatus>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchStockAnalysis(props.watchId)
    if (id !== requestId) return
    view.value = result.analysis
    quota.value = result.analysis.quota
    // 還沒跑過（或正在跑）時不蓋掉畫面上的文字
    if (aiStatus.value === 'idle' && result.analysis.latest) {
      aiText.value = result.analysis.latest.text
      aiTime.value = result.analysis.latest.createdAt
      aiRecordId.value = result.analysis.latest.id
    }
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '分析資料暫時讀不到，請稍後再試。'
    status.value = 'error'
  }
}

// MarketPanel 吃的是股市諮詢的快照格式
const snapshot = computed<MarketSnapshot | null>(() =>
  view.value ? { asOf: view.value.asOf, items: view.value.item ? [view.value.item] : [], notes: view.value.notes } : null,
)

function monthText(month: string) {
  const [y, m] = month.split('-')
  return `${y} 年 ${Number(m)} 月`
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-300'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

// ---- AI 深度分析（會計費）----
type AiStatus = 'idle' | 'streaming' | 'done' | 'stopped' | 'error'
const aiStatus = ref<AiStatus>('idle')
const aiText = ref('')
const aiTime = ref('')
const aiError = ref('')
// 完整產生後存成的紀錄 id；存檔失敗時為空
const aiRecordId = ref('')
const aiSaveFailed = ref(false)
const quota = ref<StockAnalysisQuota | null>(null)
let controller: AbortController | null = null

// 冷卻倒數：後端給的 retryAt，每秒更新一次剩餘時間
const nowMs = ref(Date.now())
const clock = setInterval(() => (nowMs.value = Date.now()), 1000)
const retryIn = computed(() => {
  const at = quota.value?.retryAt ? Date.parse(quota.value.retryAt) : 0
  return Math.max(0, Math.ceil((at - nowMs.value) / 1000))
})
const retryText = computed(() => `${Math.floor(retryIn.value / 60)}:${String(retryIn.value % 60).padStart(2, '0')}`)
const usedUp = computed(() => quota.value !== null && quota.value.dailyLimit !== null && quota.value.usedToday >= quota.value.dailyLimit)
const canRun = computed(() => aiStatus.value !== 'streaming' && retryIn.value === 0 && !usedUp.value && Boolean(view.value?.item))

async function runAi() {
  if (!canRun.value) return
  controller = new AbortController()
  const ownController = controller
  aiStatus.value = 'streaming'
  aiText.value = ''
  aiTime.value = ''
  aiError.value = ''
  aiRecordId.value = ''
  aiSaveFailed.value = false
  try {
    const result = await streamStockAnalysis(props.watchId, {
      signal: ownController.signal,
      onDelta: (text) => {
        if (controller === ownController) aiText.value += text
      },
    })
    if (controller !== ownController) return
    aiStatus.value = 'done'
    aiTime.value = result.analysis?.createdAt ?? new Date().toISOString()
    aiRecordId.value = result.analysis?.id ?? ''
    aiSaveFailed.value = !result.analysis
  } catch (err) {
    if (controller !== ownController) return
    if (err instanceof DOMException && err.name === 'AbortError') {
      aiStatus.value = 'stopped'
    } else {
      // 403（沒有權限）、429（冷卻或今天用完）都把後端的原因直接顯示出來
      aiError.value = err instanceof Error ? err.message : 'AI 分析失敗，請再試一次。'
      aiStatus.value = 'error'
    }
  } finally {
    if (controller === ownController) controller = null
    // 更新額度與冷卻時間
    void refreshQuota()
  }
}

function stopAi() {
  controller?.abort()
}

async function refreshQuota() {
  try {
    const result = await fetchStockAnalysis(props.watchId)
    quota.value = result.analysis.quota
  } catch {
    // 額度只是提示，讀不到不影響畫面
  }
}

const aiTimeText = computed(() =>
  aiTime.value
    ? new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(aiTime.value))
    : '',
)

const runLabel = computed(() => {
  if (aiStatus.value === 'streaming') return '分析中…'
  if (retryIn.value > 0) return `${retryText.value} 後可再分析`
  return aiText.value ? '重新分析' : 'AI 深度分析'
})

// ---- 開關 ----
function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
})

// 換另一檔：舊的請求與 AI 串流一律作廢
watch(
  () => props.watchId,
  () => {
    controller?.abort()
    controller = null
    aiStatus.value = 'idle'
    aiText.value = ''
    aiTime.value = ''
    aiRecordId.value = ''
    view.value = null
    void load()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearInterval(clock)
  // 關閉彈窗就停止 AI（後端會跟著停止計費）
  controller?.abort()
  controller = null
  requestId += 1
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-black/70 md:p-6" @click.self="close">
      <div
        class="flex h-full w-full flex-col bg-[#0f1526] text-stone-100 md:h-auto md:max-h-[90vh] md:max-w-4xl md:border-2 md:border-[#3b2618] md:shadow-[6px_6px_0_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        :aria-label="`${name} 個股分析`"
      >
        <div class="flex items-start justify-between gap-3 border-b-2 border-[#3b2618] px-4 py-3">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-[0.2em] text-stone-400">Stock Analysis</p>
            <p class="truncate font-pixel text-[12px] text-amber-100">{{ name }} · 個股分析</p>
          </div>
          <button
            type="button"
            class="-mr-1 shrink-0 cursor-pointer border-2 border-white/10 px-3 py-1.5 font-pixel text-[12px] text-stone-200 transition hover:bg-white/10 active:translate-x-[2px] active:translate-y-[2px]"
            @click="close"
          >
            關閉
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <!-- 行情、走勢、籌碼、回測、操作建議：和股市諮詢結果頁同一個元件 -->
          <MarketPanel :snapshot="snapshot" :status="status" :error="error" @refresh="load" />

          <template v-if="view">
            <!-- 我的持股 -->
            <section v-if="view.holding" class="border-2 border-white/10 bg-white/5 p-4">
              <p class="mb-3 font-pixel text-[12px] text-stone-200">我的持股</p>
              <StockHoldingSummary :holding="view.holding" />
            </section>

            <!-- 近期事件與重大訊息（台股個股才有） -->
            <section
              v-if="view.events?.exDividend || view.events?.revenue || view.news.length"
              class="space-y-2 border-2 border-white/10 bg-white/5 p-4 text-xs leading-5"
            >
              <p class="font-pixel text-[12px] text-stone-200">近期事件</p>
              <p v-if="view.events?.exDividend" class="tabular-nums text-stone-300">
                <span class="text-amber-100">{{ view.events.exDividend.date }} 除{{ view.events.exDividend.type }}</span>
                <template v-if="view.events.exDividend.cashDividend">，每股現金 {{ formatNumber(view.events.exDividend.cashDividend, 4) }} 元</template>
                <template v-if="view.events.exDividend.stockRatio">，配股 {{ formatNumber(view.events.exDividend.stockRatio * 1000, 2) }} 股／張</template>
              </p>
              <p v-if="view.events?.revenue" class="tabular-nums text-stone-300">
                {{ monthText(view.events.revenue.month) }}營收 年增
                <span :class="trendClass(view.events.revenue.yoy)">{{ formatSigned(view.events.revenue.yoy, '%') }}</span>
                ・月增 <span :class="trendClass(view.events.revenue.mom)">{{ formatSigned(view.events.revenue.mom, '%') }}</span>
                ・累計年增 <span :class="trendClass(view.events.revenue.cumYoy)">{{ formatSigned(view.events.revenue.cumYoy, '%') }}</span>
              </p>
              <div v-if="view.news.length" class="border-t border-white/10 pt-2">
                <p class="text-stone-400">重大訊息（最近 {{ view.news.length }} 則）</p>
                <MarketNewsList class="mt-1" :news="view.news" />
              </div>
            </section>
          </template>

          <!-- AI 深度分析 -->
          <section class="border-2 border-amber-200/25 bg-amber-200/5 p-4" aria-live="polite">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-pixel text-[12px] text-amber-100">AI 深度分析</p>
                <p class="mt-1 text-[11px] text-stone-400">
                  <template v-if="!canUseAi">AI 分析需要管理者開通，請聯絡管理者。</template>
                  <template v-else-if="quota && quota.dailyLimit !== null">今天已用 {{ quota.usedToday }}／{{ quota.dailyLimit }} 次</template>
                  <template v-else-if="quota">今天已用 {{ quota.usedToday }} 次</template>
                  <template v-if="canUseAi && aiTimeText && aiStatus !== 'streaming'"> · 這份分析產生於 {{ aiTimeText }}</template>
                </p>
              </div>
              <div v-if="canUseAi" class="flex gap-2">
                <button
                  v-if="aiStatus === 'streaming'"
                  type="button"
                  class="cursor-pointer border-2 border-white/15 px-3 py-1 font-pixel text-[12px] text-stone-200 transition hover:bg-white/10"
                  @click="stopAi"
                >
                  停止
                </button>
                <button
                  type="button"
                  class="cursor-pointer border-2 border-amber-200/40 bg-amber-200/10 px-3 py-1 font-pixel text-[12px] text-amber-50 transition hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-[2px] active:translate-y-[2px]"
                  :disabled="!canRun"
                  @click="runAi"
                >
                  {{ runLabel }}
                </button>
              </div>
            </div>

            <p v-if="canUseAi && usedUp && aiStatus !== 'streaming'" class="mt-3 text-xs text-amber-100/80">今天的 AI 分析已用完，明天再試。</p>
            <p v-if="aiError" class="mt-3 border-2 border-rose-200/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{{ aiError }}</p>
            <p v-if="aiStatus === 'stopped'" class="mt-3 text-xs text-amber-100/80">已停止，這份分析沒有完成，不會存進紀錄。</p>
            <p v-if="aiStatus === 'streaming' && !aiText" class="mt-3 text-xs text-stone-400">AI 正在讀資料，通常要 30 秒到 1 分鐘…</p>

            <StockAiText v-if="aiText" class="mt-4" :text="aiText" />

            <p v-if="aiStatus === 'done' && aiRecordId" class="mt-4 text-xs text-stone-400">
              已存到
              <router-link :to="{ name: 'history', query: { tab: 'stock', id: aiRecordId } }" @click="close" class="text-amber-200 underline underline-offset-2 hover:text-amber-100">
                我的紀錄 › 股票分析
              </router-link>
            </p>
            <p v-if="aiStatus === 'done' && aiSaveFailed" class="mt-4 text-xs text-rose-200">這份分析沒有存進紀錄，關掉彈窗就看不到了。</p>
            <p v-if="!canUseAi || aiText" class="mt-3 text-[11px] text-stone-500">AI 只根據上面的資料撰寫，僅供參考，不是投資建議。</p>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
