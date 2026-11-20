<script setup lang="ts">
// 日記頁（v26 計畫 2，2026-11-20 使用者要求「寫日記自己獨立一個頁面」）：
// 左邊是原本的內容（塔羅紀錄的結果，或那天的每日一牌），右邊是日記；上面切換「編輯／唯讀」。
// 網址：/journal/reading/<紀錄 id>、/journal/stock/<股票分析 id>（每日一牌的日記 2026-11-20 使用者決定拿掉）；?mode=read 唯讀、?new=1 一進來就打開新的一篇。
// 手機寬度放不下兩欄，改成上方分頁切換「日記／原本的內容」
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SkeletonBlock from '../components/SkeletonBlock.vue'
import StepResult from '../components/StepResult.vue'
import StockAnalysisDetail from '../components/market/StockAnalysisDetail.vue'
import { fetchReadingDetail, fetchSpreads, fetchStockAnalysisRecord } from '../lib/api'
import { spreadForReading } from '../lib/readingSpread'
import { useReadingMarket } from '../lib/useReadingMarket'
import type { ReadingDetail, Spread, StockAnalysisRecord } from '../types'

// 編輯器（Tiptap）較大，分開載入
const JournalTimeline = defineAsyncComponent({
  loader: () => import('../components/journal/JournalTimeline.vue'),
  loadingComponent: SkeletonBlock,
})

const route = useRoute()
const router = useRouter()

// reading＝塔羅紀錄、stock＝股票分析紀錄（2026-11-20 加）
const kind = computed(() => (['reading', 'stock'].includes(String(route.params.kind)) ? (String(route.params.kind) as 'reading' | 'stock') : ''))
const targetId = computed(() => String(route.params.id ?? ''))
const valid = computed(() =>
  kind.value ? /^[a-f0-9]{24}$/i.test(targetId.value) : false,
)
const target = computed(() => `${kind.value}:${targetId.value}`)

// ---- 編輯／唯讀（記在網址，重新整理還是同一個模式）----
// 預設唯讀（2026-11-20 使用者要求）；「寫日記」「寫點什麼」這類入口帶 ?mode=edit&new=1 直接進編輯
const mode = computed<'edit' | 'read'>(() => (route.query.mode === 'edit' ? 'edit' : 'read'))
function setMode(value: 'edit' | 'read') {
  void router.replace({ query: { ...route.query, mode: value === 'edit' ? 'edit' : undefined } })
}
// ?new=1：一進來就打開新的一篇；?entry=<id>：一進來就打開那一篇（唯讀是看、編輯是改，月曆點日記用）。
// 用完從網址拿掉，重新整理不會再開一次
const autoCompose = ref(route.query.new === '1')
const initialEntry = ref(typeof route.query.entry === 'string' ? route.query.entry : '')
onMounted(() => {
  if (route.query.new || route.query.entry) void router.replace({ query: { ...route.query, new: undefined, entry: undefined } })
})

// 手機：分頁切換
const tab = ref<'journal' | 'info'>('journal')

// ---- 桌機：中間的分隔線可以拖曳調整左右寬度（2026-11-20 使用者要求），記在這台瀏覽器 ----
const SPLIT_KEY = 'tarot.journal.split'
// 兩邊都留到能正常排版的寬度（日記的編輯器、占卜結果的牌義卡片）
const SPLIT_MIN = 30
const SPLIT_MAX = 70
const clampSplit = (value: number) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, Math.round(value * 10) / 10))
function readSplit() {
  try {
    const value = Number(localStorage.getItem(SPLIT_KEY))
    return Number.isFinite(value) && value > 0 ? clampSplit(value) : 50
  } catch {
    return 50
  }
}
// 左欄占幾 %
const split = ref(readSplit())
function saveSplit() {
  try {
    localStorage.setItem(SPLIT_KEY, String(split.value))
  } catch {
    // 存不了：下次回到 50%
  }
}
const wideQuery = window.matchMedia('(min-width: 1024px)')
const isWide = ref(wideQuery.matches)
const onWideChange = (event: MediaQueryListEvent) => (isWide.value = event.matches)
onMounted(() => wideQuery.addEventListener('change', onWideChange))
onBeforeUnmount(() => wideQuery.removeEventListener('change', onWideChange))

