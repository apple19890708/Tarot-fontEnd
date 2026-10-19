<script setup lang="ts">
import { computed } from 'vue'

import { imageUrl } from '../lib/api'
import type { Element, PairRelation, ReadingAnalysis, ReadingCard, Suit } from '../types'

const props = defineProps<{
  analysis: ReadingAnalysis
  cards: ReadingCard[]
}>()

const SUIT_LABELS: Record<Suit, string> = {
  wands: '權杖',
  cups: '聖杯',
  swords: '寶劍',
  pentacles: '錢幣',
}

const ELEMENT_LABELS: Record<Element, string> = {
  fire: '火',
  water: '水',
  air: '風',
  earth: '土',
}

const COURT_RANK_LABELS: Record<string, string> = {
  page: '侍者',
  knight: '騎士',
  queen: '王后',
  king: '國王',
}

// 這個徽章講的是元素關係，不是好壞。原本綠配紅會讓人以為綠色＝好事，
// 但旁邊的辭典文字講的是牌義，兩者常常相反。改成不帶褒貶的色系。
const RELATION_STYLES: Record<PairRelation, string> = {
  enhance: 'border-amber-200/25 bg-amber-100/8 text-amber-100/90',
  weaken: 'border-violet-200/25 bg-violet-300/8 text-violet-100/90',
  cause: 'border-sky-200/25 bg-sky-300/8 text-sky-100/90',
  neutral: 'border-white/15 bg-white/5 text-stone-300',
}

// 「整體在說什麼」只留議題性質、花色與宮廷階級
const themeTags = computed(() => {
  const { theme } = props.analysis
  const DOMINANCE_TAGS = { fate: '外在／命運主導', elevated: '大牌比例偏高', personal: '日常／個人可控' }
  const tags = [DOMINANCE_TAGS[theme.dominance] ?? '日常／個人可控']

  theme.dominantSuits.forEach(({ suit, count }) => tags.push(`${SUIT_LABELS[suit]}主導 ×${count}`))
  theme.emphasizedCourtRanks.forEach(({ rank, count }) => tags.push(`${COURT_RANK_LABELS[rank]} ×${count}`))

  return tags
})

// 數字與元素移到「走到哪個階段」下方，跟階段資訊放在一起
const elementNumberTags = computed(() => {
  const { theme } = props.analysis
  const tags: string[] = []

  theme.emphasizedNumbers.forEach(({ number, count, theme: numberTheme }) =>
    tags.push(`數字 ${number}${numberTheme ? `「${numberTheme}」` : ''} ×${count}`),
  )
  if (theme.dominantElements.length > 0) {
    tags.push(`元素以${theme.dominantElements.map((element) => ELEMENT_LABELS[element]).join('、')}最多`)
  }
  if (theme.missingSuits.length > 0) {
    tags.push(`缺少${theme.missingSuits.map((suit) => SUIT_LABELS[suit]).join('、')}`)
  }

  return tags
})

const notes = computed(() => [...props.analysis.conflicts, ...props.analysis.uncertainties])

const ALIGNMENT_BADGES: Record<string, { label: string; style: string }> = {
  aligned: { label: '對焦', style: 'border-emerald-200/30 bg-emerald-300/10 text-emerald-100' },
  partial: { label: '部分回應', style: 'border-sky-200/30 bg-sky-300/10 text-sky-100' },
  mismatch: { label: '偏離', style: 'border-rose-200/30 bg-rose-300/10 text-rose-100' },
  noMinor: { label: '全為大牌', style: 'border-amber-100/20 bg-amber-100/10 text-amber-50' },
}

// 以三格傾向條呈現，不顯示精確分數。
// 阻力只在指向分析顯示一次：那邊有計入牌陣位置權重，與這裡的算法不同，同時出現會互相矛盾。
const weightMeters = computed(() => {
  const weights = props.analysis.weights
  if (!weights) {
    return []
  }
  return [
    {
      name: '事情規模',
      label: weights.intensityLabel,
      level: { daily: 1, medium: 2, major: 3 }[weights.intensity],
    },
  ]
})

function cardName(index: number) {
  return props.cards[index]?.card.nameZh ?? `第 ${index + 1} 張`
}

function cardAt(index: number) {
  return props.cards[index]
}

function isReversed(index: number) {
  return props.cards[index]?.orientation === 'reversed'
}

// 手動選牌沒有牌陣位置，退回「第 N 張」
function positionLabel(index: number) {
  return props.cards[index]?.position?.label ?? `第 ${index + 1} 張`
}
</script>

