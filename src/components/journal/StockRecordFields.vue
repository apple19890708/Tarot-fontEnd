<script setup lang="ts">
// 股票日記每篇的「記錄股票」（v26 計畫 2-2、D8）：先選動作，再填這個動作用得到的欄位（stockFieldsOf），都可選填；
// 寫的時候的股價是打開這篇時自動帶入的最新股價，只顯示不能改。只是紀錄，不會改股市追蹤的持股
import { computed } from 'vue'

import { STOCK_ACTION_OPTIONS, STOCK_FIELD_LABELS, stockFieldsOf, type StockDraft } from '../../lib/stockJournal'

defineProps<{ market: 'tw' | 'us' }>()
const draft = defineModel<StockDraft>({ required: true })

const INPUT = 'h-7 w-[7em] border-2 border-tint/15 bg-surface px-1.5 text-caption tabular-nums text-ink placeholder:text-ink-muted'
const fields = computed(() => stockFieldsOf(draft.value.action))

// 再點一次同一個動作＝取消選擇
function pickAction(value: StockDraft['action']) {
  draft.value.action = draft.value.action === value ? null : value
}
</script>

<template>
  <fieldset class="space-y-2 border border-line bg-raised px-3 py-2.5">
    <legend class="px-1 text-caption text-ink-soft">記錄股票（都可以不填，不會改到股市追蹤的持股）</legend>

    <div class="flex flex-wrap items-center gap-1.5">
      <span id="stock-action-label" class="text-caption text-ink-soft">動作</span>
      <div class="flex flex-wrap gap-1" role="radiogroup" aria-labelledby="stock-action-label">
        <button
          v-for="option in STOCK_ACTION_OPTIONS"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="draft.action === option.value"
          class="h-7 cursor-pointer border-2 px-2 text-button transition active:translate-x-[1px] active:translate-y-[1px]"
          :class="draft.action === option.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
          @click="pickAction(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <p v-if="!draft.action" class="text-caption text-ink-muted">選了動作才會出現價格、數量這些欄位。</p>
    <div v-else class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <!-- 標籤固定 3em：手機上一欄一欄疊起來時輸入框對齊 -->
      <!-- 順序固定：價格、數量、目標價、停損價（照 stockFieldsOf） -->
      <template v-for="field in fields" :key="field">
        <label v-if="field !== 'quantity'" class="flex items-center gap-1.5 text-caption text-ink-soft">
          <span class="w-[3em] shrink-0">{{ STOCK_FIELD_LABELS[field] }}</span>
          <input v-model="draft[field]" type="text" inputmode="decimal" autocomplete="off" :class="INPUT" />
        </label>
        <div v-else class="flex items-center gap-1.5 text-caption text-ink-soft">
        <label for="stock-quantity" class="w-[3em] shrink-0">數量</label>
        <input id="stock-quantity" v-model="draft.quantity" type="text" inputmode="decimal" autocomplete="off" :class="INPUT" />
        <!-- 台股可以填張或股；美股一律是股 -->
        <div v-if="market === 'tw'" class="flex" role="radiogroup" aria-label="數量單位">
          <button
            v-for="(option, index) in [{ value: 'lot', label: '張' }, { value: 'share', label: '股' }] as const"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="draft.unit === option.value"
            class="h-7 cursor-pointer border-2 px-2 text-button transition active:translate-y-[1px]"
            :class="[index ? '-ml-[2px]' : '', draft.unit === option.value ? 'relative z-[1] border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10']"
            @click="draft.unit = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <span v-else>股</span>
        </div>
      </template>
    </div>

    <p class="text-caption text-ink-soft">
      寫的時候的股價：
      <span v-if="draft.quoteAtWrite !== null" class="tabular-nums text-ink">{{ draft.quoteAtWrite.toLocaleString('zh-TW') }}</span>
      <span v-else>查不到（之後列表就不會顯示到現在的漲跌）</span>
    </p>
  </fieldset>
</template>
