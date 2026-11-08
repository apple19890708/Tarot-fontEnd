<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { fetchFinanceNews } from '../../lib/api'
import { NEWS_TONES } from '../../lib/newsTone'
import SkeletonBlock from '../SkeletonBlock.vue'
import FinanceNewsDialog from './FinanceNewsDialog.vue'
import type { FinanceNewsItem, FinanceNewsTheme } from '../../types'

// 股市總覽的「今日財經新聞」：6 張卡片（約 350×350）。和我追蹤的股票有關的排前面，再來是最新的；同一件事的報導只留一則。
// 點卡片開「新聞重點」彈窗（和財經新聞分頁同一個）；其餘的到財經新聞分頁看（連結在區塊標題旁）
const news = ref<FinanceNewsItem[]>([])
const themes = ref<FinanceNewsTheme[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')

async function load() {
  status.value = 'loading'
  try {
    const view = await fetchFinanceNews()
    news.value = view.news
    themes.value = view.themes
    status.value = 'ready'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '財經新聞暫時讀不到。'
    status.value = 'error'
  }
}
onMounted(load)

const LIMIT = 6
const shown = computed(() => {
  const seen = new Set<string>()
  const unique = news.value.filter((item) => {
    const key = item.clusterId ?? item.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const watched = unique.filter((item) => item.watched?.length)
  const others = unique.filter((item) => !item.watched?.length)
  return [...watched, ...others].slice(0, LIMIT)
})
const timeText = (iso: string) =>
  new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

const opened = ref<FinanceNewsItem | null>(null)
// 彈窗讀完全文後更新「與我追蹤相關」（和財經新聞分頁一樣）
function syncWatched(labels: string[]) {
  const id = opened.value?.id
  news.value = news.value.map((item) => (item.id === id ? { ...item, watched: labels } : item))
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="status === 'loading'" class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
      <SkeletonBlock v-for="n in LIMIT" :key="n" class="h-64 w-full rounded-none" />
    </div>
    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-body text-danger">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-2 py-0.5 text-button" @click="load">重試</button>
    </div>
    <template v-else>
      <ul v-if="shown.length" class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        <!-- 整張卡片可以點：開新聞重點彈窗 -->
        <li v-for="item in shown" :key="item.id" class="min-w-0">
          <button
            type="button"
            class="flex h-full min-h-64 w-full cursor-pointer flex-col gap-2 border-2 border-tint/10 bg-tint/5 p-3 text-left transition hover:border-accent-hue/40 hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
            :aria-label="`${item.title}：看新聞重點`"
            @click="opened = item"
          >
            <p class="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
              <span>{{ item.sourceLabel }} · {{ timeText(item.publishedAt) }}</span>
              <span v-if="item.tone && item.tone !== 'neutral'" class="border px-1" :class="NEWS_TONES[item.tone].class">{{ NEWS_TONES[item.tone].label }}</span>
            </p>
            <p class="line-clamp-3 text-body font-semibold text-ink">{{ item.title }}</p>
            <p v-if="item.summary" class="line-clamp-4 text-caption text-ink-soft">{{ item.summary }}</p>
            <p v-if="item.watched?.length" class="self-start border border-up-hue/40 bg-up-hue/10 px-1.5 text-caption text-up-ink">
              與我追蹤相關：{{ item.watched.slice(0, 2).join('、') }}
            </p>
            <span class="mt-auto self-start border-2 border-accent-hue/40 bg-accent-hue/10 px-2.5 py-0.5 text-button text-accent font-pixel">看重點 ›</span>
          </button>
        </li>
      </ul>
      <p v-else class="border-2 border-dashed border-tint/15 px-3 py-4 text-center text-body text-ink-muted">今天還沒有財經新聞。</p>
    </template>

    <FinanceNewsDialog v-if="opened" :item="opened" :themes="themes" @close="opened = null" @watched="syncWatched" />
  </div>
</template>
