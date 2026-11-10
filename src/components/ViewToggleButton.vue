<script setup lang="ts">
// 卡片／表格切換鈕（股市總覽、自訂股票追蹤、股利獲利與預測共用）。
// 圖示是「按了會變成的樣子」：表格中顯示四格（卡片），卡片中顯示橫條（表格）
defineProps<{ view: 'card' | 'table' }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex h-7 w-8 shrink-0 cursor-pointer items-center justify-center border border-tint/15 text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
    :aria-label="view === 'table' ? '改成卡片檢視' : '改成表格檢視'"
    :title="view === 'table' ? '改成卡片檢視' : '改成表格檢視'"
    @click="$emit('toggle')"
  >
    <svg v-if="view === 'table'" class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" />
    </svg>
    <svg v-else class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="3" width="12" height="2" /><rect x="2" y="7" width="12" height="2" /><rect x="2" y="11" width="12" height="2" />
    </svg>
  </button>
</template>
