<script setup lang="ts">
// AI 解讀的回饋（v25 階段 4）：有幫助／沒幫助，沒幫助時可以選原因。
// 只在已經是紀錄（有 id）時顯示：回饋存在那筆紀錄上，之後用來統計哪類問題寫得不好。
// 按下去先換畫面、再送出，失敗就換回原本的樣子並顯示原因
import { ref } from 'vue'

import { updateNarrationFeedback } from '../lib/api'
import {
  NARRATION_FEEDBACK_REASONS,
  type NarrationFeedback,
  type NarrationFeedbackReason,
  type NarrationFeedbackValue,
} from '../types'

const props = defineProps<{
  readingId: string
  target: 'narration' | 'followUp'
  // 紀錄裡原本的回饋；重新產生後外層用 key 換一個新的元件，這裡只讀一次
  initial?: NarrationFeedback | null
}>()

const current = ref<NarrationFeedback | null>(props.initial ?? null)
const saving = ref(false)
const error = ref('')
const savedOnce = ref(false)
let requestId = 0

async function send(next: NarrationFeedback | null) {
  const previous = current.value
  current.value = next
  error.value = ''
  saving.value = true
  const own = ++requestId
  try {
    await updateNarrationFeedback(props.readingId, {
      target: props.target,
      value: next?.value ?? null,
      reason: next?.reason ?? null,
    })
    if (own === requestId) savedOnce.value = true
  } catch (err) {
    if (own !== requestId) return
    current.value = previous
    error.value = err instanceof Error ? err.message : '回饋沒有送出，請再試一次。'
  } finally {
    if (own === requestId) saving.value = false
  }
}

// 再按一次同一個就是取消
function choose(value: NarrationFeedbackValue) {
  void send(current.value?.value === value ? null : { value, reason: null })
}

function chooseReason(reason: NarrationFeedbackReason) {
  void send({ value: 'down', reason: current.value?.reason === reason ? null : reason })
}

const OPTIONS: { value: NarrationFeedbackValue; label: string }[] = [
  { value: 'up', label: '有幫助' },
  { value: 'down', label: '沒幫助' },
]
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="text-caption text-ink-soft">{{ target === 'followUp' ? '這次的回答有幫助嗎？' : '這篇解讀有幫助嗎？' }}</span>
      <div class="flex gap-1" role="group" :aria-label="target === 'followUp' ? '追問回答的回饋' : 'AI 解讀的回饋'">
        <button
          v-for="option in OPTIONS"
          :key="option.value"
          type="button"
          class="h-8 cursor-pointer whitespace-nowrap border-2 px-3 text-button transition active:translate-x-[1px] active:translate-y-[1px] font-pixel"
          :class="current?.value === option.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
          :aria-pressed="current?.value === option.value"
          @click="choose(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <span class="text-caption text-ink-muted" aria-live="polite">
        <template v-if="error">{{ error }}</template>
        <template v-else-if="saving">送出中…</template>
        <template v-else-if="savedOnce && current">謝謝，已記下。</template>
      </span>
    </div>

    <!-- 沒幫助時才問原因（可以不選） -->
    <div v-if="current?.value === 'down'" class="flex flex-wrap items-center gap-1" role="group" aria-label="沒幫助的原因">
      <span class="mr-2 text-caption text-ink-muted">哪裡不好？</span>
      <button
        v-for="reason in NARRATION_FEEDBACK_REASONS"
        :key="reason.value"
        type="button"
        class="h-8 cursor-pointer whitespace-nowrap border-2 px-3 text-button transition active:translate-x-[1px] active:translate-y-[1px] font-pixel"
        :class="current?.reason === reason.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
        :aria-pressed="current?.reason === reason.value"
        @click="chooseReason(reason.value)"
      >
        {{ reason.label }}
      </button>
    </div>
  </div>
</template>
