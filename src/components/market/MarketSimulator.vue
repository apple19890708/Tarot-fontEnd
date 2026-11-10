<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref, watch } from 'vue'

import RefreshButton from '../RefreshButton.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import IncomeSimulator from './IncomeSimulator.vue'
import { fetchIncome } from '../../lib/api'
import { useCooldown } from '../../lib/useCooldown'
import { watchlistVersion } from '../../lib/watchlistSync'
import type { IncomeReport } from '../../types'

// 存股試算分頁（2026-11-10 使用者要求從「股利獲利與預測」獨立出來）：殖利率來源要用全部追蹤的資料
// （持股組合、每一檔的現價殖利率），所以自己抓一份 /income（不分清單）。
// 放在 KeepAlive 裡：切回來時重抓；開著時清單版本號一變（別的地方改了持股）也重抓
const report = ref<IncomeReport | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = ++requestId
  if (!report.value) status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchIncome(null)
    if (id !== requestId) return
    report.value = result
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '持股資料暫時讀不到。'
    if (!report.value) status.value = 'error'
  }
}

const cooldown = useCooldown(30, 'market-simulator-refresh')
const refreshing = ref(false)
const refresh = () =>
  cooldown.run(async () => {
    refreshing.value = true
    try {
      await load()
    } finally {
      refreshing.value = false
    }
  })

onMounted(load)
let first = true
let active = true
onActivated(() => {
  active = true
  if (first) {
    first = false
    return
  }
  void load()
})
onDeactivated(() => {
  active = false
})
watch(watchlistVersion, () => {
  if (active) void load()
})
</script>

<template>
  <section class="space-y-5 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Dividend Planner</p>
        <h2 class="mt-1 text-title font-semibold text-ink">存股試算</h2>
        <p class="mt-1 text-body text-ink-muted">想每月領多少要準備多少本金，或每月存多少、幾年後能領多少。殖利率用你的持股組合或清單裡的股票。</p>
      </div>
      <RefreshButton label="更新" :loading="status === 'loading' || refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <!-- 骨架：股票選單、兩段試算、曲線圖 -->
    <div v-if="status === 'loading' && !report" class="space-y-4">
      <SkeletonBlock class="h-9 w-full max-w-md" />
      <div class="space-y-2">
        <SkeletonBlock class="h-5 w-40" />
        <SkeletonBlock class="h-9 w-48" />
      </div>
      <div class="space-y-2">
        <SkeletonBlock class="h-5 w-56" />
        <div class="grid gap-2 sm:grid-cols-2">
          <SkeletonBlock v-for="n in 4" :key="n" class="h-9 w-full" />
        </div>
        <SkeletonBlock class="h-56 w-full" />
      </div>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center justify-between gap-2 border-2 border-danger-hue/30 bg-danger-hue/[0.06] px-3 py-3">
      <p class="text-body text-danger">{{ error }}</p>
      <RefreshButton label="重試" loading-label="重試中…" tone="danger" :loading="refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <IncomeSimulator v-else-if="report" :report="report" />
  </section>
</template>
