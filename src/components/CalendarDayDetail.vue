<script setup lang="ts">
// 月曆點某一天的內容（v26 計畫 1）：當天的每日一牌與當天的占卜紀錄（點了打開我的紀錄那一筆）。
// 桌機放在月曆右邊，手機包在 CalendarDayDialog 的彈窗裡，內容共用這個元件。
// 計畫 2：列出當天寫的日記（點了到那篇的日記頁）。每日一牌的日記 2026-11-20 使用者決定拿掉
import { ref, watch } from 'vue'

import { cardImageUrl } from '../lib/cardStyle'
import { dayTitle, timeOf } from '../lib/calendarDays'
import { outcomeLabel } from '../lib/journal'
import { journalPathOf } from '../lib/stockJournal'
import type { CalendarDay } from '../types'
import DailyCardViewDialog from './DailyCardViewDialog.vue'

const props = defineProps<{ date: string; day: CalendarDay | null; today: string }>()

// 日記頁的網址：/journal/reading/<id> 或 /journal/daily/<日期>；點一篇帶 ?entry=<日記 id>，日記頁直接以唯讀打開那一篇
// 股票日記一檔一本（stock:tw:0050 → /journal/stock/tw/0050），v26 計畫 2-2
const journalPath = journalPathOf

const isFuture = () => props.date > props.today

// 那天的牌的小彈窗；換一天就關掉
const cardOpen = ref(false)
watch(
  () => props.date,
  () => (cardOpen.value = false),
)
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-subtitle font-semibold text-ink">{{ dayTitle(date, today) }}</h3>

    <p v-if="isFuture()" class="text-body text-ink-muted">還沒到這一天。</p>

    <template v-else>
      <!-- 當天的每日一牌 -->
      <!-- 點牌開小彈窗看完整內容（和今天的牌一樣，2026-11-20 使用者要求）；舊版後端沒有 detail 時只顯示不能點 -->
      <component
        :is="day.dailyCard.detail ? 'button' : 'div'"
        v-if="day?.dailyCard"
        :type="day.dailyCard.detail ? 'button' : undefined"
        class="flex w-full items-center gap-3 text-left"
        :class="day.dailyCard.detail ? 'cursor-pointer border border-line bg-raised p-2 transition hover:border-accent-hue/40 hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]' : ''"
        @click="day.dailyCard.detail && (cardOpen = true)"
      >
        <img
          v-if="cardImageUrl(day.dailyCard.image)"
          :src="cardImageUrl(day.dailyCard.image)"
          :alt="day.dailyCard.nameZh"
          class="w-14 shrink-0 rounded"
          :class="day.dailyCard.orientation === 'reversed' ? 'rotate-180' : ''"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-caption text-ink-muted">每日一牌</span>
          <span class="block text-body text-ink">
            {{ day.dailyCard.nameZh }}<span class="ml-1 text-caption text-accent">{{ day.dailyCard.orientation === 'reversed' ? '逆位' : '正位' }}</span>
          </span>
        </span>
        <span v-if="day.dailyCard.detail" class="shrink-0 text-caption text-accent">看牌義 ›</span>
      </component>
      <p v-else class="text-body text-ink-muted">{{ date === today ? '今天還沒抽每日一牌。' : '這天沒有抽每日一牌。' }}</p>

      <!-- 當天的占卜紀錄 -->
      <div class="space-y-2">
        <p class="text-caption text-ink-muted">當天的占卜{{ day?.readings.length ? `（${day.readings.length} 筆）` : '' }}</p>
        <p v-if="!day?.readings.length" class="text-body text-ink-muted">這天沒有占卜紀錄。</p>
        <ul v-else class="space-y-2">
          <li v-for="reading in day.readings" :key="reading.id">
            <router-link
              :to="{ name: 'history', query: { id: reading.id } }"
              class="block border border-line bg-raised px-3 py-2 transition hover:border-accent-hue/40 hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
            >
              <p class="flex items-baseline justify-between gap-2">
                <span class="min-w-0 truncate text-body text-ink" :title="reading.question || '（沒有寫問題）'">{{ reading.question || '（沒有寫問題）' }}</span>
                <span class="shrink-0 text-caption tabular-nums text-ink-muted">{{ timeOf(reading.createdAt) }}</span>
              </p>
              <p class="mt-0.5 truncate text-caption text-ink-muted">
                {{ reading.spreadName }}<template v-if="reading.cards.length">．{{ reading.cards.join('、') }}</template>
              </p>
            </router-link>
          </li>
        </ul>
      </div>

      <!-- 當天寫的日記（每日一牌與占卜紀錄底下的都算） -->
      <div v-if="day?.journals?.length" class="space-y-2">
        <p class="text-caption text-ink-muted">當天寫的日記（{{ day.journals.length }} 篇）</p>
        <ul class="space-y-2">
          <li v-for="journal in day.journals" :key="journal.id">
            <router-link
              :to="{ path: journalPath(journal.target), query: { entry: journal.id } }"
              class="block border border-line bg-raised px-3 py-2 transition hover:border-accent-hue/40 hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
            >
              <p class="text-caption text-accent">{{ journal.target.startsWith('stock:') ? '股票日記' : '占卜紀錄' }}．{{ outcomeLabel(journal.outcome) }}</p>
              <p class="mt-0.5 truncate text-body font-semibold text-ink">{{ journal.title || journal.text || '（只標了結果）' }}</p>
              <p v-if="journal.title && journal.text" class="truncate text-caption text-ink-muted">{{ journal.text }}</p>
            </router-link>
          </li>
        </ul>
      </div>
    </template>

    <DailyCardViewDialog v-if="cardOpen && day?.dailyCard?.detail" :daily-card="day.dailyCard.detail" :today="today" @close="cardOpen = false" />
  </div>
</template>
