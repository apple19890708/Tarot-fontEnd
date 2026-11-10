<script setup lang="ts">
import type { QuantityUnit } from '../../lib/quantityUnit'

// 持股數量輸入：台股旁邊多一顆「張／股」切換（零股直接填股數，存檔時由呼叫端換算成張）；美股固定是股。
// 切換單位只改單位、不換算已填的數字（多半是填完才發現單位選錯）
const quantity = defineModel<string>({ required: true })
const unit = defineModel<QuantityUnit>('unit', { required: true })
defineProps<{ market: 'tw' | 'us'; inputClass: string; placeholder?: string; label: string }>()
</script>

<template>
  <div class="flex min-w-0">
    <input
      v-model="quantity"
      inputmode="decimal"
      :class="inputClass"
      class="w-full flex-1"
      :placeholder="placeholder ?? `${market === 'tw' ? unit : '股'}數`"
      :aria-label="label"
    />
    <button
      v-if="market === 'tw'"
      type="button"
      class="shrink-0 cursor-pointer border-2 border-l-0 border-tint/10 bg-tint/10 px-2.5 text-button text-accent transition hover:bg-tint/15 font-pixel"
      :title="unit === '張' ? '改填股數（零股）' : '改填張數'"
      :aria-label="`單位：${unit}，點一下切換成${unit === '張' ? '股（零股）' : '張'}`"
      @click="unit = unit === '張' ? '股' : '張'"
    >
      {{ unit }}
    </button>
  </div>
</template>
