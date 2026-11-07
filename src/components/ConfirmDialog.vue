<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { confirmState, settleConfirm } from '../lib/confirm'
import { useScrollLock } from '../lib/useScrollLock'

// 全站共用的確認彈窗（呼叫方式見 lib/confirm.ts）。App.vue 在有待確認的事時才掛上，關閉就卸載。
// 按 Esc 或點背景等於取消；刪除類動作焦點預設停在「取消」，避免按 Enter 誤刪
useScrollLock()

const cancelButton = ref<HTMLButtonElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // 只關確認彈窗，不要讓底下的彈窗也收到 Esc 一起關掉
    event.stopImmediatePropagation()
    settleConfirm(false)
  }
  // 焦點只在兩顆按鈕之間切換
  if (event.key === 'Tab') {
    event.preventDefault()
    const next = document.activeElement === cancelButton.value ? confirmButton.value : cancelButton.value
    next?.focus()
  }
}

// 彈窗開之前的焦點，關掉後還回去
let previousFocus: HTMLElement | null = null

onMounted(async () => {
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  window.addEventListener('keydown', onKeydown, true)
  await nextTick()
  ;(confirmState.value?.danger ? cancelButton.value : confirmButton.value)?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="confirmState"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      @click.self="settleConfirm(false)"
    >
      <div
        class="w-full max-w-sm border-2 border-frame bg-surface text-ink shadow-[6px_6px_0_var(--c-shade)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        <p id="confirm-dialog-title" class="border-b-2 border-frame px-4 py-3 font-pixel text-[14px] text-accent">
          {{ confirmState.title ?? '確認' }}
        </p>
        <p id="confirm-dialog-message" class="whitespace-pre-line px-4 py-4 text-sm leading-7 text-ink-soft">{{ confirmState.message }}</p>
        <div class="flex justify-end gap-2 border-t border-tint/10 px-4 py-3">
          <button
            ref="cancelButton"
            type="button"
            class="cursor-pointer border-2 border-tint/15 px-3 py-1 font-pixel text-[14px] text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
            @click="settleConfirm(false)"
          >
            {{ confirmState.cancelText ?? '取消' }}
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="cursor-pointer border-2 px-3 py-1 font-pixel text-[14px] transition active:translate-x-[2px] active:translate-y-[2px]"
            :class="
              confirmState.danger
                ? 'border-danger-hue/50 bg-danger-hue/15 text-danger hover:bg-danger-hue/25'
                : 'border-accent-hue/40 bg-accent-hue/10 text-accent hover:bg-accent-hue/20'
            "
            @click="settleConfirm(true)"
          >
            {{ confirmState.confirmText ?? '確定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
