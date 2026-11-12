<script setup lang="ts">
import { formatNumber } from '../../lib/marketChart'

// 操作建議的一個價位（停損／出場、目標／減碼、年線）：第一行價位＋右邊「設提醒」按鈕，說明在下一行佔滿寬度。
// 2026-11-12 使用者回報：按鈕有的在價位下面一行、有的接在說明後面被擠到下一行，卡片之間對不齊；統一成這一種排法。
// 按鈕的三種字（設提醒／設定中…／已設提醒）疊在同一格、保留最寬的寬度，切換時不變寬（見 ui-check 第 1 類）
const props = defineProps<{
  price: number
  label?: string
  tone: 'down' | 'up' | 'accent'
  // 沒有標的資訊時不能設提醒，不顯示按鈕
  canAlert: boolean
  state: 'idle' | 'saving' | 'saved'
  error?: string
}>()
const emit = defineEmits<{ alert: [] }>()

const BUTTON_TONES = {
  down: 'border-down-hue/30 text-down-ink hover:bg-down-hue/10',
  up: 'border-up-hue/30 text-up-ink hover:bg-up-hue/10',
  accent: 'border-accent-hue/30 text-accent hover:bg-accent-hue/10',
} as const
const LABELS = { idle: '設提醒', saving: '設定中…', saved: '已設提醒' } as const

function onClick() {
  if (props.state === 'idle') emit('alert')
}
</script>

<template>
  <div>
    <!-- 價位和按鈕同一行，說明另起一行佔滿寬度：說明可能很長（例如「最遠設到 −10%（…），收盤跌破才算」），
         擠在按鈕左邊時三欄排版下一行只剩四五個字（2026-11-12 使用者回報） -->
    <div class="flex items-center justify-between gap-3">
      <p class="min-w-0 text-subtitle font-semibold tabular-nums text-ink">{{ formatNumber(price) }}</p>
      <button
        v-if="canAlert"
        type="button"
        class="grid shrink-0 cursor-pointer whitespace-nowrap border-2 px-2 py-1 text-button transition active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-default disabled:opacity-60 font-pixel"
        :class="BUTTON_TONES[tone]"
        :disabled="state !== 'idle'"
        @click="onClick"
      >
        <span
          v-for="key in (['idle', 'saving', 'saved'] as const)"
          :key="key"
          class="[grid-area:1/1] text-center"
          :class="state === key ? '' : 'invisible'"
          :aria-hidden="state !== key"
        >
          {{ LABELS[key] }}
        </span>
      </button>
    </div>
    <p v-if="label" class="mt-1 text-caption text-ink-muted">{{ label }}</p>
    <p v-if="error" class="mt-1 text-caption text-danger">{{ error }}</p>
  </div>
</template>
