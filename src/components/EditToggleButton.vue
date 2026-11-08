<script setup lang="ts">
// 編輯開關：平常是一支筆（進入編輯），編輯中換成綠色勾勾（完成／儲存）。預設只有圖示，說明放在 aria-label 與 title。
// 用在自訂追蹤的「管理清單」、股市總覽的「客製化區塊」與各區塊的卡片設定。
// text：圖示旁邊要顯示的字（股市總覽右上角的「客製化區塊」）；沒有就只有圖示
withDefaults(
  defineProps<{
    active: boolean
    // 平常與編輯中的說明文字（讀螢幕與滑過提示用）
    label: string
    activeLabel?: string
    disabled?: boolean
    size?: 'sm' | 'md'
    text?: string
  }>(),
  { activeLabel: '完成', disabled: false, size: 'md' },
)
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex shrink-0 cursor-pointer items-center justify-center transition active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
    :class="[
      size === 'sm' ? 'h-7 border' : 'h-8 border-2',
      text ? 'gap-1.5 px-2.5 text-button' : size === 'sm' ? 'w-8' : 'w-9',
      active ? 'border-ok-hue/50 bg-ok-hue/15 text-ok' : 'border-tint/15 text-ink-muted hover:bg-tint/10 hover:text-ink',
    ]"
    :disabled="disabled"
    :aria-label="active ? activeLabel : label"
    :title="active ? activeLabel : label"
    @click="$emit('click')"
  >
    <svg v-if="active" class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" stroke-linecap="square" />
    </svg>
    <svg v-else class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" stroke-linejoin="miter" />
      <path d="M9.5 4l2.5 2.5" />
    </svg>
    <span v-if="text" class="whitespace-nowrap">{{ text }}</span>
  </button>
</template>