const gridEl = ref<HTMLElement | null>(null)
const dragging = ref(false)
function onSplitDown(event: PointerEvent) {
  dragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function onSplitMove(event: PointerEvent) {
  if (!dragging.value || !gridEl.value) return
  const rect = gridEl.value.getBoundingClientRect()
  split.value = clampSplit(((event.clientX - rect.left) / rect.width) * 100)
}
function onSplitUp() {
  if (!dragging.value) return
  dragging.value = false
  saveSplit()
}
// 鍵盤：左右鍵每次 2%，Home／End 到最窄／最寬，Enter 回到一半
function onSplitKey(event: KeyboardEvent) {
  const moves: Record<string, number> = { ArrowLeft: split.value - 2, ArrowRight: split.value + 2, Home: SPLIT_MIN, End: SPLIT_MAX, Enter: 50 }
  if (!(event.key in moves)) return
  event.preventDefault()
  split.value = clampSplit(moves[event.key]!)
  saveSplit()
}
// 桌機：兩欄的高度＝視窗高度扣掉上面（頂欄、頁首）與下面的留白，整頁不捲動，兩欄各自捲
const gridTop = ref(0)
const BOTTOM_GAP = 20
function measureGrid() {
  if (!gridEl.value) return
  gridTop.value = gridEl.value.getBoundingClientRect().top + window.scrollY
}
const gridStyle = computed(() =>
  isWide.value
    ? {
        gridTemplateColumns: `minmax(0, ${split.value}fr) 1.5rem minmax(0, ${100 - split.value}fr)`,
        // 太矮的視窗至少留 20rem，再矮就讓整頁捲
        height: `max(20rem, calc(100dvh - ${gridTop.value}px - ${BOTTOM_GAP}px))`,
      }
    : {},
)
// 整頁不要捲軸：只在桌機兩欄時鎖住外層捲動（彈窗的 useScrollLock 會先記下再還原，不衝突）
let savedOverflow: string | null = null
function lockPage(on: boolean) {
  const root = document.documentElement
  if (on && savedOverflow === null) {
    savedOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    window.scrollTo(0, 0)
  } else if (!on && savedOverflow !== null) {
    root.style.overflow = savedOverflow
    savedOverflow = null
  }
}
watch(isWide, (wide) => {
  lockPage(wide)
  void nextTick(measureGrid)
})
function onResize() {
  measureGrid()
}
onMounted(() => {
  lockPage(isWide.value)
  void nextTick(measureGrid)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  lockPage(false)
  window.removeEventListener('resize', onResize)
})

// ---- 左邊：原本的內容 ----
const loading = ref(true)
const loadError = ref('')
const reading = ref<ReadingDetail | null>(null)
const stockRecord = ref<StockAnalysisRecord | null>(null)
const spreads = ref<Spread[]>([])
let loadRequest = 0
// 股市諮詢的行情：和我的紀錄同一套（沒存到就查最新、更新報價有作用）。
// 要寫在下面 immediate 的 watch(target, load) 前面：load 一開始就會用到它
const market = useReadingMarket(reading)
const { snapshot: marketSnapshot, status: marketStatus, error: marketError, isSaved: marketIsSaved } = market

async function load() {
  const own = ++loadRequest
  loading.value = true
  loadError.value = ''
  reading.value = null
  stockRecord.value = null
  market.reset()
  if (!valid.value) {
    loading.value = false
    loadError.value = '找不到這篇日記要寫在哪裡，網址可能不完整。'
    return
  }
  try {
    if (kind.value === 'reading') {
      const [detail, list] = await Promise.all([fetchReadingDetail(targetId.value), fetchSpreads()])
      if (own !== loadRequest) return
      // 先放存下來的那一份，再換 reading：useReadingMarket 的 watch 看到已經有行情就不會多查一次
      market.useSaved(detail.narration?.market ?? null)
      reading.value = detail
      spreads.value = list
    } else {
      const { analysis } = await fetchStockAnalysisRecord(targetId.value)
      if (own !== loadRequest) return
      stockRecord.value = analysis
    }
  } catch (error) {
    if (own !== loadRequest) return
    loadError.value = error instanceof Error ? error.message : '讀取失敗，請重新整理。'
  } finally {
    if (own === loadRequest) loading.value = false
  }
}
// 換一篇（例如從月曆點另一天）要重讀；immediate 的 watch 放在 load 用到的 ref 後面
watch(target, load, { immediate: true })


const resultSpread = computed(() => spreadForReading(spreads.value, reading.value?.reading))
const narrationText = computed(() => reading.value?.narration?.text ?? '')

const subtitle = computed(() => {
  if (kind.value === 'stock') return stockRecord.value ? `${[stockRecord.value.target.name, stockRecord.value.target.code].filter(Boolean).join(' ')} 的股票分析` : ''
  return reading.value ? reading.value.reading.question || '（沒有寫問題）' : ''
})
const backLink = computed(() =>
  kind.value === 'stock' ? { name: 'market-records', query: { id: targetId.value } } : { name: 'history', query: { id: targetId.value } },
)
const infoLabel = computed(() => (kind.value === 'stock' ? '原本的分析' : '原本的占卜'))
// 頁首的副標題（問題、那天的牌）讀到資料才出現，高度會變；要寫在 subtitle 宣告之後
watch([subtitle, loading], () => void nextTick(measureGrid))

const SEGMENT = 'h-8 cursor-pointer border-2 px-3 text-button transition active:translate-x-[1px] active:translate-y-[1px]'
// 同一頁裡的切換用中性色（ui-check：金色留給換頁的分頁列）
const segmentClass = (on: boolean) => (on ? 'relative z-[1] border-ink-soft/70 bg-tint/10 font-semibold text-ink' : 'border-tint/20 text-ink-muted hover:bg-tint/10 hover:text-ink')
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <!-- 頁首包一層面板底色（2026-11-20 使用者要求：字直接壓在場景上看不清楚） -->
    <header class="rounded-[1.75rem] border border-line bg-surface/90 px-5 py-4 sm:px-6">
      <div class="min-w-0 space-y-1">
        <router-link :to="backLink" class="inline-block text-caption text-ink-soft transition hover:text-ink active:translate-y-[1px]">
          ‹ {{ kind === 'stock' ? '回到股市分析紀錄' : '回到塔羅紀錄' }}
        </router-link>
        <h1 class="text-display font-semibold text-ink">日記</h1>
        <p v-if="subtitle" class="truncate text-body text-ink-soft" :title="subtitle">{{ subtitle }}</p>
      </div>
    </header>

    <!-- 手機：分頁切換（換頁的分頁列用金色） -->
    <!-- 分頁列不透明：放在像素場景上，透出背景會看不清楚（2026-11-20 使用者回報） -->
    <div class="flex border-2 border-frame bg-surface shadow-[4px_4px_0_var(--c-shade)] lg:hidden" role="tablist" aria-label="日記頁">
      <button
        v-for="option in [{ value: 'journal', label: '日記' }, { value: 'info', label: infoLabel }] as const"
        :key="option.value"
        type="button"
        role="tab"
        :aria-selected="tab === option.value"
        class="relative h-10 flex-1 cursor-pointer font-pixel text-button transition active:translate-y-[1px]"
        :class="tab === option.value ? 'bg-selected text-on-selected after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-accent-hue' : 'bg-surface text-ink-soft hover:bg-raised'"
        @click="tab = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div ref="gridEl" class="grid min-w-0 grid-cols-1 gap-6 lg:gap-0" :class="dragging ? 'cursor-col-resize select-none' : ''" :style="gridStyle">
      <!-- 左：原本的內容 -->
      <!-- 桌機：左右兩欄填滿視窗剩下的高度，各自超過才捲動（2026-11-20 使用者要求：整頁不要捲軸）。
           面板本身就是捲動區，水晶球的「跳到段落」會捲這裡（lib/motion.ts 的 smoothScrollToElement） -->
      <section
        class="min-w-0 rounded-[1.75rem] border border-line bg-surface/90 p-3 sm:p-5 lg:h-full lg:overflow-y-auto"
        :class="tab === 'info' ? '' : 'hidden lg:block'"
        :aria-label="infoLabel"
      >
        <div v-if="loading" class="space-y-3" aria-hidden="true">
          <SkeletonBlock class="h-6 w-40" />
          <div class="flex gap-3">
            <SkeletonBlock v-for="n in 3" :key="n" class="aspect-[2/3] w-20 rounded-md" />
          </div>
          <SkeletonBlock class="h-4 w-full" />
          <SkeletonBlock class="h-4 w-4/5" />
        </div>
        <p v-else-if="loadError" class="border border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger" role="alert">{{ loadError }}</p>

        <!-- 占卜結果原本是放在頁面上的，這裡由外面的面板給不透明的底（ui-check） -->
        <StepResult
          v-else-if="reading"
          :reading="reading.reading"
          :result-spread="resultSpread"
          :narration-status="narrationText ? 'done' : 'idle'"
          :narration-text="narrationText"
          narration-error=""
          :narration-saved="Boolean(narrationText)"
          :stock-mode="reading.domain === 'stock'"
          :market="marketSnapshot"
          :market-status="marketStatus"
          :market-error="marketError"
          :market-is-saved="marketIsSaved"
          @refresh-market="market.refresh"
          :reading-id="reading.id"
          :narration-feedback="reading.narration?.feedback ?? null"
          is-record
          hide-flow-actions
        />

        <StockAnalysisDetail v-else-if="stockRecord" :detail="stockRecord" />

      </section>

      <!-- 桌機：拖曳調整左右寬度 -->
      <div
        v-if="isWide"
        class="group flex cursor-col-resize touch-none items-center justify-center self-stretch focus-visible:outline-none"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖曳調整左右寬度（左右鍵也可以，Enter 回到一半）"
        title="拖曳調整寬度，雙擊回到一半"
        :aria-valuenow="split"
        :aria-valuemin="SPLIT_MIN"
        :aria-valuemax="SPLIT_MAX"
        tabindex="0"
        @pointerdown="onSplitDown"
        @pointermove="onSplitMove"
        @pointerup="onSplitUp"
        @pointercancel="onSplitUp"
        @keydown="onSplitKey"
        @dblclick="(split = 50), saveSplit()"
      >
        <span
          class="h-12 w-1.5 rounded-full transition group-hover:bg-accent-hue/70 group-focus-visible:bg-accent-hue"
          :class="dragging ? 'bg-accent-hue' : 'bg-tint/30'"
          aria-hidden="true"
        />
      </div>

      <!-- 右：日記 -->
      <section class="min-w-0 self-start rounded-[1.75rem] border border-line bg-surface/90 p-4 sm:p-6 lg:h-full lg:self-stretch lg:overflow-y-auto" :class="tab === 'journal' ? '' : 'hidden lg:block'" aria-label="日記內容">
        <JournalTimeline
          v-if="valid"
          :key="target"
          :target="target"
          :mode="mode"
          :auto-compose="autoCompose"
          :initial-entry="initialEntry"
          fill
        >
          <!-- 編輯／唯讀：放在日記面板裡（2026-11-20 使用者要求，原本在頁首） -->
          <template #actions>
            <div class="flex" role="radiogroup" aria-label="日記模式">
              <button type="button" role="radio" :aria-checked="mode === 'edit'" :class="[SEGMENT, segmentClass(mode === 'edit')]" @click="setMode('edit')">✎ 編輯</button>
              <button type="button" role="radio" :aria-checked="mode === 'read'" :class="[SEGMENT, '-ml-[2px]', segmentClass(mode === 'read')]" @click="setMode('read')">唯讀</button>
            </div>
          </template>
        </JournalTimeline>
        <p v-else-if="!loading" class="text-body text-ink-muted">這裡沒辦法寫日記。</p>
      </section>
    </div>
  </div>
</template>
