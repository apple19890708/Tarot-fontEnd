<script setup lang="ts">
import type { MarketNewsItem } from '../../types'

// 重大訊息列表：每則一行（日期、公司、主旨），點開看說明全文。全文是公司原文，只當純文字顯示
defineProps<{
  news: MarketNewsItem[]
  // 卡片裡只看一家公司，不必重複顯示公司名稱
  showCompany?: boolean
}>()

const shortDate = (date: string) => date.slice(5).replace('-', '/')
</script>

<template>
  <ul class="space-y-0.5 text-[11px]">
    <li v-for="item in news" :key="item.id">
      <details class="group">
        <summary class="flex cursor-pointer list-none items-start gap-2 py-1 hover:bg-white/5 [&::-webkit-details-marker]:hidden">
          <span class="mt-px w-3 shrink-0 text-stone-200 transition group-open:rotate-90">›</span>
          <span class="w-11 shrink-0 tabular-nums text-stone-400">{{ shortDate(item.date) }}</span>
          <span class="min-w-0 flex-1 leading-5 text-stone-200">
            <span v-if="showCompany" class="mr-1.5 text-amber-100">{{ item.name }}</span>{{ item.title }}
          </span>
        </summary>
        <div class="mb-1 ml-5 space-y-1 border-l border-white/10 py-1 pl-3 leading-5">
          <p class="text-stone-500">{{ item.date }} {{ item.time }}<template v-if="item.clause">・{{ item.clause }}</template></p>
          <p class="whitespace-pre-line break-words text-stone-300">{{ item.detail || '（沒有說明）' }}</p>
        </div>
      </details>
    </li>
  </ul>
</template>
