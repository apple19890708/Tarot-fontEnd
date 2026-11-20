<script setup lang="ts">
// 一張每日一牌的內容：桌機（sm 以上）牌在左、文字在右，手機牌在上、文字在下（2026-11-20 使用者要求佔版小一點）。
// 「今天的牌」面板與月曆點牌開的小彈窗共用，兩邊顯示的東西才會一樣。文字都由後端給，這裡不組句子
import { cardImageUrl } from '../lib/cardStyle'
import { taipeiToday } from '../lib/dailyCard'
import type { DailyCard } from '../types'

defineProps<{ dailyCard: DailyCard }>()
</script>

<template>
  <div class="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">
    <img
      v-if="cardImageUrl(dailyCard.card.image)"
      :src="cardImageUrl(dailyCard.card.image)"
      :alt="`${dailyCard.card.nameZh}${dailyCard.orientation === 'reversed' ? '（逆位）' : ''}`"
      class="w-24 shrink-0 rounded-md shadow-[4px_4px_0_var(--c-shade)]"
      :class="dailyCard.orientation === 'reversed' ? 'rotate-180' : ''"
    />
    <div class="w-full min-w-0 space-y-2.5">
      <p class="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 sm:justify-start">
        <span class="text-subtitle font-semibold text-ink">{{ dailyCard.card.nameZh }}</span>
        <span class="border border-accent-hue/40 px-1.5 text-caption text-accent">{{ dailyCard.orientation === 'reversed' ? '逆位' : '正位' }}</span>
        <span v-if="dailyCard.card.nameEn" class="text-caption text-ink-muted">{{ dailyCard.card.nameEn }}</span>
      </p>
      <p v-if="dailyCard.message" class="text-body leading-7 text-ink">{{ dailyCard.message }}</p>
      <p v-if="dailyCard.advice" class="text-body leading-7 text-ink-soft">
        <span class="text-accent">{{ dailyCard.date === taipeiToday() ? '今天可以做的：' : '那天可以做的：' }}</span>{{ dailyCard.advice }}
      </p>
      <ul v-if="dailyCard.card.keywords.length" class="flex flex-wrap gap-1.5" aria-label="關鍵詞">
        <li v-for="keyword in dailyCard.card.keywords" :key="keyword" class="border border-tint/15 px-2 py-0.5 text-caption text-ink-muted">{{ keyword }}</li>
      </ul>
    </div>
  </div>
</template>
