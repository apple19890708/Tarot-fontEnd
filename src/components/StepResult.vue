<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { canUseAi, isLoggedIn } from '../lib/auth'

import BackToTop from './BackToTop.vue'
import MarketPanel from './MarketPanel.vue'
import PixelChevron from './PixelChevron.vue'
import QuantPanel from './QuantPanel.vue'
import ReadingAnalysisPanel from './ReadingAnalysisPanel.vue'
import SkeletonBlock from './SkeletonBlock.vue'
import SpreadLayout from './SpreadLayout.vue'
import { cardImageUrl } from '../lib/cardStyle'
import { prefersReducedMotion } from '../lib/motion'
import { provideSectionNav, type SectionNavItem } from '../lib/sectionNav'
import type { Element, MarketSnapshot, MarketStatus, NarrationStatus, ReadingResponse, SaveStatus, Spread } from '../types'

const props = defineProps<{
  reading: ReadingResponse
  // 結果回傳的 spread 只有基本欄位，排列圖需要完整定義（positions / layout）
  resultSpread: Spread | null
  narrationStatus: NarrationStatus
  narrationText: string
  narrationError: string
  // 回顧舊紀錄時沒有「重抽／重新開始」可言，由外層自己放刪除與返回
  hideFlowActions?: boolean
  // 保存紀錄；回顧舊紀錄時不給（本來就已經是紀錄了）
  saveStatus?: SaveStatus
  saveError?: string
  // 回顧「我的紀錄」時為 true：這筆本來就是紀錄，重新產生會取代裡面的解讀
  isRecord?: boolean
  // 最近一次 AI 解讀有沒有存回紀錄（null＝沒有對應的紀錄或不知道）
  narrationSaved?: boolean | null
  // 股市諮詢：結果頁改成「行情與技術指標 → AI 股市分析 → 牌面輔助」，不顯示一般塔羅的判斷依據與結語
  stockMode?: boolean
  market?: MarketSnapshot | null
  marketStatus?: MarketStatus
  marketError?: string
  // 回顧紀錄時顯示的是當時存下來的行情
  marketIsSaved?: boolean
}>()

const emit = defineEmits<{
  restart: []
  redraw: []
  requestNarration: []
  stopNarration: []
  saveReading: []
  refreshMarket: []
}>()

// 判斷依據：還沒有 AI 解讀時預設展開；解讀開始出現就自動收合，讓位給解讀。
// 只在「出現」時收合，文字被清空時不自動展開 —— 按重新產生會先清空舊文字，
// 那時把下方整片判斷依據展開、等新文字出來又收起，整頁高度大起大落，畫面就會亂跳。
const analysisOpen = ref(!props.narrationText)
watch(
  () => Boolean(props.narrationText),
  (hasText) => {
    if (hasText) analysisOpen.value = false
  },
)

// AI 解讀的收合。開始產生新的解讀時一律展開，否則按了重新產生卻什麼都看不到
const narrationOpen = ref(true)
watch(
  () => props.narrationStatus,
  (status) => {
    if (status === 'loading') narrationOpen.value = true
  },
)

const narrationEl = ref<HTMLElement | null>(null)

