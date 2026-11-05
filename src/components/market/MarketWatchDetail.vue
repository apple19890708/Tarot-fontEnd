<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { fetchWatchDetail } from '../../lib/api'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketChips from './MarketChips.vue'
import MarketPriceChart from './MarketPriceChart.vue'
import type { MarketWatchDetail } from '../../types'

// 自訂追蹤展開卡片的「K 線與籌碼」：點開才載入，重用股市諮詢結果頁的走勢圖與籌碼元件
const props = defineProps<{ watchId: string; market: 'tw' | 'us' }>()

const detail = ref<MarketWatchDetail | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchWatchDetail(props.watchId)
    if (id !== requestId) return
    detail.value = result.detail
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '暫時讀不到這檔的走勢與籌碼。'
    status.value = 'error'
  }
}
onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 載入中：走勢圖（同高度）＋台股的籌碼摘要與圖 -->
    <div v-if="status === 'loading'" class="space-y-3">
      <SkeletonBlock class="h-64 w-full rounded-none sm:h-72" />
      <template v-if="market === 'tw'">
        <SkeletonBlock class="h-3.5 w-48 rounded-none" />
        <div class="space-y-1.5">
          <SkeletonBlock v-for="n in 3" :key="n" class="h-4 w-full max-w-md rounded-none" />
        </div>
        <SkeletonBlock class="h-48 w-full rounded-none" />
      </template>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 text-xs text-rose-200">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-[12px] font-pixel" @click="load">重試</button>
    </div>

    <template v-else-if="detail">
      <MarketPriceChart v-if="detail.chart" :chart="detail.chart" :analysis="detail.analysis" />
      <p v-else class="text-xs text-stone-400">歷史資料不足，畫不出走勢圖。</p>
      <MarketChips v-if="detail.chips || detail.valuation" :chips="detail.chips" :valuation="detail.valuation" />
      <p v-for="note in detail.notes" :key="note" class="text-xs text-stone-400">{{ note }}</p>
    </template>
  </div>
</template>
