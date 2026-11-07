<script setup lang="ts">
import type { MarketNewsItem } from '../../types'

// 重大訊息列表：每則一行（日期、公司、主旨），點開先看後端挑出的重點，公司原文收在「看公告原文」。
// 原文只當純文字顯示
defineProps<{
  news: MarketNewsItem[]
  // 卡片裡只看一家公司，不必重複顯示公司名稱
  showCompany?: boolean
}>()

const shortDate = (date: string) => date.slice(5).replace('-', '/')
</script>

<template>
  <ul class="space-y-0.5 text-body">
    <li v-for="item in news" :key="item.id">
      <details class="group">
        <summary class="flex cursor-pointer list-none items-start gap-2 py-1 hover:bg-white/5 [&::-webkit-details-marker]:hidden">
          <span class="mt-px w-3 shrink-0 text-stone-200 transition group-open:rotate-90">›</span>
          <span class="w-[3.5em] shrink-0 whitespace-nowrap tabular-nums text-stone-300">{{ shortDate(item.date) }}</span>
          <span class="min-w-0 flex-1 text-stone-100">
            <span v-if="showCompany" class="mr-1.5 text-amber-100">{{ item.name }}</span>{{ item.title }}
          </span>
        </summary>
        <div class="mb-2 ml-5 space-y-2 border-l border-white/10 py-1 pl-3">
          <p class="text-caption tabular-nums text-stone-300">{{ item.date }} {{ item.time }} 發布</p>

          <!-- 重點：欄位名稱在上、內容在下 -->
          <dl v-if="item.points?.length" class="space-y-1.5">
            <div v-for="(point, index) in item.points" :key="index">
              <dt v-if="point.label" class="text-caption text-stone-300">{{ point.label }}</dt>
              <dd class="break-words text-stone-100">{{ point.value }}</dd>
            </div>
          </dl>

          <details v-if="item.points?.length" class="group/raw">
            <summary class="cursor-pointer text-caption text-sky-200 hover:text-sky-100">看公告原文</summary>
            <!-- 原文拆成欄位表：桌機左欄名稱、右欄內容；手機上下排。沒有內容的欄位合併成最後一行 -->
            <div v-if="item.fields?.length" class="mt-2 space-y-1 text-caption">
              <dl class="divide-y divide-white/5 border border-white/10">
                <div v-for="(field, index) in item.fields" :key="index" class="grid gap-x-3 gap-y-0.5 px-2 py-1.5 sm:grid-cols-[12em_1fr]">
                  <dt class="text-stone-300">{{ field.label || '說明' }}</dt>
                  <dd class="whitespace-pre-line break-words text-stone-100">{{ field.value }}</dd>
                </div>
              </dl>
              <p v-if="item.emptyFields?.length" class="text-stone-300">
                沒有內容的欄位（不適用、無或否）：{{ item.emptyFields.join('、') }}
              </p>
            </div>
            <p v-else class="mt-1 whitespace-pre-line break-words text-caption text-stone-300">{{ item.detail || '（沒有說明）' }}</p>
          </details>
          <p v-else class="whitespace-pre-line break-words text-stone-300">{{ item.detail || '（沒有說明）' }}</p>
        </div>
      </details>
    </li>
  </ul>
</template>
