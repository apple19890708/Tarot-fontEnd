<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { confirmDialog } from '../../lib/confirm'

import { clearMarketTrack, fetchMarketTrack } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import SkeletonBlock from '../SkeletonBlock.vue'
import type { MarketCallRecord, MarketTrackSummary } from '../../types'

// 參考命中：每次股市諮詢的操作建議和之後實際走勢的對照（自動對答案）

const track = ref<MarketTrackSummary | null>(null)
const trackStatus = ref<'loading' | 'ready' | 'error'>('loading')
const trackError = ref('')
const horizonIndex = ref(1)
let trackRequestId = 0

async function loadTrack() {
  const requestId = (trackRequestId += 1)
  trackStatus.value = 'loading'
  trackError.value = ''
  try {
    const result = await fetchMarketTrack()
    if (requestId === trackRequestId) {
      track.value = result
      trackStatus.value = 'ready'
    }
  } catch (error) {
    if (requestId === trackRequestId) {
      trackError.value = error instanceof Error ? error.message : '追蹤資料暫時讀不到。'
      trackStatus.value = 'error'
    }
  }
}

const clearing = ref(false)
async function clearTrack() {
  const ok = await confirmDialog({
    title: '清除建議紀錄',
    message: '確定要清除全部的建議紀錄嗎？命中率會從頭開始統計。',
    confirmText: '清除',
    danger: true,
  })
  if (!ok) return
  clearing.value = true
  try {
    await clearMarketTrack()
    await loadTrack()
  } catch (error) {
    trackError.value = error instanceof Error ? error.message : '清除失敗'
  } finally {
    clearing.value = false
  }
}

const horizon = computed(() => track.value?.horizons[horizonIndex.value] ?? null)

const STANCE_LABELS: Record<MarketCallRecord['stance'], string> = { bullish: '偏多', bearish: '偏空', neutral: '觀望' }
const STANCE_CLASS: Record<MarketCallRecord['stance'], string> = {
  bullish: 'text-rose-300',
  bearish: 'text-emerald-300',
  neutral: 'text-stone-300',
}
const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' } as const

