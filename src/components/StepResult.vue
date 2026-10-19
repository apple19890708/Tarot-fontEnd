<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed } from 'vue'

import { canUseAi, isLoggedIn } from '../lib/auth'

import QuantPanel from './QuantPanel.vue'
import ReadingAnalysisPanel from './ReadingAnalysisPanel.vue'
import SpreadLayout from './SpreadLayout.vue'
import { imageUrl } from '../lib/api'
import type { Element, NarrationStatus, ReadingResponse, Spread } from '../types'

const props = defineProps<{
  reading: ReadingResponse
  // 結果回傳的 spread 只有基本欄位，排列圖需要完整定義（positions / layout）
  resultSpread: Spread | null
  narrationStatus: NarrationStatus
  narrationText: string
  narrationError: string
}>()

const emit = defineEmits<{
  restart: []
  redraw: []
  requestNarration: []
  stopNarration: []
}>()

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
  <div class="space-y-6">
    <div class="space-y-4 border-b border-white/10 pb-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs uppercase tracking-[0.35em] text-stone-300/60">Reading Result</p>
          <h2 class="mt-2 text-3xl font-semibold text-stone-50">{{ reading.spread.name }}</h2>
        </div>
        <div class="flex gap-2">
          <button
            class="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
            type="button"
            @click="emit('redraw')"
          >
            重抽
          </button>
          <button
            class="cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
            type="button"
            @click="emit('restart')"
          >
            重新開始
          </button>
        </div>
      </div>

      <!-- 問題是整頁的主詞，放在牌面清單上方並給足字級，不要縮在角落 -->
      <p class="text-xl font-medium leading-relaxed text-amber-50">
        {{ reading.question || '未填寫問題，這次抽牌以當下整體能量為主。' }}
      </p>

      <!-- 牌面一覽：牌名為主、位置含意用小字換色跟在後面。正位是常態，只標逆位 -->
      <ul class="flex flex-wrap gap-x-4 gap-y-2 rounded-3xl border border-white/10 bg-black/15 px-4 py-3">
        <li v-for="(item, index) in reading.cards" :key="index" class="text-sm leading-tight text-stone-100">
          <span class="font-medium">{{ item.card.nameZh }}</span>
          <span v-if="item.orientation === 'reversed'" class="text-rose-200/90">逆</span>
          <span class="ml-1 text-[11px] text-stone-400/80">（{{ item.position?.label ?? `第 ${index + 1} 張` }}）</span>
        </li>
      </ul>
    </div>

    <div v-if="resultSpread" class="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5">
      <p class="mb-3 text-xs uppercase tracking-[0.3em] text-stone-300/60">Spread Layout</p>
      <SpreadLayout :spread="resultSpread" :cards="reading.cards" />
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <article
        v-for="(entry, index) in reading.cards"
        :key="`${entry.position?.key ?? index}-${entry.card.id}`"
        class="flex h-[26rem] flex-col rounded-[1.75rem] border bg-slate-950/45 p-5 transition hover:-translate-y-0.5"
        :class="reading.analysis?.theme.focusIndex === index ? 'border-amber-200/40' : 'border-white/10'"
      >
        <div class="flex flex-shrink-0 items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <img
              v-if="imageUrl(entry.card.image)"
              :src="imageUrl(entry.card.image)"
              :alt="entry.card.nameZh"
              class="h-24 w-16 flex-shrink-0 rounded-lg object-cover shadow-lg transition"
              :class="{ 'rotate-180': entry.orientation === 'reversed' }"
            />
            <div>
              <p class="text-xs uppercase tracking-[0.28em] text-stone-400">
                {{ entry.position?.label ?? `第 ${index + 1} 張` }}
              </p>
              <h3 class="mt-2 text-2xl font-semibold text-stone-50">{{ entry.card.nameZh }}</h3>
              <p class="mt-1 text-sm text-stone-300/75">{{ entry.card.nameEn || formatSuit(entry.card.suit) }}</p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-2">
            <span class="rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs font-medium text-amber-50">
              {{ formatOrientation(entry.orientation) }}
            </span>
            <span
              v-if="reading.analysis?.theme.focusIndex === index"
              class="rounded-full bg-amber-200/90 px-3 py-1 text-xs font-semibold text-slate-950"
            >
              焦點牌
            </span>
            <span v-if="entry.card.element" class="rounded-full bg-white/8 px-3 py-1 text-xs text-stone-200/80">
              {{ formatElement(entry.card.element) }}元素
            </span>
            <span v-if="courtRoles.has(index)" class="rounded-full bg-white/8 px-3 py-1 text-xs text-stone-200/80">
              {{ courtRoles.get(index) }}
            </span>
          </div>
        </div>

        <!-- 內容區：固定卡片高度，超出的牌義在這裡捲動 -->
        <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
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
      class="rounded-[1.75rem] border border-amber-100/15 bg-gradient-to-br from-amber-100/10 via-white/5 to-rose-100/10 p-6"
    >
      <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">Reading</p>
      <h3 class="mt-2 text-xl font-semibold text-stone-50">這組牌想說的事</h3>

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
          class="mt-4 space-y-4 text-base leading-8 text-stone-100/90 [&_h2]:mt-8 [&_h2]:border-t [&_h2]:border-white/10 [&_h2]:pt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-amber-100 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-stone-50 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-amber-50 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-amber-200/60"
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

    <details v-if="reading.analysis" :open="!narrationText" class="group">
      <summary
        class="cursor-pointer list-none rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-200/80 transition hover:bg-white/10"
      >
        <span class="group-open:hidden">查看判斷依據</span>
        <span class="hidden group-open:inline">收合判斷依據</span>
      </summary>
      <QuantPanel
        v-if="reading.analysis.quant"
        class="mt-3"
        :quant="reading.analysis.quant"
        :cards="reading.cards"
      />
      <ReadingAnalysisPanel class="mt-3" :analysis="reading.analysis" :cards="reading.cards" />
    </details>

    <div class="rounded-[1.75rem] border border-amber-100/10 bg-gradient-to-r from-amber-100/10 via-white/5 to-rose-100/10 p-5">
      <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">Guidance</p>
      <p class="mt-3 text-base leading-8 text-stone-100/85">{{ reading.guidance }}</p>
    </div>
  </div>
</template>
