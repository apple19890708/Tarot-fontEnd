<script setup lang="ts">
// 股票日記頁的左欄（v26 計畫 2-2）：這檔股票的摘要＋所有 AI 分析紀錄（新的在上）。
// 點一張卡展開那次分析的全文（沿用我的紀錄的 StockAnalysisDetail；一次只展開一筆，跳到段落才不會兩筆搶著登記）
import { computed, ref } from 'vue'

import { fetchStockAnalysisRecord } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import type { StockAnalysisRecord, StockAnalysisSummary, StockJournalInfo } from '../../types'
import SkeletonBlock from '../SkeletonBlock.vue'
import StockAnalysisDetail from '../market/StockAnalysisDetail.vue'

const props = defineProps<{
  info: StockJournalInfo | null
  analyses: StockAnalysisSummary[]
  // 日記幾篇（右欄讀完才知道；還沒讀到是 null）
  journalCount: number | null
}>()

const dateOf = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })
}
const trendClass = (value: number | null | undefined) => (!value ? 'text-ink-soft' : value > 0 ? 'text-up' : 'text-down')

// 摘要：分析過幾次、第一次與最近一次的日期與股價
const first = computed(() => props.analyses[props.analyses.length - 1] ?? null)
const latest = computed(() => props.analyses[0] ?? null)

// ---- 展開一筆分析 ----
const openId = ref('')
const details = new Map<string, StockAnalysisRecord>()
const detail = ref<StockAnalysisRecord | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
let request = 0

async function toggle(item: StockAnalysisSummary) {
  if (openId.value === item.id) {
    openId.value = ''
    return
  }
  openId.value = item.id
  detailError.value = ''
  const cached = details.get(item.id)
  if (cached) {
    detail.value = cached
    return
  }
  const own = ++request
  detail.value = null
  detailLoading.value = true
  try {
    const { analysis } = await fetchStockAnalysisRecord(item.id)
    details.set(item.id, analysis)
    if (own === request) detail.value = analysis
  } catch (error) {
    if (own === request) detailError.value = error instanceof Error ? error.message : '讀取失敗，請再試一次。'
  } finally {
    if (own === request) detailLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 這檔的摘要 -->
    <section class="border border-line bg-raised p-3 sm:p-4" aria-label="這檔的摘要">
      <h3 class="text-subtitle font-semibold text-ink">這檔的摘要</h3>
      <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-body">
        <div>
          <dt class="text-caption text-ink-soft">現在股價</dt>
          <dd class="tabular-nums text-ink">{{ info?.quote ? formatNumber(info.quote.price) : '查不到' }}</dd>
        </div>
        <div>
          <dt class="text-caption text-ink-soft">日記</dt>
          <dd class="tabular-nums text-ink">{{ journalCount === null ? '…' : `${journalCount} 篇` }}</dd>
        </div>
        <div>
          <dt class="text-caption text-ink-soft">AI 分析過</dt>
          <dd class="tabular-nums text-ink">{{ analyses.length }} 次</dd>
        </div>
        <div v-if="first">
          <dt class="text-caption text-ink-soft">第一次分析</dt>
          <dd class="tabular-nums text-ink">{{ dateOf(first.createdAt) }}<template v-if="first.quote.price !== null">．{{ formatNumber(first.quote.price) }}</template></dd>
        </div>
        <div v-if="latest && latest !== first">
          <dt class="text-caption text-ink-soft">最近一次分析</dt>
          <dd class="tabular-nums text-ink">{{ dateOf(latest.createdAt) }}<template v-if="latest.quote.price !== null">．{{ formatNumber(latest.quote.price) }}</template></dd>
        </div>
      </dl>
      <p v-if="info && !info.tracked" class="mt-2 text-caption text-ink-soft">這檔沒有在股市追蹤裡；日記照樣能寫。</p>
    </section>

    <!-- 所有分析，新的在上 -->
    <section class="space-y-2" aria-label="這檔的 AI 分析">
      <h3 class="text-subtitle font-semibold text-ink">AI 分析紀錄</h3>
      <p v-if="!analyses.length" class="text-body text-ink-muted">這檔還沒有 AI 分析紀錄（只在股市追蹤裡）。</p>
      <ol class="space-y-2">
        <li v-for="item in analyses" :key="item.id">
          <button
            type="button"
            class="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 border border-line bg-raised px-3 py-2 text-left transition hover:border-accent-hue/40 hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
            :class="openId === item.id ? 'border-accent-hue/50' : ''"
            :aria-expanded="openId === item.id"
            @click="toggle(item)"
          >
            <span class="text-body text-ink">
              <span class="mr-1 inline-block transition" :class="openId === item.id ? 'rotate-90' : ''" aria-hidden="true">▸</span>
              {{ dateOf(item.createdAt) }}
            </span>
            <span class="flex items-center gap-2 text-body tabular-nums">
              <span class="text-ink">{{ item.quote.price !== null ? formatNumber(item.quote.price) : '—' }}</span>
              <span v-if="item.quote.changePct !== null" :class="trendClass(item.quote.changePct)">{{ formatSigned(item.quote.changePct, '%') }}</span>
            </span>
          </button>
          <!-- 展開的全文 -->
          <div v-if="openId === item.id" class="border-x border-b border-line bg-surface p-3 sm:p-4">
            <div v-if="detailLoading" class="space-y-2" aria-hidden="true">
              <SkeletonBlock class="h-6 w-48" />
              <SkeletonBlock v-for="n in 5" :key="n" class="h-3 w-full" />
            </div>
            <p v-else-if="detailError" class="text-body text-danger" role="alert">{{ detailError }}</p>
            <StockAnalysisDetail v-else-if="detail" :detail="detail" />
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>
