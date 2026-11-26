<script setup lang="ts" generic="C extends DrawableCard">
// 「輸入已抽到的牌」的選牌視窗（2026-11-26 前端優化 9，從 StepDraw 拆出來）：
// 點某個位置才打開，選完就關掉。手機滿版；桌機是置中的視窗，點背景或按 Esc 關閉。
// 原本桌機在右側常駐一份 78 張的清單，佔掉半個版面，改成和手機一樣的流程。
// 焦點交給 useDialogFocus：打開時移進視窗、Tab 只在視窗裡、Esc 關閉，關掉後回到剛才點的那一格
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useDialogFocus } from '../lib/useDialogFocus'
import type { CardPickerGroup, DrawableCard } from '../types'

const props = defineProps<{
  open: boolean
  // 這個位置的名稱（含編號）與代表什麼
  title: string
  prompt: string
  groups: CardPickerGroup<C>[]
  search: string
  error: string
  placeholder?: string
  // 目前放在這個位置的牌（標成已選）
  currentId?: string
  labelOf: (card: C) => string
  // 已經放在別的位置上的牌不能再選；格子模式另外標出在第幾格
  isUsedElsewhere: (card: C) => boolean
  usedNote: (card: C) => string | null
}>()

const emit = defineEmits<{
  close: []
  choose: [card: C, event: MouseEvent]
  'update:search': [value: string]
}>()

const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { active: computed(() => props.open), onEscape: () => emit('close') })

// 視窗打開時擋住背景捲動，不然手指滑清單會連背後的頁面一起動
watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
)

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- teleport 到 body，不然外層卡片的 會把 fixed 定位困在卡片裡 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 [transition-timing-function:steps(4)] motion-reduce:transition-none"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 [transition-timing-function:steps(4)] motion-reduce:transition-none"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-overlay md:p-6"
        @click.self="emit('close')"
      >
      <div
        ref="dialogEl"
        class="flex h-full w-full flex-col bg-surface text-ink md:h-auto md:max-h-[85vh] md:max-w-3xl md:border-2 md:border-tint/15"
        role="dialog"
        aria-modal="true"
        aria-label="選一張牌"
      >
        <div class="flex items-start justify-between gap-3 border-b border-tint/10 px-4 py-3">
          <div class="min-w-0">
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
            <p class="text-[10px] uppercase tracking-[0.2em] text-ink-muted">選一張牌</p>
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
            <p class="truncate text-sm font-medium text-ink">{{ title }}</p>
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
            <p v-if="prompt" class="truncate text-[11px] text-ink-muted">
              {{ prompt }}
            </p>
          </div>
          <button
            type="button"
            class="-mr-1 shrink-0 cursor-pointer border-2 border-tint/10 px-3 py-1.5 text-[14px] text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
            @click="emit('close')"
          >
            關閉
          </button>
        </div>

        <div class="space-y-2 px-4 pt-3">
          <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
          <input class="w-full border-2 border-tint/10 bg-tint/5 px-4 py-2 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-accent-hue/40"
            :value="search"
            type="search"
            :placeholder="placeholder ?? '搜尋牌名…'"
            @input="emit('update:search', ($event.target as HTMLInputElement).value)"
          />
          <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
          <p v-if="error" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-sm text-danger">
            {{ error }}
          </p>
        </div>

        <!-- 只有這一段捲動，標題與搜尋框固定在上面 -->
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          <div v-for="group in groups" :key="group.key">
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
            <p class="sticky top-0 z-10 -mx-4 bg-surface px-4 pb-1.5 pt-3 text-xs uppercase tracking-[0.2em] text-ink-muted"
            >
              {{ group.label }}
            </p>
            <!-- 每組可以再分幾排（塔羅：數字牌一排五張、宮廷牌一排四張；手機一律一排兩張），排法見 lib/cardGroups.ts -->
            <div
              v-for="row in group.rows"
              :key="row.key"
              class="grid gap-1.5 pt-1.5"
              :class="row.cols"
            >
              <button
                v-for="card in row.cards"
                :key="card.id"
                class="cursor-pointer truncate border-2 px-2 py-2 text-center text-[14px] transition disabled:cursor-not-allowed disabled:opacity-40 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
                :class="currentId === card.id
                  ? 'border-accent-hue/40 bg-accent-hue/20 text-accent'
                  : 'border-tint/10 bg-tint/5 text-ink-soft hover:bg-tint/10'"
                type="button"
                :title="labelOf(card)"
                :disabled="isUsedElsewhere(card)"
                @click="emit('choose', card, $event)"
              >
                {{ labelOf(card) }}
                <span v-if="usedNote(card)" class="block text-caption">{{ usedNote(card) }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>
