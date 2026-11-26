<script setup lang="ts">
import { computed, ref } from 'vue'

import { confirmState, settleConfirm } from '../lib/confirm'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useScrollLock } from '../lib/useScrollLock'

// 全站共用的確認彈窗（呼叫方式見 lib/confirm.ts）。App.vue 在有待確認的事時才掛上，關閉就卸載。
// 按 Esc 或點背景等於取消；刪除類動作焦點預設停在「取消」，避免按 Enter 誤刪
// 焦點管理（移進來、Tab 只在兩顆按鈕間循環、Esc、關掉後還回原本的焦點）交給 useDialogFocus
useScrollLock()

const dialogEl = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const confirmButton = ref<HTMLButtonElement | null>(null)

useDialogFocus(dialogEl, {
  initialFocus: computed(() => (confirmState.value?.danger ? cancelButton.value : null) ?? confirmButton.value),
  onEscape: () => settleConfirm(false),
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
        ref="dialogEl"
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
            v-if="!confirmState.alert"
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