<template>
  <div class="space-y-5 rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5">
    <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">Combination Analysis</p>

    <section class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">整體在說什麼</h3>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="tag in themeTags"
          :key="tag"
          class="rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs text-amber-50"
        >
          {{ tag }}
        </span>
      </div>
      <p class="text-sm leading-7 text-stone-200/85">{{ analysis.theme.text }}</p>
    </section>

    <section v-if="analysis.question" class="space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-lg font-semibold text-stone-50">牌面有回答到你的問題嗎</h3>
        <span
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="ALIGNMENT_BADGES[analysis.question.alignment]?.style"
        >
          {{ ALIGNMENT_BADGES[analysis.question.alignment]?.label }}
        </span>
      </div>
      <p class="text-sm leading-7 text-stone-200/85">{{ analysis.question.text }}</p>
    </section>

    <section v-if="analysis.weights" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">這件事有多大</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="meter in weightMeters"
          :key="meter.name"
          class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
        >
          <div class="flex items-center justify-between text-sm">
            <span class="text-stone-300/80">{{ meter.name }}</span>
            <span class="font-medium text-amber-50">{{ meter.label }}</span>
          </div>
          <div class="mt-2 flex gap-1.5" :aria-label="`${meter.name}：${meter.label}`">
            <span
              v-for="step in 3"
              :key="step"
              class="h-1.5 flex-1 rounded-full"
              :class="step <= (meter.level ?? 0) ? 'bg-amber-200/80' : 'bg-white/10'"
            />
          </div>
        </div>
      </div>
      <p class="text-sm leading-7 text-stone-200/85">{{ analysis.weights.text }}</p>
    </section>

    <section v-if="analysis.positions && analysis.positions.length > 0" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">各個位置看出什麼</h3>
      <ul class="list-disc space-y-1 pl-5 text-sm leading-7 text-stone-200/85 marker:text-amber-200/60">
        <li v-for="finding in analysis.positions" :key="`${finding.type}-${finding.evidence.join('-')}`">
          {{ finding.text }}
        </li>
      </ul>
    </section>

    <section v-if="analysis.pairs.length > 0" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">牌跟牌之間的關係</h3>
      <ul class="space-y-3">
        <li
          v-for="pair in analysis.pairs"
          :key="`${pair.from}-${pair.to}`"
          class="rounded-3xl border border-white/10 bg-white/5 p-4"
        >
          <!-- 每張縮圖貼著自己的牌名，不要兩張疊在一起看不出誰是誰 -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-stone-100">
            <span class="inline-flex items-center gap-2">
              <img
                v-if="imageUrl(cardAt(pair.from)?.card.image)"
                :src="imageUrl(cardAt(pair.from)?.card.image)"
                :alt="cardName(pair.from)"
                class="h-12 w-8 shrink-0 rounded object-cover shadow"
                :class="{ 'rotate-180': cardAt(pair.from)?.orientation === 'reversed' }"
              />
              <span class="leading-tight">
                <span class="font-medium">{{ cardName(pair.from) }}</span>
                <span v-if="isReversed(pair.from)" class="text-rose-200/90">逆</span>
                <span class="ml-1 text-[11px] text-stone-400/80">（{{ positionLabel(pair.from) }}）</span>
              </span>
            </span>

            <span class="text-stone-500">──{{ pair.kindLabel ?? '對應' }}──</span>

            <span class="inline-flex items-center gap-2">
              <img
                v-if="imageUrl(cardAt(pair.to)?.card.image)"
                :src="imageUrl(cardAt(pair.to)?.card.image)"
                :alt="cardName(pair.to)"
                class="h-12 w-8 shrink-0 rounded object-cover shadow"
                :class="{ 'rotate-180': cardAt(pair.to)?.orientation === 'reversed' }"
              />
              <span class="leading-tight">
                <span class="font-medium">{{ cardName(pair.to) }}</span>
                <span v-if="isReversed(pair.to)" class="text-rose-200/90">逆</span>
                <span class="ml-1 text-[11px] text-stone-400/80">（{{ positionLabel(pair.to) }}）</span>
              </span>
            </span>

            <span class="rounded-full border px-2.5 py-0.5 text-xs" :class="RELATION_STYLES[pair.relation]">
              {{ pair.relationLabel }}
            </span>
          </div>

          <p class="mt-3 text-sm leading-7 text-stone-300/85">{{ pair.text }}</p>
        </li>
      </ul>
    </section>

    <section v-if="analysis.numberStage" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">走到哪個階段</h3>
      <p class="text-sm leading-7 text-stone-200/85">{{ analysis.numberStage.text }}</p>
    </section>

    <!-- 元素與數字跟階段是同一類資訊，放在一起看比較連貫 -->
    <section v-if="elementNumberTags.length > 0 || analysis.theme.elementNumberText" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">元素與數字</h3>
      <div v-if="elementNumberTags.length > 0" class="flex flex-wrap gap-2">
        <span
          v-for="tag in elementNumberTags"
          :key="tag"
          class="rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs text-amber-50"
        >
          {{ tag }}
        </span>
      </div>
      <p v-if="analysis.theme.elementNumberText" class="text-sm leading-7 text-stone-200/85">
        {{ analysis.theme.elementNumberText }}
      </p>
    </section>

    <!-- 沒有宮廷牌時後端也會給一句說明，所以有 courtSummary 就要顯示整區 -->
    <section v-if="analysis.courts.length > 0 || analysis.courtSummary" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">宮廷牌的影響</h3>
      <p v-if="analysis.courtSummary" class="text-sm leading-7 text-stone-200/85">
        {{ analysis.courtSummary }}
      </p>
      <ul v-if="analysis.courts.length > 0" class="space-y-2 text-sm leading-7 text-stone-200/85">
        <li v-for="court in analysis.courts" :key="court.index">{{ court.text }}</li>
      </ul>
    </section>

    <section v-if="notes.length > 0" class="space-y-3">
      <h3 class="text-lg font-semibold text-stone-50">互相矛盾、還不明朗的地方</h3>
      <ul class="space-y-2">
        <li
          v-for="(note, index) in notes"
          :key="`${note.type}-${index}`"
          class="rounded-2xl border border-dashed border-white/15 bg-black/15 px-4 py-2 text-sm leading-7 text-stone-300/80"
        >
          {{ note.text }}
        </li>
      </ul>
    </section>
  </div>
</template>
