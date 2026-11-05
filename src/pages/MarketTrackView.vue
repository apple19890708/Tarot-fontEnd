<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { clearMarketTrack, fetchMarketTrack } from '../lib/api'
import {
  addMarketAlert,
  alertKey,
  checkAlertsNow,
  marketAlertPrices,
  marketAlerts,
  removeMarketAlert,
} from '../lib/marketAlerts'
import { formatNumber, formatSigned } from '../lib/marketChart'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import type { MarketAlert, MarketCallRecord, MarketTrackSummary } from '../types'

// 股市追蹤：建議命中率（自動對答案）與價位提醒。限 admin 與開通金融股市的會員（路由 meta.stock）

// ---- 建議追蹤 ----
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
  if (!window.confirm('確定要清除全部的建議紀錄嗎？命中率會從頭開始統計。')) return
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

// ---- 價位提醒 ----
const alertsStatus = ref<'loading' | 'ready' | 'error'>('loading')
const alertsError = ref('')
const form = ref({ query: '', condition: 'below' as MarketAlert['condition'], price: '', note: '' })
const formError = ref('')
const saving = ref(false)

async function loadAlerts() {
  alertsStatus.value = 'loading'
  alertsError.value = ''
  try {
    await checkAlertsNow()
    alertsStatus.value = 'ready'
  } catch (error) {
    alertsError.value = error instanceof Error ? error.message : '提醒暫時讀不到。'
    alertsStatus.value = 'error'
  }
}

async function submitAlert() {
  formError.value = ''
  const price = Number(form.value.price)
  if (!form.value.query.trim() || !Number.isFinite(price) || price <= 0) {
    formError.value = '請輸入標的與正確的價格。'
    return
  }
  saving.value = true
  try {
    await addMarketAlert({ query: form.value.query.trim(), condition: form.value.condition, price, note: form.value.note.trim() })
    form.value = { query: '', condition: 'below', price: '', note: '' }
    await checkAlertsNow()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '新增失敗'
  } finally {
    saving.value = false
  }
}

const deleting = ref('')
async function deleteAlert(id: string) {
  deleting.value = id
  try {
    await removeMarketAlert(id)
  } catch (error) {
    alertsError.value = error instanceof Error ? error.message : '刪除失敗'
  } finally {
    deleting.value = ''
  }
}

function distanceText(alert: MarketAlert) {
  const current = marketAlertPrices.value[alertKey(alert.target)]
  if (current === undefined) return ''
  const diff = ((alert.price - current) / current) * 100
  return `目前 ${formatNumber(current)}，還差 ${formatSigned(diff, '%')}`
}

const activeAlerts = computed(() => marketAlerts.value.filter((alert) => alert.active))
const firedAlerts = computed(() => marketAlerts.value.filter((alert) => !alert.active))

function formatTime(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(value),
  )
}

onMounted(() => {
  void loadTrack()
  void loadAlerts()
})
</script>