function scrollToNarrationTop() {
  const el = narrationEl.value
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 16
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

// 讀到一半收合時，區塊開頭可能已經捲出畫面上方；收起來後把畫面帶回開頭，不會停在不相干的地方
function toggleNarration() {
  narrationOpen.value = !narrationOpen.value
  if (!narrationOpen.value && narrationEl.value && narrationEl.value.getBoundingClientRect().top < 0) {
    scrollToNarrationTop()
  }
}

// 重新產生：先把畫面帶回 AI 解讀的開頭，再開始產生，使用者看得到新的解讀從頭長出來
function regenerateNarration() {
  narrationOpen.value = true
  const el = narrationEl.value
  if (el) {
    const top = el.getBoundingClientRect().top + window.scrollY - 16
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }
  emit('requestNarration')
}

// 未登入時按鈕照樣顯示，點了會先存快照再帶去登入頁
const saveLabel = computed(() => {
  if (props.saveStatus === 'saving') {
    return '保存中…'
  }
  if (props.saveStatus === 'saved') {
    return '已保存'
  }
  return isLoggedIn.value ? '保存紀錄' : '保存紀錄（需登入）'
})

// AI 回覆是 Markdown；轉成 HTML 後一定要經過 DOMPurify 清理再用 v-html 顯示
const narrationHtml = computed(() =>
  props.narrationText ? DOMPurify.sanitize(marked.parse(props.narrationText, { async: false })) : '',
)

// 這次結果已經是一筆紀錄：首頁按過保存，或是在「我的紀錄」裡回顧
const isRecorded = computed(() => props.isRecord || props.saveStatus === 'saved')

const isNarrating = computed(
  () => props.narrationStatus === 'loading' || props.narrationStatus === 'streaming',
)

const courtRoles = computed(() => {
  const roles = new Map<number, string>()
  props.reading.analysis?.courts.forEach((court) => {
    roles.set(court.index, court.role === 'person' ? '人物' : '性格／行動')
  })
  return roles
})

// ── 浮動選單的「跳到段落」──
// 段落用 data-nav 標在模板上，選單打開時才收集，哪些段落有出現完全照畫面走，不在這裡重寫 v-if 條件。
const rootEl = ref<HTMLElement | null>(null)
const analysisWrapEl = ref<HTMLElement | null>(null)
const analysisDetailsEl = ref<HTMLElement | null>(null)

// 判斷依據收合時，裡面的段落高度是 0；要先展開、等展開動畫跑完再捲，不然會停在錯的位置
function waitForExpand(el: HTMLElement) {
  if (prefersReducedMotion()) return nextTick()
  return new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener('transitionend', onEnd)
      clearTimeout(fallback)
      resolve()
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target === el && event.propertyName === 'grid-template-rows') done()
    }
    el.addEventListener('transitionend', onEnd)
    // 動畫 500ms；transitionend 沒觸發（例如分頁在背景）也不要卡住
    const fallback = setTimeout(done, 700)
  })
}

