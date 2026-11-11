<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { confirmDialog } from '../../lib/confirm'

import { clearMarketTrack, fetchMarketTrack } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import DataTable from '../DataTable.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import type { MarketCallRecord, MarketTrackSummary } from '../../types'
import StockNameCell from '../StockNameCell.vue'

// 參考命中：每次股市諮詢的操作建議和之後實際走勢的對照（自動對答案）

const track = ref<MarketTrackSummary | null>(null)
const trackStatus = ref<'loading' | 'ready' | 'error'>('loading')
const trackError = ref('')
const horizonIndex = ref(1)
// 只看目前規則版本：規則改過之後，新舊紀錄混在一起看不出新規則準不準
const onlyCurrent = ref(false)
let trackRequestId = 0

async function loadTrack() {
  const requestId = (trackRequestId += 1)
  trackStatus.value = 'loading'
  trackError.value = ''
  try {
    const result = await fetchMarketTrack(onlyCurrent.value)
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
// 有舊規則的紀錄才需要切換
const hasOlder = computed(() => (track.value?.versionCounts?.older ?? 0) > 0)

function setOnlyCurrent(value: boolean) {
  if (onlyCurrent.value === value) return
  onlyCurrent.value = value
  void loadTrack()
}

const STANCE_LABELS: Record<MarketCallRecord['stance'], string> = { bullish: '偏多', bearish: '偏空', neutral: '觀望' }
const STANCE_CLASS: Record<MarketCallRecord['stance'], string> = {
  bullish: 'text-up',
  bearish: 'text-down',
  neutral: 'text-ink-muted',
}
const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' } as const

function pct(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : `${formatNumber(value, 1)}%`
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

function outcomeText(call: MarketCallRecord) {
  const outcome = call.outcomes[horizonIndex.value]
  if (!outcome?.ready) return '未到期'
  return formatSigned(outcome.return, '%')
}

function hitMark(call: MarketCallRecord) {
  const outcome = call.outcomes[horizonIndex.value]
  if (!outcome?.ready || outcome.hit === null) return null
  return outcome.hit ? { text: '對', cls: 'text-warn' } : { text: '錯', cls: 'text-ink-muted' }
}

const PATH_LABELS = { target: '先到目標', stop: '先到停損', open: '都還沒到' } as const

onMounted(() => {
  void loadTrack()
})
</script>

<template>
  <section class="space-y-4 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Hit Rate</p>
        <h2 class="mt-1 text-title font-semibold text-ink">參考命中</h2>
        <p class="mt-1 max-w-2xl text-body text-ink-muted">
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
          class="cursor-pointer border-2 px-3 py-1 text-button transition font-pixel"
          :class="index === horizonIndex ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
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

    <div v-else-if="trackStatus === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
      <span>{{ trackError }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-3 py-1 text-button font-pixel" @click="loadTrack">重試</button>
    </div>

    <template v-else-if="track">
      <p v-if="track.total === 0" class="text-body text-ink-muted">
        還沒有任何建議紀錄。到首頁選「股市諮詢」查一次行情，就會開始累積。
      </p>

      <template v-else>
        <p class="text-body text-ink-muted">
          共 {{ track.total }} 筆建議，{{ track.pending }} 筆還沒過 5 個交易日。
        </p>

        <!-- 規則改版後才出現：全部紀錄 vs 只看目前規則 -->
        <div v-if="hasOlder || track.onlyCurrent" class="space-y-1.5">
          <div class="flex flex-wrap gap-2" role="group" aria-label="統計範圍">
            <button
              v-for="option in [{ value: false, label: '全部紀錄' }, { value: true, label: '只看目前規則' }]"
              :key="String(option.value)"
              type="button"
              class="cursor-pointer border-2 px-3 py-1 text-button transition font-pixel"
              :class="onlyCurrent === option.value ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
              :aria-pressed="onlyCurrent === option.value"
              @click="setOnlyCurrent(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <p class="text-caption text-ink-muted">
            判斷規則改過（目前是第 {{ track.ruleVersion }} 版），舊規則的紀錄有 {{ track.versionCounts?.older ?? 0 }} 筆、目前規則 {{ track.versionCounts?.current ?? 0 }} 筆。
            要知道新規則準不準，看「只看目前規則」。
          </p>
        </div>

        <div v-if="horizon" class="grid gap-3 sm:grid-cols-4">
          <div class="border-2 border-accent-hue/20 bg-accent-hue/5 p-3">
            <p class="text-body text-accent">整體命中率</p>
            <p class="mt-1 text-display font-semibold tabular-nums text-ink">{{ pct(horizon.hitRate) }}</p>
            <p class="text-caption text-ink-muted">{{ horizon.evaluated }} 筆偏多／偏空已到期</p>
            <!-- 對照組：大盤一路漲時，每次都猜漲的命中率本來就高；規則要贏過它才有判斷力 -->
            <p v-if="horizon.alwaysUpRate !== undefined" class="mt-1 text-caption text-ink-muted">
              對照：每次都猜漲是 <span class="tabular-nums text-ink-soft">{{ pct(horizon.alwaysUpRate) }}</span>
            </p>
          </div>
          <div class="border-2 border-up-hue/20 bg-up-hue/5 p-3">
            <p class="text-body text-danger">偏多之後上漲</p>
            <p class="mt-1 text-display font-semibold tabular-nums text-ink">{{ pct(horizon.bullish.hitRate) }}</p>
            <p class="text-caption text-ink-muted">{{ horizon.bullish.count }} 筆，平均 {{ formatSigned(horizon.bullish.avgReturn, '%') }}</p>
          </div>
          <div class="border-2 border-down-hue/20 bg-down-hue/5 p-3">
            <p class="text-body text-down-ink">偏空之後下跌</p>
            <p class="mt-1 text-display font-semibold tabular-nums text-ink">{{ pct(horizon.bearish.hitRate) }}</p>
            <p class="text-caption text-ink-muted">{{ horizon.bearish.count }} 筆，平均 {{ formatSigned(horizon.bearish.avgReturn, '%') }}</p>
          </div>
          <div class="border-2 border-tint/10 bg-tint/5 p-3">
            <p class="text-body text-ink-muted">觀望之後的波動</p>
            <p class="mt-1 text-display font-semibold tabular-nums text-ink">
              {{ horizon.neutral.avgMove === null ? '—' : `±${formatNumber(horizon.neutral.avgMove)}%` }}
            </p>
            <p class="text-caption text-ink-muted">{{ horizon.neutral.count }} 筆，越小代表觀望越合理</p>
          </div>
        </div>

        <div v-if="horizon" class="grid gap-3 sm:grid-cols-2">
          <div class="border-2 border-tint/10 bg-tint/5 p-3">
            <p class="text-body text-ink-muted">依信心分組的命中率</p>
            <ul class="mt-2 space-y-1.5 text-body">
              <li v-for="level in (['high', 'medium', 'low'] as const)" :key="level" class="flex items-center gap-3">
                <span class="w-[3.5em] shrink-0 whitespace-nowrap text-ink-muted">信心{{ CONFIDENCE_LABELS[level] }}</span>
                <div class="h-2 flex-1 bg-tint/10">
                  <div class="h-2 bg-accent-hue/70" :style="{ width: `${horizon.byConfidence[level].hitRate ?? 0}%` }" />
                </div>
                <span class="w-24 text-right tabular-nums text-ink-soft">
                  {{ pct(horizon.byConfidence[level].hitRate) }}（{{ horizon.byConfidence[level].count }}）
                </span>
              </li>
            </ul>
            <p class="mt-2 text-caption text-ink-muted">信心高的命中率應該要比信心低的高；如果沒有，代表信心的算法需要調整。</p>
          </div>
          <div class="border-2 border-tint/10 bg-tint/5 p-3">
            <p class="text-body text-ink-muted">偏多建議 20 日內先碰到目標價的比例</p>
            <p class="mt-1 text-display font-semibold tabular-nums text-ink">{{ pct(track.targetFirstRate) }}</p>
            <p class="text-caption text-ink-muted">
              {{ track.targetPathCount }} 筆已經碰到目標或停損。高於 50% 代表停損與目標設得合理。
            </p>
          </div>
        </div>

        <DataTable table-class="min-w-[40rem]">
          <template #head>
              <tr>
                <th>日期</th>
                <th>標的</th>
                <th>建議</th>
                <th>當時價格</th>
                <th>{{ horizon?.days }} 日後</th>
                <th>結果</th>
                <th>停損／目標</th>
              </tr>
          </template>
              <tr v-for="call in track.calls" :key="call.id" class="text-ink-soft">
                <td class="text-ink-muted">{{ call.date }}</td>
                <td><StockNameCell :name="call.name" :code="call.code || call.symbol" /></td>
                <td>
                  <span :class="STANCE_CLASS[call.stance]">{{ STANCE_LABELS[call.stance] }}</span>
                  <span class="ml-1 text-ink-muted">信心{{ CONFIDENCE_LABELS[call.confidence] }}</span>
                </td>
                <td>{{ formatNumber(call.price) }}</td>
                <td :class="trendClass(call.outcomes[horizonIndex]?.return)">{{ outcomeText(call) }}</td>
                <td>
                  <span v-if="hitMark(call)" :class="hitMark(call)!.cls">{{ hitMark(call)!.text }}</span>
                  <span v-else class="text-ink-muted">—</span>
                </td>
                <td class="text-ink-muted">{{ call.path ? PATH_LABELS[call.path] : '—' }}</td>
              </tr>
        </DataTable>

        <button
          type="button"
          class="cursor-pointer border-2 border-tint/15 px-3 py-1 text-button text-ink-muted transition hover:bg-tint/10 disabled:opacity-60 font-pixel"
          :disabled="clearing"
          @click="clearTrack"
        >
          {{ clearing ? '清除中…' : '清除全部紀錄' }}
        </button>
      </template>
    </template>
  </section>
</template>
