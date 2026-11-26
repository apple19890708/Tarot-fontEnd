<script setup lang="ts">
// 手機版：月曆點某一天時開的彈窗（置中、從上方滑下；桌機改在月曆右邊直接顯示，不開彈窗）。
// 照 ui-check 的彈出層規則：背景鎖捲動、Esc／點外面／按關閉都會關
import { ref } from 'vue'

import { useDialogFocus } from '../lib/useDialogFocus'
import { useScrollLock } from '../lib/useScrollLock'
import { dayTitle } from '../lib/calendarDays'
import type { CalendarDay } from '../types'
import CalendarDayDetail from './CalendarDayDetail.vue'

const props = defineProps<{ date: string; day: CalendarDay | null; today: string }>()
const emit = defineEmits<{ close: [] }>()

useScrollLock()
const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => emit('close') })
</script>

<template>
  <Teleport to="body">
    <!-- 和其他彈窗一樣置中、內容從上往下排；打開時面板從上方滑下並淡入（2026-11-20 使用者要求，原本是貼底的抽屜） -->
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" @click.self="emit('close')">
      <Transition
        appear
        enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 -translate-y-4"
      >
        <div
          ref="dialogEl"
          class="flex max-h-[85vh] w-full max-w-xl flex-col border-2 border-frame bg-surface text-ink shadow-[6px_6px_0_var(--c-shade)]"
          role="dialog"
          aria-modal="true"
          :aria-label="dayTitle(props.date, props.today)"
        >
          <div class="flex justify-end border-b-2 border-frame px-4 py-2">
            <button
              type="button"
              class="h-8 cursor-pointer border-2 border-tint/15 px-3 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
              @click="emit('close')"
            >
              關閉
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <CalendarDayDetail :date="date" :day="day" :today="today" />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
