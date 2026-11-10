<script setup lang="ts">
import { computed } from 'vue'

import SelectField from './SelectField.vue'
import { PAGE_SIZES } from '../lib/usePaged'

// 共用的列表分頁列（搭配 lib/usePaged.ts）：「第 1–10 筆，共 23 筆」、上一頁、頁碼、下一頁、每頁筆數（5／10／15／20／50）。
// 總筆數不超過最小的每頁筆數（5）時整列不顯示；只有一頁時只留每頁筆數
const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })
const props = defineProps<{ total: number }>()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value)))
const from = computed(() => (props.total ? (page.value - 1) * pageSize.value + 1 : 0))
const to = computed(() => Math.min(props.total, page.value * pageSize.value))
// 頁碼：頁數不多全列；多的時候列頭尾與目前附近，中間用「…」
const pages = computed<(number | '…')[]>(() => {
  const count = pageCount.value
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const near = [page.value - 1, page.value, page.value + 1].filter((p) => p > 1 && p < count)
  const list: (number | '…')[] = [1]
  if (near[0]! > 2) list.push('…')
  list.push(...near)
  if (near[near.length - 1]! < count - 1) list.push('…')
  list.push(count)
  return list
})
// SelectField 的選項值是字串：每頁筆數在這裡轉換
const sizeOptions = PAGE_SIZES.map((size) => ({ value: String(size), label: `每頁 ${size} 筆` }))
const sizeText = computed({
  get: () => String(pageSize.value),
  set: (value: string) => {
    pageSize.value = Number(value)
  },
})

const BUTTON =
  'flex h-7 min-w-7 cursor-pointer items-center justify-center border px-1.5 text-button tabular-nums transition active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40'
</script>

<template>
  <div v-if="total > PAGE_SIZES[0]" class="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
    <span class="tabular-nums">第 {{ from }}–{{ to }} 筆，共 {{ total }} 筆</span>
    <div class="flex flex-wrap items-center gap-1.5">
      <template v-if="pageCount > 1">
        <button type="button" :class="[BUTTON, 'border-tint/15 hover:bg-tint/10 hover:text-ink']" :disabled="page <= 1" aria-label="上一頁" @click="page -= 1">‹</button>
        <template v-for="(p, index) in pages" :key="`${p}-${index}`">
          <span v-if="p === '…'" class="px-0.5">…</span>
          <!-- 換頁：選中用金色（和分頁列一致） -->
          <button
            v-else
            type="button"
            :class="[BUTTON, p === page ? 'border-accent-hue bg-selected text-on-selected' : 'border-tint/15 hover:bg-tint/10 hover:text-ink']"
            :aria-current="p === page ? 'page' : undefined"
            @click="page = p"
          >
            {{ p }}
          </button>
        </template>
        <button type="button" :class="[BUTTON, 'border-tint/15 hover:bg-tint/10 hover:text-ink']" :disabled="page >= pageCount" aria-label="下一頁" @click="page += 1">›</button>
      </template>
      <SelectField v-model="sizeText" :options="sizeOptions" label="每頁筆數" variant="pixel" hide-label class="w-[8.5em]" />
    </div>
  </div>
</template>
