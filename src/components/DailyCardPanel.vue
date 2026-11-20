<script setup lang="ts">
// 每日一牌（v26 計畫 1）：今天還沒抽時顯示牌背與「抽今天的牌」；抽了就顯示牌面、核心訊息、今天可以做的事與連續天數。
// 文字（message、advice）都由後端給，這裡不組句子。每天一張、抽了就固定（D1），所以抽完不提供重抽
import type { DailyCard } from '../types'
import DailyCardFace from './DailyCardFace.vue'
import SkeletonBlock from './SkeletonBlock.vue'

defineProps<{
  dailyCard: DailyCard | null
  streak: number
  // 第一次載入今天的牌
  loading: boolean
  // 正在抽
  drawing: boolean
  error: string
  // 訪客抽的不會存
  saved: boolean
  // 月曆頁：還沒抽時多一行明顯的提醒（2026-11-20 使用者要求「月曆那邊提醒今天還沒抽」）
  reminder?: boolean
}>()
const emit = defineEmits<{ draw: [] }>()
</script>

<template>
  <section class="rounded-[1.75rem] border border-line bg-surface/90 p-5 sm:p-6" aria-labelledby="daily-card-title">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id="daily-card-title" class="text-title font-semibold text-ink">今天的牌</h2>
      <p v-if="streak > 0" class="text-caption text-accent">已經連續 {{ streak }} 天</p>
    </div>

    <!-- 載入中：和抽完後同樣的版面（桌機牌在左、文字在右；手機上下） -->
    <div v-if="loading" class="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">
      <SkeletonBlock class="aspect-[2/3] w-24 shrink-0 rounded-md" />
      <div class="w-full space-y-3">
        <SkeletonBlock class="mx-auto h-6 w-32 sm:mx-0" />
        <SkeletonBlock class="h-4 w-full" />
        <SkeletonBlock class="h-4 w-4/5" />
      </div>
    </div>

    <!-- 還沒抽：牌背與提醒、按鈕（桌機左右、手機上下） -->
    <div v-else-if="!dailyCard" class="mt-4 flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-5 sm:text-left">
      <div
        class="aspect-[2/3] w-24 shrink-0 border-2 border-accent-hue/40 [background-image:var(--pixel-card-back)] [background-size:100%_100%] [image-rendering:pixelated] shadow-[4px_4px_0_var(--c-shade)]"
        aria-hidden="true"
      />
      <div class="space-y-3">
        <p v-if="reminder" class="text-subtitle font-semibold text-warn" role="status">今天的每日一抽還沒做</p>
        <p class="text-body text-ink-soft">每天一張，抽了就是今天的牌。</p>
        <button
          type="button"
          class="h-10 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/10 px-4 font-pixel text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-wait disabled:opacity-60"
          :disabled="drawing"
          @click="emit('draw')"
        >
          {{ drawing ? '抽牌中…' : '抽今天的牌' }}
        </button>
        <p v-if="error" class="text-caption text-danger" role="alert">{{ error }}</p>
      </div>
    </div>

    <!-- 抽好了（DailyCardFace，月曆點牌的小彈窗也用它） -->
    <div v-else class="mt-4 space-y-3">
      <DailyCardFace :daily-card="dailyCard" />
      <p v-if="!saved" class="text-caption text-ink-muted">登入後抽的牌會存進月曆。</p>
    </div>
  </section>
</template>
