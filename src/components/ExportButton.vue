<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

import { downloadExport, type ExportFile } from '../lib/recordExport'

// 紀錄匯出按鈕（v13 階段 5）：按下產生一份 PDF 並下載，產生中顯示「產生中…」，完成後短暫顯示「已下載」。
// build 在按下的當下才呼叫，匯出的是畫面上最新的內容（例如剛重新產生的 AI 解讀）
// round：放在圓角按鈕旁邊（塔羅紀錄的刪除）時用圓角；其他地方是像素方框
const props = defineProps<{ build: () => ExportFile; round?: boolean }>()

const DONE_MS = 1800
const state = ref<'idle' | 'busy' | 'done'>('idle')
const error = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

async function onClick() {
  if (state.value === 'busy') return
  error.value = ''
  state.value = 'busy'
  try {
    await downloadExport(props.build())
    state.value = 'done'
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (state.value = 'idle'), DONE_MS)
  } catch (err) {
    state.value = 'idle'
    // 最常見的是網路斷掉、PDF 套件載不下來
    error.value = err instanceof Error ? `匯出失敗：${err.message}` : '匯出失敗，請再試一次。'
  }
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

const LABELS = { idle: '匯出 PDF', busy: '產生中…', done: '已下載' } as const
</script>

<template>
  <span class="inline-flex flex-col items-start gap-1">
    <button
      type="button"
      class="cursor-pointer text-button transition active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-wait"
      :class="[
        round ? 'rounded-full border px-4 py-1.5' : 'border-2 px-3 py-1 font-pixel',
        state === 'done' ? 'border-ok-hue/40 bg-ok-hue/10 text-ok' : 'border-tint/15 text-ink-soft hover:bg-tint/10',
      ]"
      :disabled="state === 'busy'"
      :aria-busy="state === 'busy'"
      title="下載成 PDF"
      @click="onClick"
    >
      <!-- 三種文字疊在同一格，按鈕寬度固定取最寬的那個，狀態切換時不會跳動 -->
      <span class="grid">
        <span
          v-for="(label, key) in LABELS"
          :key="key"
          class="col-start-1 row-start-1 whitespace-nowrap"
          :class="{ invisible: state !== key }"
          :aria-hidden="state !== key"
        >
          {{ label }}
        </span>
      </span>
    </button>
    <span v-if="error" class="text-caption text-danger" aria-live="polite">{{ error }}</span>
  </span>
</template>
