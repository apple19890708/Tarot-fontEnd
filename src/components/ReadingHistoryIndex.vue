<script setup lang="ts">
import { computed, ref } from 'vue'

import type { ReadingSummary } from '../types'

const props = defineProps<{
  // 全部的摘要（後端已依時間新到舊排好）
  readings: ReadingSummary[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

type NarrationFilter = 'all' | 'ai'

const keyword = ref('')
const narrationFilter = ref<NarrationFilter>('all')

const filterOptions: { value: NarrationFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'ai', label: '有 AI 解讀' },
]

// 只比對使用者自己的資料：問題文字與牌名快照
const filtered = computed(() => {
  const term = keyword.value.trim().toLowerCase()
  return props.readings.filter((item) => {
    if (narrationFilter.value === 'ai' && !item.hasNarration) {
      return false
    }
    if (!term) {
      return true
    }
    return (
      item.question.toLowerCase().includes(term) ||
      item.cards.some((card) => card.nameZh.toLowerCase().includes(term))
    )
  })
})

const hasCondition = computed(() => keyword.value.trim() !== '' || narrationFilter.value !== 'all')

// 依年月分組；輸入已排序，所以相鄰的同月份就是同一組
const groups = computed(() => {
  const result: { key: string; label: string; items: ReadingSummary[] }[] = []
  for (const item of filtered.value) {
    const date = new Date(item.createdAt)
    const valid = !Number.isNaN(date.getTime())
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown'
    const last = result[result.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      result.push({
        key,
        label: valid ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : '日期不明',
        items: [item],
      })
    }
  }
  return result
})

function clearConditions() {
  keyword.value = ''
  narrationFilter.value = 'all'
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <div class="space-y-3">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜尋問題或牌名"
        class="w-full rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none"
      />
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          type="button"
          class="cursor-pointer rounded-full border px-3 py-1 text-xs transition"
          :class="
            narrationFilter === option.value
              ? 'border-amber-200/50 bg-amber-200/15 text-amber-50'
              : 'border-white/10 text-stone-300 hover:bg-white/10'
          "
          @click="narrationFilter = option.value"
        >
          {{ option.label }}
        </button>
        <span class="ml-auto text-xs text-stone-400">
          <template v-if="hasCondition">符合 {{ filtered.length }} 筆／</template>共 {{ readings.length }} 筆
        </span>
      </div>
    </div>

    <div
      v-if="filtered.length === 0"
      class="rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 px-4 py-6 text-center text-sm text-stone-400"
    >
      <p>沒有符合條件的紀錄</p>
      <button
        type="button"
        class="mt-3 cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
        @click="clearConditions"
      >
        清除條件
      </button>
    </div>

    <nav v-else class="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1" aria-label="占卜紀錄">
      <section v-for="group in groups" :key="group.key">
        <p class="mb-2 px-1 text-xs tracking-[0.2em] text-stone-400">{{ group.label }}</p>
        <ul class="space-y-2">
          <li v-for="item in group.items" :key="item.id">
            <button
              type="button"
              class="w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition"
              :class="
                selectedId === item.id
                  ? 'border-amber-200/40 bg-amber-200/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              "
              :aria-current="selectedId === item.id ? 'true' : undefined"
              @click="emit('select', item.id)"
            >
              <span class="block text-xs text-stone-400">{{ formatShortDate(item.createdAt) }}</span>
              <span class="mt-1 line-clamp-2 block text-sm leading-6 text-amber-50">
                {{ item.question || '未填寫問題' }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </nav>
  </div>
</template>