function pct(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${formatNumber(value, 1)}%`
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-300'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

function outcomeText(call: MarketCallRecord) {
  const outcome = call.outcomes[horizonIndex.value]
  if (!outcome?.ready) return '未到期'
  return formatSigned(outcome.return, '%')
}

function hitMark(call: MarketCallRecord) {
  const outcome = call.outcomes[horizonIndex.value]
  if (!outcome?.ready || outcome.hit === null) return null
  return outcome.hit ? { text: '對', cls: 'text-amber-200' } : { text: '錯', cls: 'text-stone-500' }
}

const PATH_LABELS = { target: '先到目標', stop: '先到停損', open: '都還沒到' } as const

onMounted(() => {
  void loadTrack()
})
</script>

<template>
  <section class="space-y-4 border-2 border-white/10 bg-[#0f1526] p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Hit Rate</p>
        <h2 class="mt-1 text-lg font-semibold text-stone-50">參考命中</h2>
        <p class="mt-1 max-w-2xl text-xs leading-5 text-stone-400">
          每次在股市諮詢查行情，當下的操作建議都會記下來（同一天同一檔只留最後一次），之後自動和實際走勢對答案。
          命中率是檢驗這套規則準不準的唯一方法；樣本少的時候先別太相信。
        </p>
      </div>
      <!-- 期間按鈕要等資料回來才知道有哪些，載入中先放同大小的骨架，版面才不會跳 -->
      <div v-if="!track && trackStatus === 'loading'" class="flex gap-2">
        <SkeletonBlock v-for="n in 3" :key="n" class="h-[1.875rem] w-[4.5rem] rounded-none" />
      </div>
      <div v-else class="flex gap-2">
        <button
          v-for="(h, index) in track?.horizons ?? []"
          :key="h.days"
          type="button"
          class="cursor-pointer border-2 px-3 py-1 text-[14px] transition font-pixel"
          :class="index === horizonIndex ? 'border-amber-200/40 bg-amber-200/15 text-amber-50' : 'border-white/15 text-stone-300 hover:bg-white/10'"
          @click="horizonIndex = index"
        >
          {{ h.days }} 日後
        </button>
      </div>
    </div>

    <!-- 骨架對應載入後的版面：說明列、四張統計卡、兩張分組卡、表格 -->
    <div v-if="trackStatus === 'loading'" class="space-y-4">
      <SkeletonBlock class="h-3.5 w-56 rounded-none" />
      <div class="grid gap-3 sm:grid-cols-4">
        <SkeletonBlock v-for="n in 4" :key="n" class="h-[5.75rem] w-full rounded-none" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock v-for="n in 2" :key="n" class="h-36 w-full rounded-none" />
      </div>
      <div class="space-y-2">
        <SkeletonBlock class="h-5 w-full rounded-none opacity-60" />
        <SkeletonBlock v-for="n in 5" :key="n" class="h-5 w-full rounded-none" />
      </div>
    </div>

    <div v-else-if="trackStatus === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
      <span>{{ trackError }}</span>
      <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-[14px] font-pixel" @click="loadTrack">重試</button>
    </div>

    <template v-else-if="track">
      <p v-if="track.total === 0" class="text-sm text-stone-300/80">
        還沒有任何建議紀錄。到首頁選「股市諮詢」查一次行情，就會開始累積。
      </p>

      <template v-else>
        <p class="text-xs text-stone-400">
          共 {{ track.total }} 筆建議，{{ track.pending }} 筆還沒過 5 個交易日。
        </p>

        <div v-if="horizon" class="grid gap-3 sm:grid-cols-4">
          <div class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
            <p class="text-xs text-amber-100/80">整體命中率</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-stone-50">{{ pct(horizon.hitRate) }}</p>
            <p class="text-[11px] text-stone-400">{{ horizon.evaluated }} 筆偏多／偏空已到期</p>
          </div>
          <div class="border-2 border-rose-300/20 bg-rose-300/5 p-3">
            <p class="text-xs text-rose-200/80">偏多之後上漲</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-stone-50">{{ pct(horizon.bullish.hitRate) }}</p>
            <p class="text-[11px] text-stone-400">{{ horizon.bullish.count }} 筆，平均 {{ formatSigned(horizon.bullish.avgReturn, '%') }}</p>
          </div>
          <div class="border-2 border-emerald-300/20 bg-emerald-300/5 p-3">
            <p class="text-xs text-emerald-200/80">偏空之後下跌</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-stone-50">{{ pct(horizon.bearish.hitRate) }}</p>
            <p class="text-[11px] text-stone-400">{{ horizon.bearish.count }} 筆，平均 {{ formatSigned(horizon.bearish.avgReturn, '%') }}</p>
          </div>
          <div class="border-2 border-white/10 bg-white/5 p-3">
            <p class="text-xs text-stone-400">觀望之後的波動</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-stone-50">
              {{ horizon.neutral.avgMove === null ? '—' : `±${formatNumber(horizon.neutral.avgMove)}%` }}
            </p>
            <p class="text-[11px] text-stone-400">{{ horizon.neutral.count }} 筆，越小代表觀望越合理</p>
          </div>
        </div>

        <div v-if="horizon" class="grid gap-3 sm:grid-cols-2">
          <div class="border-2 border-white/10 bg-white/5 p-3">
            <p class="text-xs text-stone-400">依信心分組的命中率</p>
            <ul class="mt-2 space-y-1.5 text-sm">
              <li v-for="level in (['high', 'medium', 'low'] as const)" :key="level" class="flex items-center gap-3">
                <span class="w-14 shrink-0 whitespace-nowrap text-stone-300">信心{{ CONFIDENCE_LABELS[level] }}</span>
                <div class="h-2 flex-1 bg-white/10">
                  <div class="h-2 bg-amber-200/70" :style="{ width: `${horizon.byConfidence[level].hitRate ?? 0}%` }" />
                </div>
                <span class="w-24 text-right tabular-nums text-stone-200">
                  {{ pct(horizon.byConfidence[level].hitRate) }}（{{ horizon.byConfidence[level].count }}）
                </span>
              </li>
            </ul>
            <p class="mt-2 text-[11px] leading-5 text-stone-500">信心高的命中率應該要比信心低的高；如果沒有，代表信心的算法需要調整。</p>
          </div>
          <div class="border-2 border-white/10 bg-white/5 p-3">
            <p class="text-xs text-stone-400">偏多建議 20 日內先碰到目標價的比例</p>
            <p class="mt-1 text-2xl font-semibold tabular-nums text-stone-50">{{ pct(track.targetFirstRate) }}</p>
            <p class="text-[11px] leading-5 text-stone-400">
              {{ track.targetPathCount }} 筆已經碰到目標或停損。高於 50% 代表停損與目標設得合理。
            </p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[40rem] text-xs">
            <thead>
              <tr class="border-b border-white/10 text-left text-stone-400">
                <th class="py-1.5 pr-3 font-normal">日期</th>
                <th class="py-1.5 pr-3 font-normal">標的</th>
                <th class="py-1.5 pr-3 font-normal">建議</th>
                <th class="py-1.5 pr-3 text-right font-normal">當時價格</th>
                <th class="py-1.5 pr-3 text-right font-normal">{{ horizon?.days }} 日後</th>
                <th class="py-1.5 pr-3 font-normal">結果</th>
                <th class="py-1.5 font-normal">停損／目標</th>
              </tr>
            </thead>
            <tbody class="tabular-nums">
              <tr v-for="call in track.calls" :key="call.id" class="border-b border-white/5 text-stone-200">
                <td class="py-1.5 pr-3 text-stone-400">{{ call.date }}</td>
                <td class="py-1.5 pr-3">{{ call.name }} <span class="text-stone-500">{{ call.code || call.symbol }}</span></td>
                <td class="py-1.5 pr-3">
                  <span :class="STANCE_CLASS[call.stance]">{{ STANCE_LABELS[call.stance] }}</span>
                  <span class="ml-1 text-stone-500">信心{{ CONFIDENCE_LABELS[call.confidence] }}</span>
                </td>
                <td class="py-1.5 pr-3 text-right">{{ formatNumber(call.price) }}</td>
                <td class="py-1.5 pr-3 text-right" :class="trendClass(call.outcomes[horizonIndex]?.return)">{{ outcomeText(call) }}</td>
                <td class="py-1.5 pr-3">
                  <span v-if="hitMark(call)" :class="hitMark(call)!.cls">{{ hitMark(call)!.text }}</span>
                  <span v-else class="text-stone-500">—</span>
                </td>
                <td class="py-1.5 text-stone-400">{{ call.path ? PATH_LABELS[call.path] : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          class="cursor-pointer border-2 border-white/15 px-3 py-1 text-[14px] text-stone-300 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
          :disabled="clearing"
          @click="clearTrack"
        >
          {{ clearing ? '清除中…' : '清除全部紀錄' }}
        </button>
      </template>
    </template>
  </section>
</template>
