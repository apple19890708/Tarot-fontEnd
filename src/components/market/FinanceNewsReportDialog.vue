<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { useScrollLock } from '../../lib/useScrollLock'
import StockAiText from './StockAiText.vue'
import type { FinanceNewsAnalysisRef } from '../../types'

// 財經新聞 AI 影響分析的報告彈窗：產生中即時顯示，產生完或從「過去的分析」打開時顯示全文與引用的新聞。
// 狀態（串流、停止、錯誤）由父元件管理，這裡只負責顯示；關閉視窗不會停止分析
defineProps<{
  scopeText: string
  createdAt: string | null
  newsCount: number | null
  text: string
  news: FinanceNewsAnalysisRef[]
  status: 'idle' | 'streaming' | 'done' | 'stopped' | 'error'
  error: string
  saveFailed: boolean
}>()
const emit = defineEmits<{ close: []; stop: [] }>()

useScrollLock()

function dateTime(iso: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-black/70 md:p-6" @click.self="emit('close')">
      <div
        class="flex h-full w-full flex-col bg-[#0f1526] text-stone-100 md:h-auto md:max-h-[90vh] md:max-w-3xl md:border-2 md:border-[#3b2618] md:shadow-[6px_6px_0_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        aria-label="AI 影響分析報告"
      >
        <div class="flex items-start justify-between gap-3 border-b-2 border-[#3b2618] px-4 py-3">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-[0.2em] text-stone-400">Impact Report</p>
            <p class="font-pixel text-[12px] text-amber-100">AI 影響分析</p>
            <p class="mt-1 text-[11px] text-stone-400">
              範圍：{{ scopeText }}
              <template v-if="newsCount !== null"> · {{ newsCount }} 則新聞</template>
              <template v-if="createdAt && status !== 'streaming'"> · {{ dateTime(createdAt) }} 產生</template>
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              v-if="status === 'streaming'"
              type="button"
              class="cursor-pointer border-2 border-white/15 px-3 py-1.5 font-pixel text-[14px] text-stone-200 transition hover:bg-white/10"
              @click="emit('stop')"
            >
              停止
            </button>
            <button
              type="button"
              class="-mr-1 cursor-pointer border-2 border-white/10 px-3 py-1.5 font-pixel text-[14px] text-stone-200 transition hover:bg-white/10 active:translate-x-[2px] active:translate-y-[2px]"
              @click="emit('close')"
            >
              關閉
            </button>
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
          <p v-if="status === 'streaming' && !text" class="text-sm text-stone-400">AI 正在讀新聞，通常要 30 秒到 1 分鐘…</p>
          <p v-if="status === 'streaming'" class="mb-3 text-[11px] text-stone-500">關閉視窗不會停止分析，完成後可以從分頁上再打開。</p>

          <StockAiText v-if="text" :text="text" />

          <p v-if="status === 'stopped'" class="mt-4 text-xs text-amber-100/80">已停止，這份分析沒有完成，不會存進紀錄，但會算進今天的次數。</p>
          <p v-if="status === 'error' && error" class="mt-4 border-2 border-rose-200/20 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{{ error }}</p>
          <p v-if="status === 'done' && saveFailed" class="mt-4 text-xs text-rose-200">這份分析沒有存進紀錄，重新整理後就看不到了。</p>

          <!-- AI 引用的 [n] 對應的新聞 -->
          <details v-if="news.length && status !== 'streaming'" class="mt-6 border-t border-white/10 pt-4 text-xs">
            <summary class="cursor-pointer text-stone-300 hover:text-stone-100">引用的新聞（{{ news.length }}）</summary>
            <ol class="mt-2 space-y-1.5 pl-1">
              <li v-for="(cited, index) in news" :key="index" class="flex gap-2 leading-5">
                <span class="shrink-0 tabular-nums text-stone-500">[{{ index + 1 }}]</span>
                <span class="min-w-0">
                  <a :href="cited.url" target="_blank" rel="noopener noreferrer" class="text-stone-200 underline-offset-2 hover:text-amber-100 hover:underline">{{ cited.title }}</a>
                  <span class="ml-1 text-stone-500">{{ cited.sourceLabel }}<template v-if="cited.publishedAt"> · {{ dateTime(cited.publishedAt) }}</template></span>
                </span>
              </li>
            </ol>
          </details>

          <p class="mt-4 text-[11px] text-stone-500">AI 只根據新聞標題與摘要撰寫，族群與個股是依產業關聯推估，僅供參考，不是投資建議。</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
