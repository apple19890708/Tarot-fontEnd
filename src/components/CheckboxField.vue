<script setup lang="ts">
// 開／關、勾選類的設定一律用這個 checkbox（2026-11-10 使用者回報：用按鈕做開關，選取和未選取看不出差別）。
// 勾起來時文字也跟著變亮；顏色用語意色，日夜模式都清楚。
// 用法：<CheckboxField v-model="flag">說明文字</CheckboxField>；要自己處理變更時用 :model-value＋@update:model-value
const model = defineModel<boolean>({ required: true })
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <label class="inline-flex cursor-pointer select-none items-center gap-2" :class="disabled ? 'cursor-not-allowed opacity-50' : ''">
    <input
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      class="h-4 w-4 shrink-0 cursor-pointer accent-[var(--c-accent-hue)] disabled:cursor-not-allowed"
    />
    <span :class="model ? 'text-ink' : 'text-ink-muted'"><slot /></span>
  </label>
</template>
