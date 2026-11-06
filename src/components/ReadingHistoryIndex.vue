<script setup lang="ts">
import { computed, ref } from 'vue'

import RecordIndex, { type RecordIndexItem } from './RecordIndex.vue'
import type { ReadingSummary } from '../types'

// 塔羅紀錄的清單：篩選條件是塔羅自己的（問題、牌名、有沒有 AI 解讀），長相用共用的 RecordIndex
const props = defineProps<{
  // 全部的摘要（後端已依時間新到舊排好）
  readings: ReadingSummary[]
  selectedId: string
}>()
const emit = defineEmits<{ select: [id: string] }>()

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'ai', label: '有 AI 解讀' },
] as const

const keyword = ref('')
const filter = ref<string>('all')

// 只比對使用者自己的資料：問題文字與牌名快照
const items = computed<RecordIndexItem[]>(() => {
  const term = keyword.value.trim().toLowerCase()
  return props.readings
    .filter((item) => filter.value !== 'ai' || item.hasNarration)
    .filter(
      (item) =>
        !term || item.question.toLowerCase().includes(term) || item.cards.some((card) => card.nameZh.toLowerCase().includes(term)),
    )
    .map((item) => ({
      id: item.id,
      title: item.question || '未填寫問題',
      createdAt: item.createdAt,
      meta: [{ text: `${item.cardCount} 張` }],
      badge: item.hasNarration ? 'AI' : undefined,
    }))
})
</script>

<template>
  <RecordIndex
    v-model:keyword="keyword"
    v-model:filter="filter"
    :items="items"
    :total="readings.length"
    :selected-id="selectedId"
    placeholder="搜尋問題或牌名"
    :filter-options="FILTERS"
    list-label="占卜紀錄"
    @select="emit('select', $event)"
  />
</template>
