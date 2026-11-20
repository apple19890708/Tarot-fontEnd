<script setup lang="ts">
// 一筆股票分析紀錄的內容：標題與當時股價、AI 分析全文、當時的持股、分析依據（當時的行情與指標）。
// 我的紀錄（StockAnalysisHistory）與日記頁（JournalView 左欄）共用（2026-11-20 從 StockAnalysisHistory 抽出來）。
// 掛著的時候向水晶球登記「跳到段落」；捲動用 smoothScrollToElement，在日記頁的左欄裡捲那一欄
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { formatNumber, formatSigned } from '../../lib/marketChart'
import { smoothScrollToElement } from '../../lib/motion'
import { provideSectionNav, type SectionNavItem } from '../../lib/sectionNav'
import type { StockAnalysisRecord } from '../../types'
import MarketPanel from '../MarketPanel.vue'
import StockAiText from './StockAiText.vue'
import StockHoldingSummary from './StockHoldingSummary.vue'

defineProps<{ detail: StockAnalysisRecord }>()

// 台股顯示代號，其他顯示 symbol
function stockIdOf(item: Pick<StockAnalysisRecord, 'target'>) {
  return item.target.market === 'tw' && item.target.kind === 'stock' ? item.target.code : item.target.symbol || item.target.code
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

// ---- 浮動選單的「跳到段落」 ----
const aiEl = ref<HTMLElement | null>(null)
const holdingEl = ref<HTMLElement | null>(null)
const basisEl = ref<HTMLDetailsElement | null>(null)

async function scrollToEl(el: HTMLElement) {
  // 分析依據裡的段落：收合著就先展開
  if (basisEl.value && basisEl.value !== el && basisEl.value.contains(el) && !basisEl.value.open) {
    basisEl.value.open = true
    await nextTick()
  }
  smoothScrollToElement(el)
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
    basisEl.value.querySelectorAll<HTMLElement>('[data-panel-section]').forEach((el) => add(el, el.dataset.panelSection ?? '', 2))
  }
  return items
}

let releaseSectionNav: (() => void) | null = null
onMounted(() => {
  releaseSectionNav = provideSectionNav({ items: collectSections, cardStyle: false })
})
onBeforeUnmount(() => releaseSectionNav?.())
</script>

<template>
  <div class="space-y-4">
    <div class="border-b border-tint/10 pb-4">
      <p class="text-caption uppercase tracking-[0.3em] text-ink-muted">Stock Analysis</p>
      <h2 class="mt-1.5 text-title font-semibold text-ink">
        {{ detail.target.name }}<span class="ml-2 text-caption font-normal text-ink-muted">{{ stockIdOf(detail) }}</span>
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

    <!-- 分析依據：當時交給 AI 的資料，預設收合。MarketPanel 吃股市諮詢的快照格式；紀錄裡存的就是那一份（多了 events） -->
    <details v-if="detail.snapshot" ref="basisEl" class="group border-2 border-tint/10">
      <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-pixel text-[12px] text-ink-soft hover:bg-tint/5 [&::-webkit-details-marker]:hidden">
        <span class="transition group-open:rotate-90">›</span>分析依據（當時的行情與指標）
      </summary>
      <div class="border-t border-tint/10 p-3">
        <!-- 和個股分析彈窗同一種分頁排版（2026-11-12 起，快速占卜的結果頁也是） -->
        <MarketPanel :snapshot="detail.snapshot" status="ready" is-saved hide-refresh tabs />
      </div>
    </details>
  </div>
</template>