async function scrollToSection(el: HTMLElement) {
  // 跳到「AI 解讀」時，收合著就先展開
  if (el === narrationEl.value) narrationOpen.value = true
  const details = analysisDetailsEl.value
  const inAnalysis = el === analysisWrapEl.value || Boolean(details?.contains(el))
  if (inAnalysis && details && !analysisOpen.value) {
    analysisOpen.value = true
    await nextTick()
    await waitForExpand(details)
  }
  // 頂部導覽列不是固定的，只留一點呼吸空間
  const top = el.getBoundingClientRect().top + window.scrollY - 16
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

function collectSections(): SectionNavItem[] {
  const nodes = Array.from(rootEl.value?.querySelectorAll<HTMLElement>('[data-nav]') ?? [])
  // 股市諮詢用 CSS order 重排了區塊，DOM 順序和畫面不同，改照畫面上的位置排
  if (props.stockMode) {
    nodes.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  }
  return nodes.map((el) => ({
    label: el.dataset.nav ?? '',
    level: el.dataset.navLevel === '2' ? 2 : 1,
    go: () => void scrollToSection(el),
  }))
}

let releaseSectionNav: (() => void) | null = null
onMounted(() => {
  releaseSectionNav = provideSectionNav({ items: collectSections })
})
onBeforeUnmount(() => releaseSectionNav?.())

function formatElement(element: Element) {
  const map: Record<Element, string> = { fire: '火', water: '水', air: '風', earth: '土' }
  return map[element]
}

function formatOrientation(orientation: 'upright' | 'reversed') {
  return orientation === 'upright' ? '正位' : '逆位'
}

function formatSuit(suit: string | null) {
  if (!suit) {
    return '大阿卡納'
  }
  const map: Record<string, string> = { wands: '權杖', cups: '聖杯', swords: '寶劍', pentacles: '錢幣' }
  return map[suit] || suit
}
</script>

<template>
  <!-- data-nav：浮動選單「跳到段落」的目標（見 lib/sectionNav.ts） -->
  <!-- 用 flex + order：股市諮詢時把行情與 AI 分析排到牌面前面，區塊本身不必寫兩份 -->
  <div ref="rootEl" class="flex min-w-0 flex-col gap-4 sm:gap-6">
    <div class="space-y-3 border-b border-white/10 pb-4 sm:space-y-4 sm:pb-6">
      <div class="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.35em]">
            {{ stockMode ? 'Market Consult' : 'Reading Result' }}
          </p>
          <h2 class="mt-1.5 text-2xl font-semibold text-stone-50 sm:mt-2 sm:text-3xl">
            {{ stockMode ? `股市諮詢 · ${reading.spread.name}` : reading.spread.name }}
          </h2>
        </div>
        <div v-if="!hideFlowActions" class="flex flex-wrap gap-2">
          <!-- 占卜結果預設不留存，按這個才會存進「我的紀錄」 -->
          <button
            v-if="saveStatus"
            class="cursor-pointer border-2 px-3 py-1 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-1.5 sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            :class="
              saveStatus === 'saved'
                ? 'border-amber-200/40 bg-amber-200/15 text-amber-50'
                : 'border-amber-200/30 bg-amber-200/10 text-amber-50 hover:bg-amber-200/20'
            "
            type="button"
            :disabled="saveStatus === 'saving' || saveStatus === 'saved'"
            @click="emit('saveReading')"
          >
            {{ saveLabel }}
          </button>
          <button
            class="cursor-pointer border-2 border-white/15 px-3 py-1 text-[12px] text-stone-200 transition hover:bg-white/10 sm:px-4 sm:py-1.5 sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="emit('redraw')"
          >
            重抽
          </button>
          <button
            class="cursor-pointer border-2 border-white/15 px-3 py-1 text-[12px] text-stone-200 transition hover:bg-white/10 sm:px-4 sm:py-1.5 sm:text-[12px] active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="emit('restart')"
          >
            重新開始
          </button>
        </div>
      </div>

      <!-- 問題是整頁的主詞，放在牌面清單上方並給足字級，不要縮在角落 -->
      <p class="text-base font-medium leading-relaxed text-amber-50 sm:text-xl">
        {{ reading.question || '未填寫問題，這次抽牌以當下整體能量為主。' }}
      </p>

      <p
        v-if="saveError"
        class="border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
      >
        {{ saveError }}
      </p>
      <p v-else-if="saveStatus === 'saved'" class="text-sm text-stone-300/75">
        已經存進「我的紀錄」，之後可以回去重看這次的牌與分析。
      </p>

    </div>

    <MarketPanel
      v-if="stockMode"
      data-nav="行情與技術指標"
      class="order-1"
      :snapshot="market ?? null"
      :status="marketStatus ?? 'idle'"
      :error="marketError"
      :is-saved="marketIsSaved"
      @refresh="emit('refreshMarket')"
    />

    <div
      v-if="resultSpread"
      :data-nav="stockMode ? '牌面輔助' : '牌陣'"
      class="border-2 border-white/10 bg-slate-950/45 p-3 sm:p-5"
      :class="{ 'order-3': stockMode }"
    >
      <p class="mb-3 text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">
        {{ stockMode ? 'Tarot Guidance' : 'Spread Layout' }}
      </p>
      <p v-if="stockMode" class="mb-4 text-sm leading-7 text-stone-300/80">
        牌面不預測價格，只用來提醒這次操作的心態與風險；AI 分析會挑出關鍵的幾張放進判斷裡。
      </p>
      <SpreadLayout :spread="resultSpread" :cards="reading.cards" />
    </div>

    <div data-nav="每張牌的牌義" class="grid min-w-0 gap-4 xl:grid-cols-2" :class="{ 'order-4': stockMode }">
      <article
        v-for="(entry, index) in reading.cards"
        :key="`${entry.position?.key ?? index}-${entry.card.id}`"
        class="flex h-[24rem] min-w-0 flex-col border-2 bg-slate-950/45 p-4 transition hover:-translate-y-0.5 sm:h-[26rem] sm:p-5"
        :class="reading.analysis?.theme.focusIndex === index ? 'border-amber-200/40' : 'border-white/10'"
      >
        <div class="flex min-w-0 flex-shrink-0 items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <img
              v-if="cardImageUrl(entry.card.image)"
              :src="cardImageUrl(entry.card.image)"
              :alt="entry.card.nameZh"
              class="h-20 w-[2.9rem] flex-shrink-0 object-cover shadow-lg transition sm:h-24 sm:w-14"
              :class="{ 'rotate-180': entry.orientation === 'reversed' }"
            />
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-[0.15em] text-stone-400 sm:text-xs sm:tracking-[0.28em]">
                {{ entry.position?.label ?? `第 ${index + 1} 張` }}
              </p>
              <h3 class="mt-1.5 break-words font-pixel text-[24px] text-stone-50 sm:mt-2">{{ entry.card.nameZh }}</h3>
              <p class="mt-1 break-words text-xs text-stone-300/75 sm:text-sm">{{ entry.card.nameEn || formatSuit(entry.card.suit) }}</p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 sm:gap-2">
            <span class="border-2 border-amber-100/20 bg-amber-100/10 px-2 py-0.5 text-[10px] font-medium text-amber-50 sm:px-3 sm:py-1 sm:text-xs">
              {{ formatOrientation(entry.orientation) }}
            </span>
            <span
              v-if="reading.analysis?.theme.focusIndex === index"
              class="bg-amber-200/90 px-2 py-0.5 text-[10px] font-semibold text-slate-950 sm:px-3 sm:py-1 sm:text-xs"
            >
              焦點牌
            </span>
            <span v-if="entry.card.element" class="bg-white/8 px-2 py-0.5 text-[10px] text-stone-200/80 sm:px-3 sm:py-1 sm:text-xs">
              {{ formatElement(entry.card.element) }}元素
            </span>
            <span v-if="courtRoles.has(index)" class="bg-white/8 px-2 py-0.5 text-[10px] text-stone-200/80 sm:px-3 sm:py-1 sm:text-xs">
              {{ courtRoles.get(index) }}
            </span>
          </div>
        </div>

        <!-- 內容區：固定卡片高度，超出的牌義在這裡捲動 -->
        <div class="mt-4 min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
          <div class="flex flex-wrap gap-2">
            <span
              v-for="keyword in entry.card.keywords.slice(0, 4)"
              :key="keyword"
              class="bg-white/8 px-3 py-1 text-xs text-stone-200/70"
            >
              {{ keyword }}
            </span>
          </div>

          <!-- 沒有分組牌義時才顯示開場句；有分組時它與「核心訊息」重複 -->
          <p v-if="!entry.meaning?.length" class="mt-4 text-sm leading-7 text-stone-200/85">
            {{ entry.interpretation }}
          </p>

          <!-- 完整牌義，依小標題分組 -->
          <div v-if="entry.meaning?.length" class="mt-4 space-y-3">
            <div v-for="group in entry.meaning" :key="group.heading">
              <p class="text-xs font-medium uppercase tracking-[0.15em] text-amber-100/70">
                {{ group.heading }}
              </p>
              <ul class="mt-1 space-y-1 text-sm leading-7 text-stone-300/85">
                <li v-for="line in group.lines" :key="line">{{ line }}</li>
              </ul>
            </div>
          </div>

          <ul v-else class="mt-4 space-y-2 text-sm text-stone-300/80">
            <li v-for="highlight in entry.highlights" :key="highlight">{{ highlight }}</li>
          </ul>
        </div>
      </article>
    </div>

    <div
      v-if="narrationStatus !== 'idle'"
      ref="narrationEl"
      :data-nav="stockMode ? 'AI 股市分析' : 'AI 解讀'"
      class="border-2 border-amber-100/15 bg-gradient-to-br from-amber-100/10 via-white/5 to-rose-100/10 p-4 sm:p-6"
      :class="{ 'order-2': stockMode }"
    >
      <!--
        有內容（產生中或已產生）時，整個標題列就是收合開關，右邊只放箭頭，和「查看判斷依據」同一個樣子。
        還沒請 AI 解讀時只有一顆按鈕，不需要收合，標題列就是一般文字
      -->
      <component
        :is="narrationStatus !== 'ready' ? 'button' : 'div'"
        :type="narrationStatus !== 'ready' ? 'button' : undefined"
        class="flex w-full items-center justify-between gap-3 text-left"
        :class="narrationStatus !== 'ready' ? 'cursor-pointer sm:-mr-2 sm:w-[calc(100%+0.5rem)]' : ''"
        :aria-expanded="narrationStatus !== 'ready' ? narrationOpen : undefined"
        :aria-controls="narrationStatus !== 'ready' ? 'narration-body' : undefined"
        :aria-label="narrationStatus !== 'ready' ? (narrationOpen ? '收合 AI 解讀' : '展開 AI 解讀') : undefined"
        @click="narrationStatus !== 'ready' && toggleNarration()"
      >
        <span class="block min-w-0">
          <span class="block text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">
            {{ stockMode ? 'Analysis' : 'Reading' }}
          </span>
          <span class="mt-2 block text-lg font-semibold text-stone-50 sm:text-xl">
            {{ stockMode ? 'AI 股市分析' : '這組牌想說的事' }}
          </span>
        </span>
        <PixelChevron v-if="narrationStatus !== 'ready'" class="text-stone-300" :open="narrationOpen" />
      </component>

      <div v-if="narrationStatus === 'ready'" class="mt-4 space-y-4">
        <p v-if="stockMode" class="text-sm leading-7 text-stone-300/80">
          AI 會依據上方的即時行情與技術指標，寫出短線方向、支撐壓力與附觸發價位的操作情境，牌面只用來提醒操作心態。文字會陸續出現，隨時可以停止。
        </p>
        <p v-else class="text-sm leading-7 text-stone-300/80">
          想要更完整的白話解讀嗎？AI 會把這組牌串成這件事接下來會怎麼發展，並給出具體的做法。文字會陸續出現，隨時可以停止。
        </p>
        <button
          v-if="canUseAi"
          class="cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-5 py-2.5 text-[12px] font-medium text-amber-50 transition hover:bg-amber-200/25 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
          type="button"
          @click="emit('requestNarration')"
        >
          {{ stockMode ? '請 AI 分析行情' : '請 AI 解讀這組牌' }}
        </button>

        <!-- 未登入：按鈕照樣顯示，點了會帶去登入頁 -->
        <template v-else-if="!isLoggedIn">
          <button
            class="cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-5 py-2.5 text-[12px] font-medium text-amber-50 transition hover:bg-amber-200/25 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="emit('requestNarration')"
          >
            請 AI 解讀這組牌（需登入）
          </button>
          <p class="text-xs text-stone-300/60">
            抽牌與上面的組合分析不需要帳號；AI 解讀會產生費用，所以要登入後才能用。
          </p>
        </template>

        <!-- 已登入但還沒被開通：不要給一個按了也沒用的按鈕 -->
        <template v-else>
          <div class="border-2 border-white/10 bg-white/5 px-4 py-3">
            <p class="text-sm font-medium text-stone-100">AI 解讀尚未開通</p>
            <p class="mt-1 text-xs leading-6 text-stone-300/70">
              這項功能需要管理者逐一開通，請聯絡管理者。上面的牌義與組合分析不受影響，可以照常看。
            </p>
          </div>
        </template>
      </div>

      <!-- 和判斷依據一樣用 grid-rows 0fr↔1fr 收合，不必量高度 -->
      <div
        v-else
        id="narration-body"
        class="grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none"
        :class="narrationOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
        :inert="!narrationOpen"
      >
      <div class="min-h-0 overflow-hidden">
        <div v-if="narrationStatus === 'loading'" class="mt-4 space-y-5">
          <div class="space-y-2.5">
            <SkeletonBlock class="h-3 w-full" />
            <SkeletonBlock class="h-3 w-11/12" />
            <SkeletonBlock class="h-3 w-4/5" />
          </div>
          <SkeletonBlock class="h-5 w-40" />
          <div class="space-y-2.5">
            <SkeletonBlock class="h-3 w-full" />
            <SkeletonBlock class="h-3 w-10/12" />
            <SkeletonBlock class="h-3 w-full" />
            <SkeletonBlock class="h-3 w-3/5" />
          </div>
        </div>

        <div
          v-if="narrationText"
          class="mt-4 min-w-0 space-y-4 break-words text-sm leading-7 text-stone-100/90 [&_pre]:overflow-x-auto [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto sm:text-base sm:leading-8 [&_h2]:mt-8 [&_h2]:border-t [&_h2]:border-white/10 [&_h2]:pt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-amber-100 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-stone-50 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-amber-50 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-amber-200/60"
          v-html="narrationHtml"
        />

        <div
          v-if="isNarrating"
          class="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4"
          aria-live="polite"
        >
          <span class="text-sm text-stone-300/80">
            {{ narrationStatus === 'loading' ? '正在整理這次的解讀…' : 'AI 正在撰寫…' }}
          </span>
          <button
            class="cursor-pointer border-2 border-white/15 bg-white/5 px-4 py-1.5 text-[12px] text-stone-100 transition hover:bg-white/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="emit('stopNarration')"
          >
            停止
          </button>
        </div>

        <!--
          解讀完成後也要能重新產生（原本只有停止、失敗時才有按鈕）。
          已是紀錄時，新的那篇完整產生後會直接取代紀錄裡原本那篇，不另開一筆
        -->
        <div
          v-else-if="narrationStatus === 'done' && canUseAi"
          class="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4"
        >
          <span class="text-sm leading-7 text-stone-300/80">
            <template v-if="narrationSaved === true">已更新到這筆紀錄。</template>
            <template v-else-if="narrationSaved === false">這篇沒有存進紀錄，可以再產生一次。</template>
            {{ isRecorded ? '重新產生的解讀完成後，會取代紀錄裡的這一篇。' : '不滿意可以重新產生一篇。' }}
          </span>
          <button
            class="cursor-pointer border-2 border-amber-200/30 bg-amber-200/10 px-4 py-1.5 text-[12px] font-medium text-amber-50 transition hover:bg-amber-200/20 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="regenerateNarration"
          >
            重新產生
          </button>
        </div>

        <div
          v-else-if="narrationStatus === 'stopped' || narrationStatus === 'error'"
          class="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4"
        >
          <span class="text-sm leading-7 text-stone-300/80">
            <template v-if="narrationStatus === 'stopped'">已停止產生，以上是目前寫出的部分。</template>
            <template v-else-if="stockMode">{{ narrationError }}可以先參考上方的行情與技術指標，或稍後再試一次。</template>
            <template v-else>{{ narrationError }}可以先參考下方規則分析的結果，或稍後再試一次。</template>
          </span>
          <button
            class="cursor-pointer border-2 border-amber-200/30 bg-amber-200/10 px-4 py-1.5 text-[12px] font-medium text-amber-50 transition hover:bg-amber-200/20 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            type="button"
            @click="regenerateNarration"
          >
            {{ narrationStatus === 'stopped' ? '重新產生' : '再試一次' }}
          </button>
        </div>
      </div>
      </div>
    </div>

    <!-- 原生 details 收合時沒辦法做動畫，改用 grid-rows 0fr↔1fr 展開收合，不必量高度 -->
    <!-- 股市諮詢不顯示一般塔羅的判斷依據與結語：那一頁的主體是行情與技術分析 -->
    <div v-if="reading.analysis && !stockMode" ref="analysisWrapEl" data-nav="判斷依據">
      <button
        type="button"
        class="flex w-full items-center justify-between border-2 border-white/10 bg-white/5 px-4 py-2 text-left text-[12px] text-stone-200/80 transition hover:bg-white/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        :aria-expanded="analysisOpen"
        aria-controls="analysis-details"
        @click="analysisOpen = !analysisOpen"
      >
        <span>{{ analysisOpen ? '收合判斷依據' : '查看判斷依據' }}</span>
        <PixelChevron class="text-stone-300" :open="analysisOpen" />
      </button>
      <div
        id="analysis-details"
        ref="analysisDetailsEl"
        class="grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none"
        :class="analysisOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
        :inert="!analysisOpen"
      >
        <div class="min-h-0 overflow-hidden">
          <QuantPanel
            v-if="reading.analysis.quant"
            data-nav="整體看起來"
            data-nav-level="2"
            class="mt-3"
            :quant="reading.analysis.quant"
            :cards="reading.cards"
          />
          <ReadingAnalysisPanel class="mt-3" :analysis="reading.analysis" :cards="reading.cards" />
        </div>
      </div>
    </div>

    <div v-if="!stockMode" data-nav="結語" class="border-2 border-amber-100/10 bg-gradient-to-r from-amber-100/10 via-white/5 to-rose-100/10 p-4 sm:p-5">
      <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Guidance</p>
      <p class="mt-3 text-sm leading-7 text-stone-100/85 sm:text-base sm:leading-8">{{ reading.guidance }}</p>
    </div>

    <!-- 結果頁很長，捲超過一個畫面高就給一顆回頂的按鈕 -->
    <BackToTop />
  </div>
</template>
