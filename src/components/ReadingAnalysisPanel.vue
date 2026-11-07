<script setup lang="ts">
import { computed } from 'vue'

import { cardImageUrl } from '../lib/cardStyle'
import type { Element, NumberStageStep, PairRelation, ReadingAnalysis, ReadingCard, Suit } from '../types'

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
  queen: '皇后',
  king: '國王',
}

// 這個徽章講的是元素關係，不是好壞。原本綠配紅會讓人以為綠色＝好事，
// 但旁邊的辭典文字講的是牌義，兩者常常相反。改成不帶褒貶的色系。
const RELATION_STYLES: Record<PairRelation, string> = {
  enhance: 'border-accent-hue/25 bg-accent-hue/8 text-accent/90',
  weaken: 'border-mystic-hue/25 bg-mystic-hue/8 text-mystic-ink/90',
  cause: 'border-info-hue/25 bg-info-hue/8 text-info-ink/90',
  neutral: 'border-tint/15 bg-tint/5 text-ink-muted',
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

// 「元素」區的標籤。數字重複改由「走到哪個階段」講（v11），這裡只留元素與缺少的花色
const elementNumberTags = computed(() => {
  const { theme } = props.analysis
  const tags: string[] = []

  if (theme.dominantElements.length > 0) {
    tags.push(`${theme.dominantElements.map((element) => ELEMENT_LABELS[element]).join('、')}元素最多`)
  }
  if (theme.missingSuits.length > 0) {
    tags.push(`沒有${theme.missingSuits.map((suit) => SUIT_LABELS[suit]).join('、')}`)
  }

  return tags
})

const notes = computed(() => [...props.analysis.conflicts, ...props.analysis.uncertainties])

// 數字階段的時間軸。後端有給 steps／timeline（v11）才畫，否則退回整段文字。
// 時間線上的格子依時間先後串箭頭；其他格（負面影響、資源…）不是時間點，只列出不串。
const stageView = computed(() => {
  const stage = props.analysis.numberStage
  if (!stage?.steps || !stage.timeline || stage.summary === undefined) {
    return null
  }
  const byIndex = new Map(stage.steps.map((step) => [step.index, step]))
  const timeline = stage.timeline
    .map((index) => byIndex.get(index))
    .filter((step): step is NumberStageStep => Boolean(step))
  const inTimeline = new Set(stage.timeline)
  // 少於兩格不算時間線，全部當成「各格」列出
  const hasTimeline = timeline.length >= 2
  return {
    timeline: hasTimeline ? timeline : [],
    others: stage.steps.filter((step) => !hasTimeline || !inTimeline.has(step.index)),
    summary: stage.summary,
  }
})

const ALIGNMENT_BADGES: Record<string, { label: string; style: string }> = {
  aligned: { label: '對焦', style: 'border-down-hue/30 bg-down-hue/10 text-down-ink' },
  partial: { label: '部分回應', style: 'border-info-hue/30 bg-info-hue/10 text-info-ink' },
  mismatch: { label: '偏離', style: 'border-danger-hue/30 bg-danger-hue/10 text-danger' },
  noMinor: { label: '全為大牌', style: 'border-accent-hue/20 bg-accent-hue/10 text-accent' },
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
  <div class="min-w-0 space-y-4 rounded-[1.5rem] border border-tint/10 bg-sink/45 p-4 sm:space-y-5 sm:rounded-[1.75rem] sm:p-5">
    <p class="text-[10px] uppercase tracking-[0.2em] text-ink-muted sm:text-xs sm:tracking-[0.3em]">Combination Analysis</p>

    <!-- data-nav：浮動選單「跳到段落」的目標（見 lib/sectionNav.ts），文字和標題一致 -->

    <section data-nav="整體在說什麼" data-nav-level="2" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">整體在說什麼</h3>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="tag in themeTags"
          :key="tag"
          class="rounded-full border border-accent-hue/20 bg-accent-hue/10 px-3 py-1 text-xs text-accent"
        >
          {{ tag }}
        </span>
      </div>
      <p class="text-sm leading-7 text-ink-soft/85">{{ analysis.theme.text }}</p>
    </section>

    <section data-nav="牌面有回答到你的問題嗎" data-nav-level="2" v-if="analysis.question" class="space-y-3">
      <div class="flex items-center gap-2">
        <h3 class="text-base font-semibold text-ink sm:text-lg">牌面有回答到你的問題嗎</h3>
        <span
          class="rounded-full border px-2.5 py-0.5 text-xs"
          :class="ALIGNMENT_BADGES[analysis.question.alignment]?.style"
        >
          {{ ALIGNMENT_BADGES[analysis.question.alignment]?.label }}
        </span>
      </div>
      <p class="text-sm leading-7 text-ink-soft/85">{{ analysis.question.text }}</p>
    </section>

    <section data-nav="這件事有多大" data-nav-level="2" v-if="analysis.weights" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">這件事有多大</h3>
      <div class="grid min-w-0 gap-3 sm:grid-cols-2">
        <div
          v-for="meter in weightMeters"
          :key="meter.name"
          class="rounded-2xl border border-tint/10 bg-tint/5 px-4 py-3"
        >
          <div class="flex items-center justify-between text-sm">
            <span class="text-ink-muted">{{ meter.name }}</span>
            <span class="font-medium text-accent">{{ meter.label }}</span>
          </div>
          <div class="mt-2 flex gap-1.5" :aria-label="`${meter.name}：${meter.label}`">
            <span
              v-for="step in 3"
              :key="step"
              class="h-1.5 flex-1 rounded-full"
              :class="step <= (meter.level ?? 0) ? 'bg-accent-hue/80' : 'bg-tint/10'"
            />
          </div>
        </div>
      </div>
      <p class="text-sm leading-7 text-ink-soft/85">{{ analysis.weights.text }}</p>
    </section>

    <section data-nav="各個位置看出什麼" data-nav-level="2" v-if="analysis.positions && analysis.positions.length > 0" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">各個位置看出什麼</h3>
      <ul class="list-disc space-y-1 pl-5 text-sm leading-7 text-ink-soft/85 marker:text-warn">
        <li v-for="finding in analysis.positions" :key="`${finding.type}-${finding.evidence.join('-')}`">
          {{ finding.text }}
        </li>
      </ul>
    </section>

    <section data-nav="牌跟牌之間的關係" data-nav-level="2" v-if="analysis.pairs.length > 0" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">牌跟牌之間的關係</h3>
      <ul class="space-y-3">
        <li
          v-for="pair in analysis.pairs"
          :key="`${pair.from}-${pair.to}`"
          class="rounded-3xl border border-tint/10 bg-tint/5 p-4"
        >
          <!-- 每張縮圖貼著自己的牌名，不要兩張疊在一起看不出誰是誰 -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink">
            <span class="inline-flex items-center gap-2">
              <img
                v-if="cardImageUrl(cardAt(pair.from)?.card.image)"
                :src="cardImageUrl(cardAt(pair.from)?.card.image)"
                :alt="cardName(pair.from)"
                class="h-12 w-7 shrink-0 rounded object-cover shadow"
                :class="{ 'rotate-180': cardAt(pair.from)?.orientation === 'reversed' }"
              />
              <span class="leading-tight">
                <span class="font-medium">{{ cardName(pair.from) }}</span>
                <span v-if="isReversed(pair.from)" class="text-danger/90">逆</span>
                <span class="ml-1 text-[11px] text-ink-muted">（{{ positionLabel(pair.from) }}）</span>
              </span>
            </span>

            <span class="text-ink-muted">──{{ pair.kindLabel ?? '對應' }}──</span>

            <span class="inline-flex items-center gap-2">
              <img
                v-if="cardImageUrl(cardAt(pair.to)?.card.image)"
                :src="cardImageUrl(cardAt(pair.to)?.card.image)"
                :alt="cardName(pair.to)"
                class="h-12 w-7 shrink-0 rounded object-cover shadow"
                :class="{ 'rotate-180': cardAt(pair.to)?.orientation === 'reversed' }"
              />
              <span class="leading-tight">
                <span class="font-medium">{{ cardName(pair.to) }}</span>
                <span v-if="isReversed(pair.to)" class="text-danger/90">逆</span>
                <span class="ml-1 text-[11px] text-ink-muted">（{{ positionLabel(pair.to) }}）</span>
              </span>
            </span>

            <span class="rounded-full border px-2.5 py-0.5 text-xs" :class="RELATION_STYLES[pair.relation]">
              {{ pair.relationLabel }}
            </span>
          </div>

          <p class="mt-3 text-sm leading-7 text-ink-muted/85">{{ pair.text }}</p>
        </li>
      </ul>
    </section>

    <section data-nav="走到哪個階段" data-nav-level="2" v-if="analysis.numberStage" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">走到哪個階段</h3>
      <p class="text-xs leading-5 text-ink-muted">
        數字 1 到 10 是一件事從開始到結束的過程；大牌取化簡後的數字，宮廷牌依階級對應。
      </p>

      <template v-if="stageView">
        <!-- 時間線：依時間先後串箭頭 -->
        <div v-if="stageView.timeline.length > 0" class="flex flex-wrap items-center gap-x-1.5 gap-y-2">
          <template v-for="(step, i) in stageView.timeline" :key="step.index">
            <span v-if="i > 0" class="text-ink-muted" aria-hidden="true">→</span>
            <div class="min-w-0 rounded-2xl border border-accent-hue/20 bg-accent-hue/5 px-3 py-1.5">
              <p v-if="step.label" class="text-[10px] text-ink-muted">{{ step.label }}</p>
              <p class="text-sm text-ink">
                {{ step.name }}<span class="ml-1 text-xs text-ink-muted">{{ step.mark }}</span>
              </p>
              <p class="text-xs text-accent">{{ step.stageLabel }}</p>
            </div>
          </template>
        </div>

        <!-- 其他格：不是時間點，只列出落在哪個階段 -->
        <div v-if="stageView.others.length > 0" class="space-y-2">
          <p v-if="stageView.timeline.length > 0" class="text-xs text-ink-muted">其他格（不是時間點，不算進走向）</p>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="step in stageView.others"
              :key="step.index"
              class="min-w-0 rounded-2xl border border-tint/10 bg-tint/5 px-3 py-1.5"
            >
              <p v-if="step.label" class="text-[10px] text-ink-muted">{{ step.label }}</p>
              <p class="text-sm text-ink-soft">
                {{ step.name }}<span class="ml-1 text-xs text-ink-muted">{{ step.mark }}</span>
              </p>
              <p class="text-xs text-ink-muted">{{ step.stageLabel }}</p>
            </div>
          </div>
        </div>

        <p v-if="stageView.summary" class="text-sm leading-7 text-ink-soft/85">{{ stageView.summary }}</p>
      </template>
      <!-- 舊版後端沒有 steps，直接顯示整段文字 -->
      <p v-else class="text-sm leading-7 text-ink-soft/85">{{ analysis.numberStage.text }}</p>
    </section>

    <!-- 元素區：數字重複已移到「走到哪個階段」，這裡只講元素與缺少的花色 -->
    <section data-nav="元素" data-nav-level="2" v-if="elementNumberTags.length > 0 || analysis.theme.elementNumberText" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">元素</h3>
      <div v-if="elementNumberTags.length > 0" class="flex flex-wrap gap-2">
        <span
          v-for="tag in elementNumberTags"
          :key="tag"
          class="rounded-full border border-accent-hue/20 bg-accent-hue/10 px-3 py-1 text-xs text-accent"
        >
          {{ tag }}
        </span>
      </div>
      <p v-if="analysis.theme.elementNumberText" class="text-sm leading-7 text-ink-soft/85">
        {{ analysis.theme.elementNumberText }}
      </p>
    </section>

    <!-- 沒有宮廷牌時後端也會給一句說明，所以有 courtSummary 就要顯示整區 -->
    <section data-nav="宮廷牌的影響" data-nav-level="2" v-if="analysis.courts.length > 0 || analysis.courtSummary" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">宮廷牌的影響</h3>
      <p v-if="analysis.courtSummary" class="text-sm leading-7 text-ink-soft/85">
        {{ analysis.courtSummary }}
      </p>
      <ul v-if="analysis.courts.length > 0" class="space-y-2 text-sm leading-7 text-ink-soft/85">
        <li v-for="court in analysis.courts" :key="court.index">{{ court.text }}</li>
      </ul>
    </section>

    <section data-nav="互相矛盾、還不明朗的地方" data-nav-level="2" v-if="notes.length > 0" class="space-y-3">
      <h3 class="text-base font-semibold text-ink sm:text-lg">互相矛盾、還不明朗的地方</h3>
      <ul class="space-y-2">
        <li
          v-for="(note, index) in notes"
          :key="`${note.type}-${index}`"
          class="rounded-2xl border border-dashed border-tint/15 bg-sink/15 px-4 py-2 text-sm leading-7 text-ink-muted"
        >
          {{ note.text }}
        </li>
      </ul>
    </section>
  </div>
</template>
