<script setup lang="ts">
// 月曆點某一天的每日一牌：開小彈窗看那張牌的完整內容，和「今天的牌」一樣（DailyCardFace，2026-11-20 使用者要求）。
// 手機時會疊在當天彈窗上面：Esc 只關這一層（ui-check 第 3 類：巢狀時 Esc 只關最上面那層），誰是最上層由 useDialogFocus 判斷
import { ref } from 'vue'

import { dayTitle } from '../lib/calendarDays'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useScrollLock } from '../lib/useScrollLock'
import type { DailyCard } from '../types'
import DailyCardFace from './DailyCardFace.vue'

const props = defineProps<{ dailyCard: DailyCard; today: string }>()
const emit = defineEmits<{ close: [] }>()

useScrollLock()
const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => emit('close') })
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[55] flex items-center justify-center bg-overlay p-4" @click.self="emit('close')">
      <Transition
        appear
        enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 -translate-y-4"
      >
        <div
          ref="dialogEl"
          class="flex max-h-[90vh] w-full max-w-md flex-col border-2 border-frame bg-surface text-ink shadow-[6px_6px_0_var(--c-shade)]"
          role="dialog"
          aria-modal="true"
          :aria-label="`${dayTitle(props.dailyCard.date, props.today)}的每日一牌`"
        >
          <div class="flex items-center justify-between gap-2 border-b-2 border-frame px-4 py-3">
            <p class="text-body font-semibold text-ink">{{ dayTitle(props.dailyCard.date, props.today) }}的牌</p>
            <button
              type="button"
              class="h-8 cursor-pointer border-2 border-tint/15 px-3 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
              @click="emit('close')"
            >
              關閉
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-5">
            <DailyCardFace :daily-card="dailyCard" />
            <p v-if="!dailyCard.message && !dailyCard.advice" class="mt-3 text-caption text-ink-muted">這張牌的牌義暫時讀不到。</p>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
