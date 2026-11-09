<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { useScrollLock } from '../../lib/useScrollLock'

// 自訂股票追蹤的「詳細」彈窗外框：卡片／表格點一檔就開，內容（行情摘要、技術判讀、重大訊息、走勢與籌碼、持股編輯、
// 清單、提醒、移除）由父元件放進預設插槽，沿用原本展開後的那一段。外觀和個股分析彈窗一致：手機全螢幕、桌機置中。
// escDisabled：上面又疊了一個彈窗（個股分析）時，Esc 只關最上面那個
const props = defineProps<{ title: string; escDisabled?: boolean }>()
const emit = defineEmits<{ close: [] }>()

useScrollLock()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.escDisabled) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-overlay md:p-6" @click.self="emit('close')">
      <div
        class="flex h-full w-full flex-col bg-surface text-ink md:h-auto md:max-h-[90vh] md:max-w-3xl md:border-2 md:border-frame md:shadow-[6px_6px_0_var(--c-shade)]"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <div class="flex items-start justify-between gap-3 border-b-2 border-frame px-4 py-3">
          <div class="min-w-0">
            <p class="text-caption uppercase tracking-[0.2em] text-ink-muted">Watchlist</p>
            <p class="truncate font-pixel text-[12px] text-accent">{{ title }}</p>
          </div>
          <button
            type="button"
            class="-mr-1 shrink-0 cursor-pointer border-2 border-tint/10 px-3 py-1.5 font-pixel text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
            @click="emit('close')"
          >
            關閉
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
