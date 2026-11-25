<script setup lang="ts">
// 雷諾曼的組合分析（v27 3-9、3-12）。
// 文字全部是後端 formatter 產生的 text.sections，照後端給的順序顯示；撲克花色那一段放到 LenormandSuitPanel 獨立一區。
// 前端只用結構化欄位做上面那一排摘要標籤（整體牌性、吉凶張數、關鍵牌有沒有出現），不組句子
import { computed } from 'vue'

import { LEAN_LABELS, TONE_LABELS, toneClass } from '../../lib/lenormandLabels'
import type { LenormandAnalysis, LenormandReadingCard, LenormandTextSection } from '../../types'

const props = defineProps<{
  analysis: LenormandAnalysis
  sections: LenormandTextSection[]
  cards: LenormandReadingCard[]
  // 牌號 → 牌名（/cards）；用來寫出關鍵牌的名字
  cardNames: Map<number, string>
}>()

// 花色在自己的區塊；大藍圖的幾段（中心與距離、宮位、主題牌、騎士跳、鏡射）跟著 GrandTableau 的看法顯示，這裡不重複
const OWN_PLACE = new Set(['suits', 'center', 'houses', 'themeCard', 'knighting', 'mirrors'])
const analysisSections = computed(() => props.sections.filter((section) => !OWN_PLACE.has(section.key)))

// 問題類型對應的主題牌（L8，例如工作看錨）。畫面上叫「關鍵牌」：主題牌陣的中間位置也叫「主題牌」，兩個意思不同，
// 同時出現會看不懂（2026-11-25 測試時發現）。牌名從 /cards 查，還沒載到時只寫牌號
const themeCard = computed(() => {
  const { themeCardId, themeIndex } = props.analysis.domain
  if (themeCardId === null) return null
  const entry = themeIndex === null ? null : props.cards[themeIndex]
  const name = props.cardNames.get(themeCardId)
  return { appeared: Boolean(entry), label: name ? `${themeCardId} ${name}` : `第 ${themeCardId} 張`, position: entry?.position.label ?? null }
})

const TONE_ORDER = ['positive', 'negative', 'neutral'] as const
</script>

<template>
  <section class="space-y-4 border-2 border-tint/10 bg-sink/45 p-4 sm:p-5">
    <h2 class="font-pixel text-title text-ink">組合分析</h2>

    <!-- 摘要：整體牌性、吉凶張數、這次的問題類型與主題牌。大藍圖的牌性只算中心周圍（tone.scope = near），標籤跟著改 -->
    <div class="flex flex-wrap items-center gap-2 text-caption">
      <span class="border-2 px-2 py-0.5 font-medium" :class="toneClass(analysis.tone.lean)">
        {{ analysis.tone.scope === 'near' ? '中心周圍' : '整體' }}{{ LEAN_LABELS[analysis.tone.lean] }}
      </span>
      <span
        v-for="tone in TONE_ORDER"
        :key="tone"
        class="border-2 px-2 py-0.5 tabular-nums"
        :class="toneClass(tone)"
      >
        {{ TONE_LABELS[tone] }} {{ analysis.tone.counts[tone] }}
      </span>
      <span v-if="analysis.domain.label" class="border-2 border-tint/15 bg-tint/5 px-2 py-0.5 text-ink-soft">
        問題類型：{{ analysis.domain.label }}{{ analysis.domain.source === 'selected' ? '' : '（由問題判斷）' }}
      </span>
      <span
        v-if="themeCard"
        class="border-2 px-2 py-0.5"
        :class="themeCard.appeared ? 'border-accent-hue/40 bg-accent-hue/10 text-accent' : 'border-tint/15 bg-tint/5 text-ink-muted'"
      >
        {{ analysis.domain.label }}的關鍵牌：{{ themeCard.label }}{{ themeCard.appeared ? `（在${themeCard.position}）` : '（這次沒有出現）' }}
      </span>
    </div>

    <!-- 後端 formatter 的段落：整體牌性、成對組合、特殊組合、視線、九宮格 -->
    <div v-if="analysisSections.length" class="space-y-4">
      <div v-for="section in analysisSections" :key="section.key" class="space-y-1.5">
        <h3 class="text-subtitle font-medium text-accent">{{ section.title }}</h3>
        <ul class="space-y-1.5 text-body text-ink-soft">
          <li v-for="(line, index) in section.lines" :key="index" class="flex gap-2">
            <span class="shrink-0 text-ink-muted" aria-hidden="true">・</span>
            <span class="min-w-0">{{ line }}</span>
          </li>
        </ul>
      </div>
    </div>
    <p v-else class="text-body text-ink-muted">這次沒有可以顯示的組合分析。</p>
  </section>
</template>