<template>
  <div class="mx-auto flex w-full min-w-0 flex-col gap-6 py-4">
    <header class="border-2 border-white/10 bg-[#0f1526] p-6">
      <p class="text-xs uppercase tracking-[0.35em] text-amber-100/70">Market Tracking</p>
      <h1 class="mt-2 text-2xl font-semibold text-stone-50">股市追蹤</h1>
      <p class="mt-1 text-sm leading-6 text-stone-300/75">
        每次在股市諮詢查行情，當下的操作建議都會記下來（同一天同一檔只留最後一次），之後自動和實際走勢對答案。
        命中率是檢驗這套規則準不準的唯一方法；樣本少的時候先別太相信。
      </p>
    </header>

    <!-- ── 建議命中率 ── -->
    <section class="space-y-4 border-2 border-white/10 bg-[#0f1526] p-4 sm:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Hit Rate</p>
          <h2 class="mt-1 text-lg font-semibold text-stone-50">建議命中率</h2>
        </div>
        <div class="flex gap-2">
          <button
            v-for="(h, index) in track?.horizons ?? []"
            :key="h.days"
            type="button"
            class="cursor-pointer border-2 px-3 py-1 text-[12px] transition font-pixel"
            :class="index === horizonIndex ? 'border-amber-200/40 bg-amber-200/15 text-amber-50' : 'border-white/15 text-stone-300 hover:bg-white/10'"
            @click="horizonIndex = index"
          >
            {{ h.days }} 日後
          </button>
        </div>
      </div>

      <div v-if="trackStatus === 'loading'" class="space-y-3">
        <SkeletonBlock class="h-16 w-full" />
        <SkeletonBlock class="h-32 w-full" />
      </div>

      <div v-else-if="trackStatus === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
        <span>{{ trackError }}</span>
        <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-[12px] font-pixel" @click="loadTrack">重試</button>
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
            class="cursor-pointer border-2 border-white/15 px-3 py-1 text-[12px] text-stone-300 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
            :disabled="clearing"
            @click="clearTrack"
          >
            {{ clearing ? '清除中…' : '清除全部紀錄' }}
          </button>
        </template>
      </template>
    </section>

    <!-- ── 價位提醒 ── -->
    <section class="space-y-4 border-2 border-white/10 bg-[#0f1526] p-4 sm:p-6">
      <div>
        <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Price Alerts</p>
        <h2 class="mt-1 text-lg font-semibold text-stone-50">價位提醒</h2>
        <p class="mt-1 text-xs leading-5 text-stone-400">
          網頁開著時每 3 分鐘檢查一次，到價會在畫面上提示；瀏覽器允許通知的話也會跳系統通知。網頁關著時不會檢查。
          也可以在股市諮詢的「操作建議」一鍵把停損或目標價設成提醒。
        </p>
      </div>

      <!-- 輸入框都要 min-w-0，否則原生 input 的預設寬度會把整列撐出框外 -->
      <form class="space-y-2" @submit.prevent="submitAlert">
        <div class="flex flex-wrap gap-2">
          <input
            v-model="form.query"
            class="min-w-0 flex-[2_1_14rem] border-2 border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40"
            placeholder="代號或名稱（2330、台積電、$NVDA）"
          />
          <!-- 原生 select 的選項面板是瀏覽器畫的，深色主題下看不到字，改用兩顆切換按鈕 -->
          <div class="flex shrink-0" role="radiogroup" aria-label="提醒條件">
            <button
              v-for="option in ([
                { value: 'below', label: '跌到' },
                { value: 'above', label: '漲到' },
              ] as const)"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="form.condition === option.value"
              class="cursor-pointer border-2 px-3 py-2 text-[12px] transition font-pixel"
              :class="
                form.condition === option.value
                  ? option.value === 'above'
                    ? 'border-rose-300/50 bg-rose-300/15 text-rose-100'
                    : 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100'
                  : 'border-white/10 text-stone-400 hover:bg-white/10'
              "
              @click="form.condition = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <input
            v-model="form.price"
            inputmode="decimal"
            class="min-w-0 flex-[1_1_7rem] border-2 border-white/10 bg-white/5 px-3 py-2 text-sm tabular-nums text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40"
            placeholder="價格"
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <input
            v-model="form.note"
            maxlength="100"
            class="min-w-0 flex-[1_1_14rem] border-2 border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40"
            placeholder="備註（選填）"
          />
          <button
            type="submit"
            class="shrink-0 cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-4 py-2 text-[12px] text-amber-50 transition hover:bg-amber-200/25 disabled:opacity-60 font-pixel"
            :disabled="saving"
          >
            {{ saving ? '新增中…' : '新增提醒' }}
          </button>
        </div>
      </form>
      <p v-if="formError" class="text-sm text-rose-200">{{ formError }}</p>

      <div v-if="alertsStatus === 'loading'" class="space-y-2">
        <SkeletonBlock class="h-10 w-full" />
        <SkeletonBlock class="h-10 w-full" />
      </div>
      <p v-else-if="alertsStatus === 'error'" class="text-sm text-rose-200">{{ alertsError }}</p>

      <template v-else>
        <p v-if="marketAlerts.length === 0" class="text-sm text-stone-300/80">還沒有設定任何提醒。</p>

        <ul v-if="activeAlerts.length" class="space-y-2">
          <li v-for="alert in activeAlerts" :key="alert.id" class="flex flex-wrap items-center justify-between gap-2 border-2 border-white/10 bg-white/5 px-3 py-2 text-sm">
            <span class="min-w-0">
              <span class="text-stone-50">{{ alert.target.name }}</span>
              <span :class="alert.condition === 'above' ? 'text-rose-300' : 'text-emerald-300'">
                {{ alert.condition === 'above' ? ' 漲到 ' : ' 跌到 ' }}{{ formatNumber(alert.price) }}
              </span>
              <span v-if="distanceText(alert)" class="ml-2 text-xs text-stone-400">{{ distanceText(alert) }}</span>
              <span v-if="alert.note" class="block text-xs text-stone-500">{{ alert.note }}</span>
            </span>
            <button
              type="button"
              class="cursor-pointer border-2 border-white/15 px-2 py-0.5 text-[11px] text-stone-300 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
              :disabled="deleting === alert.id"
              @click="deleteAlert(alert.id)"
            >
              刪除
            </button>
          </li>
        </ul>

        <div v-if="firedAlerts.length" class="space-y-2">
          <p class="text-xs text-stone-400">已觸發</p>
          <ul class="space-y-2">
            <li v-for="alert in firedAlerts" :key="alert.id" class="flex flex-wrap items-center justify-between gap-2 border-2 border-amber-200/20 bg-amber-200/5 px-3 py-2 text-sm">
              <span>
                <span class="text-stone-50">{{ alert.target.name }}</span>
                <span class="text-stone-300">{{ alert.condition === 'above' ? ' 漲到 ' : ' 跌到 ' }}{{ formatNumber(alert.price) }}</span>
                <span class="ml-2 text-xs text-amber-100/80">
                  {{ formatTime(alert.triggeredAt) }} 觸發，當時 {{ formatNumber(alert.triggeredPrice) }}
                </span>
              </span>
              <button
                type="button"
                class="cursor-pointer border-2 border-white/15 px-2 py-0.5 text-[11px] text-stone-300 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
                :disabled="deleting === alert.id"
                @click="deleteAlert(alert.id)"
              >
                刪除
              </button>
            </li>
          </ul>
        </div>
      </template>
    </section>
  </div>
</template>
