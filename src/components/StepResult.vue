<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, ref, watch } from 'vue'

import { canUseAi, isLoggedIn } from '../lib/auth'

import BackToTop from './BackToTop.vue'
import QuantPanel from './QuantPanel.vue'
import ReadingAnalysisPanel from './ReadingAnalysisPanel.vue'
import SpreadLayout from './SpreadLayout.vue'
import { imageUrl } from '../lib/api'
import type { Element, NarrationStatus, ReadingResponse, SaveStatus, Spread } from '../types'

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
}>()

const emit = defineEmits<{
  restart: []
  redraw: []
  requestNarration: []
  stopNarration: []
  saveReading: []
}>()

// 判斷依據：還沒有 AI 解讀時預設展開；解讀開始出現就自動收合，讓位給解讀
const analysisOpen = ref(!props.narrationText)
watch(
  () => !props.narrationText,
  (open) => {
    analysisOpen.value = open
  },
)

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
  <div class="min-w-0 space-y-4 sm:space-y-6">
    <div class="space-y-3 border-b border-white/10 pb-4 sm:space-y-4 sm:pb-6">
      <div class="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.35em]">Reading Result</p>
          <h2 class="mt-1.5 text-2xl font-semibold text-stone-50 sm:mt-2 sm:text-3xl">{{ reading.spread.name }}</h2>
        </div>
        <div v-if="!hideFlowActions" class="flex flex-wrap gap-2">
          <!-- 占卜結果預設不留存，按這個才會存進「我的紀錄」 -->
          <button
            v-if="saveStatus"
            class="cursor-pointer rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:py-1.5 sm:text-sm"
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
            class="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs text-stone-200 transition hover:bg-white/10 sm:px-4 sm:py-1.5 sm:text-sm"
            type="button"
            @click="emit('redraw')"
          >
            重抽
          </button>
          <button
            class="cursor-pointer rounded-full border border-white/15 px-3 py-1 text-xs text-stone-200 transition hover:bg-white/10 sm:px-4 sm:py-1.5 sm:text-sm"
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
        class="rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100"
      >
        {{ saveError }}
      </p>
      <p v-else-if="saveStatus === 'saved'" class="text-sm text-stone-300/75">
        已經存進「我的紀錄」，之後可以回去重看這次的牌與分析。
      </p>

    </div>

    <div v-if="resultSpread" class="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-3 sm:rounded-[1.75rem] sm:p-5">
      <p class="mb-3 text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Spread Layout</p>
      <SpreadLayout :spread="resultSpread" :cards="reading.cards" />
    </div>

    <div class="grid min-w-0 gap-4 xl:grid-cols-2">
      <article
        v-for="(entry, index) in reading.cards"
        :key="`${entry.position?.key ?? index}-${entry.card.id}`"
        class="flex h-[24rem] min-w-0 flex-col rounded-[1.5rem] border bg-slate-950/45 p-4 transition hover:-translate-y-0.5 sm:h-[26rem] sm:rounded-[1.75rem] sm:p-5"
        :class="reading.analysis?.theme.focusIndex === index ? 'border-amber-200/40' : 'border-white/10'"
      >
        <div class="flex min-w-0 flex-shrink-0 items-start justify-between gap-3">
          <div class="flex min-w-0 items-start gap-3">
            <img
              v-if="imageUrl(entry.card.image)"
              :src="imageUrl(entry.card.image)"
              :alt="entry.card.nameZh"
              class="h-20 w-[3.25rem] flex-shrink-0 rounded-lg object-cover shadow-lg transition sm:h-24 sm:w-16"
              :class="{ 'rotate-180': entry.orientation === 'reversed' }"
            />
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-[0.15em] text-stone-400 sm:text-xs sm:tracking-[0.28em]">
                {{ entry.position?.label ?? `第 ${index + 1} 張` }}
              </p>
              <h3 class="mt-1.5 break-words text-xl font-semibold text-stone-50 sm:mt-2 sm:text-2xl">{{ entry.card.nameZh }}</h3>
              <p class="mt-1 break-words text-xs text-stone-300/75 sm:text-sm">{{ entry.card.nameEn || formatSuit(entry.card.suit) }}</p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 sm:gap-2">
            <span class="rounded-full border border-amber-100/20 bg-amber-100/10 px-2 py-0.5 text-[10px] font-medium text-amber-50 sm:px-3 sm:py-1 sm:text-xs">
              {{ formatOrientation(entry.orientation) }}
            </span>
            <span
              v-if="reading.analysis?.theme.focusIndex === index"
              class="rounded-full bg-amber-200/90 px-2 py-0.5 text-[10px] font-semibold text-slate-950 sm:px-3 sm:py-1 sm:text-xs"
            >
              焦點牌
            </span>
            <span v-if="entry.card.element" class="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-stone-200/80 sm:px-3 sm:py-1 sm:text-xs">
              {{ formatElement(entry.card.element) }}元素
            </span>
            <span v-if="courtRoles.has(index)" class="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-stone-200/80 sm:px-3 sm:py-1 sm:text-xs">
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
              class="rounded-full bg-white/8 px-3 py-1 text-xs text-stone-200/70"
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
      class="rounded-[1.5rem] border border-amber-100/15 bg-gradient-to-br from-amber-100/10 via-white/5 to-rose-100/10 p-4 sm:rounded-[1.75rem] sm:p-6"
    >
      <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Reading</p>
      <h3 class="mt-2 text-lg font-semibold text-stone-50 sm:text-xl">這組牌想說的事</h3>

      <div v-if="narrationStatus === 'ready'" class="mt-4 space-y-4">
        <p class="text-sm leading-7 text-stone-300/80">
          更完整的白話解讀嗎？AI 會綜合牌義、元素與數字，針對你的問題整理成一篇說明。文字會陸續出現，隨時可以停止。
        </p>
        <button
          v-if="canUseAi"
          class="cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
          type="button"
          @click="emit('requestNarration')"
        >
          請 AI 解讀這組牌
        </button>

        <!-- 未登入：按鈕照樣顯示，點了會帶去登入頁 -->
        <template v-else-if="!isLoggedIn">
          <button
            class="cursor-pointer rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
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
          <div class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p class="text-sm font-medium text-stone-100">AI 解讀尚未開通</p>
            <p class="mt-1 text-xs leading-6 text-stone-300/70">
              這項功能需要管理者逐一開通，請聯絡管理者。上面的牌義與組合分析不受影響，可以照常看。
            </p>
          </div>
        </template>
      </div>

      <template v-else>
        <div v-if="narrationStatus === 'loading'" class="mt-4 space-y-3">
          <div class="h-3 w-full animate-pulse rounded-full bg-white/10" />
          <div class="h-3 w-11/12 animate-pulse rounded-full bg-white/10" />
          <div class="h-3 w-4/5 animate-pulse rounded-full bg-white/10" />
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
            class="cursor-pointer rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-stone-100 transition hover:bg-white/10"
            type="button"
            @click="emit('stopNarration')"
          >
            停止
          </button>
        </div>

        <div
          v-else-if="narrationStatus === 'stopped' || narrationStatus === 'error'"
          class="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4"
        >
          <span class="text-sm leading-7 text-stone-300/80">
            <template v-if="narrationStatus === 'stopped'">已停止產生，以上是目前寫出的部分。</template>
            <template v-else>{{ narrationError }}可以先參考下方規則分析的結果，或稍後再試一次。</template>
          </span>
          <button
            class="cursor-pointer rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-1.5 text-sm font-medium text-amber-50 transition hover:bg-amber-200/20"
            type="button"
            @click="emit('requestNarration')"
          >
            {{ narrationStatus === 'stopped' ? '重新產生' : '再試一次' }}
          </button>
        </div>
      </template>
    </div>

    <!-- 原生 details 收合時沒辦法做動畫，改用 grid-rows 0fr↔1fr 展開收合，不必量高度 -->
    <div v-if="reading.analysis">
      <button
        type="button"
        class="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-2 text-left text-sm text-stone-200/80 transition hover:bg-white/10"
        :aria-expanded="analysisOpen"
        aria-controls="analysis-details"
        @click="analysisOpen = !analysisOpen"
      >
        <span>{{ analysisOpen ? '收合判斷依據' : '查看判斷依據' }}</span>
        <span
          class="text-xs text-stone-400 transition-transform duration-300 motion-reduce:transition-none"
          :class="analysisOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      <div
        id="analysis-details"
        class="grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none"
        :class="analysisOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
        :inert="!analysisOpen"
      >
        <div class="min-h-0 overflow-hidden">
          <QuantPanel
            v-if="reading.analysis.quant"
            class="mt-3"
            :quant="reading.analysis.quant"
            :cards="reading.cards"
          />
          <ReadingAnalysisPanel class="mt-3" :analysis="reading.analysis" :cards="reading.cards" />
        </div>
      </div>
    </div>

    <div class="rounded-[1.5rem] border border-amber-100/10 bg-gradient-to-r from-amber-100/10 via-white/5 to-rose-100/10 p-4 sm:rounded-[1.75rem] sm:p-5">
      <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Guidance</p>
      <p class="mt-3 text-sm leading-7 text-stone-100/85 sm:text-base sm:leading-8">{{ reading.guidance }}</p>
    </div>

    <!-- 結果頁很長，捲超過一個畫面高就給一顆回頂的按鈕 -->
    <BackToTop />
  </div>
</template>
