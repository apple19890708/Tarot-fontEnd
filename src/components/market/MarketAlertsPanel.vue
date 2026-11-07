<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { confirmDialog } from '../../lib/confirm'

import {
  addMarketAlert,
  alertKey,
  checkAlertsNow,
  marketAlertPrices,
  alertTitle,
  marketAlerts,
  reactivateAlert,
  removeMarketAlert,
} from '../../lib/marketAlerts'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketNotifySettings from './MarketNotifySettings.vue'
import StockSearchInput from './StockSearchInput.vue'
import type { MarketAlert, MarketAlertKind, MarketAlertTarget, MarketSearchResult } from '../../types'

// 價位提醒：網頁開著時定期檢查（lib/marketAlerts.ts），到價在畫面上提示。
// prefill：從自訂追蹤按「設價位提醒」帶過來的標的
const props = defineProps<{ prefill?: { target: MarketAlertTarget; price: number | null; at: number } | null }>()

const alertsStatus = ref<'loading' | 'ready' | 'error'>('loading')
const alertsError = ref('')
// 提醒種類與各自的選項；條件的文字由後端產生（alert.description），這裡只是表單的按鈕標籤
const KINDS: { value: MarketAlertKind; label: string }[] = [
  { value: 'price', label: '價格' },
  { value: 'changePct', label: '漲跌幅' },
  { value: 'ma', label: '均線' },
  { value: 'kd', label: 'KD' },
  { value: 'rsi', label: 'RSI' },
  { value: 'volume', label: '量能' },
]
const DIRECTIONS: Record<MarketAlertKind, { value: string; label: string; tone: 'up' | 'down' }[]> = {
  price: [
    { value: 'below', label: '跌到', tone: 'down' },
    { value: 'above', label: '漲到', tone: 'up' },
  ],
  changePct: [
    { value: 'down', label: '單日跌幅達', tone: 'down' },
    { value: 'up', label: '單日漲幅達', tone: 'up' },
  ],
  ma: [
    { value: 'below', label: '跌破', tone: 'down' },
    { value: 'above', label: '站上', tone: 'up' },
  ],
  kd: [
    { value: 'dead', label: '死亡交叉', tone: 'down' },
    { value: 'golden', label: '黃金交叉', tone: 'up' },
  ],
  rsi: [
    { value: 'below', label: '低於（超賣）', tone: 'down' },
    { value: 'above', label: '高於（過熱）', tone: 'up' },
  ],
  volume: [],
}
// 切換種類時帶入常用的預設門檻
const DEFAULT_VALUE: Partial<Record<MarketAlertKind, string>> = { changePct: '5', rsi: '70', volume: '2' }

const form = ref({
  market: 'tw' as 'tw' | 'us',
  query: '',
  kind: 'price' as MarketAlertKind,
  direction: 'below',
  price: '',
  value: '',
  period: 60 as 20 | 60,
  note: '',
})

function selectKind(kind: MarketAlertKind) {
  form.value.kind = kind
  form.value.direction = DIRECTIONS[kind][0]?.value ?? 'above'
  form.value.value = DEFAULT_VALUE[kind] ?? ''
  if (kind === 'rsi') form.value.direction = 'above'
}
// RSI 選了低於時，預設門檻改成 30
watch(
  () => [form.value.kind, form.value.direction],
  ([kind, direction], [, oldDirection]) => {
    if (kind === 'rsi' && direction !== oldDirection) form.value.value = direction === 'below' ? '30' : '70'
  },
)
const picked = ref<MarketSearchResult | null>(null)
const formError = ref('')
const saving = ref(false)
const priceInput = ref<HTMLInputElement | null>(null)

// 選了候選之後又改了文字或市場，就不再用剛才選的標的
watch(
  () => form.value.query,
  (value) => {
    if (picked.value && value !== picked.value.name) picked.value = null
  },
)

function applyPrefill() {
  if (!props.prefill) return
  const { target, price } = props.prefill
  form.value.market = target.market
  selectKind('price')
  picked.value = target
  form.value.query = target.name
  // 帶入目前價格當參考，直接改成想要的價位
  const current = price ?? marketAlertPrices.value[alertKey(target)]
  if (current !== undefined && current !== null) form.value.price = String(current)
  priceInput.value?.focus()
}
watch(() => props.prefill?.at, applyPrefill)

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
  const { kind, direction } = form.value
  if (!form.value.query.trim()) {
    formError.value = '請輸入標的。'
    return
  }
  const price = Number(form.value.price)
  const value = Number(form.value.value)
  if (kind === 'price' && (!Number.isFinite(price) || price <= 0)) {
    formError.value = '請輸入正確的價格。'
    return
  }
  if (['changePct', 'rsi', 'volume'].includes(kind) && (!Number.isFinite(value) || value <= 0)) {
    formError.value = '請輸入正確的門檻。'
    return
  }
  saving.value = true
  try {
    const target = picked.value
      ? {
          symbol: picked.value.symbol,
          code: picked.value.code ?? null,
          exchange: picked.value.exchange ?? null,
          market: picked.value.market,
          kind: picked.value.kind,
          name: picked.value.name,
        }
      : undefined
    await addMarketAlert({
      target,
      query: target ? undefined : form.value.query.trim(),
      kind,
      ...(kind === 'price'
        ? { condition: direction as 'above' | 'below', price }
        : { params: { direction, value: ['changePct', 'rsi', 'volume'].includes(kind) ? value : null, period: kind === 'ma' ? form.value.period : null } }),
      note: form.value.note.trim(),
    })
    form.value = { ...form.value, query: '', price: '', note: '' }
    picked.value = null
    await checkAlertsNow()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '新增失敗'
  } finally {
    saving.value = false
  }
}

const deleting = ref('')
async function deleteAlert(id: string) {
  const ok = await confirmDialog({ title: '刪除提醒', message: '確定要刪除這個提醒嗎？', confirmText: '刪除', danger: true })
  if (!ok) return
  deleting.value = id
  try {
    await removeMarketAlert(id)
  } catch (error) {
    alertsError.value = error instanceof Error ? error.message : '刪除失敗'
  } finally {
    deleting.value = ''
  }
}

// 只有價格提醒才算「還差多少」
function distanceText(alert: MarketAlert) {
  if ((alert.kind ?? 'price') !== 'price' || alert.price === null) return ''
  const current = marketAlertPrices.value[alertKey(alert.target)]
  if (current === undefined) return ''
  const diff = ((alert.price - current) / current) * 100
  return `目前 ${formatNumber(current)}，還差 ${formatSigned(diff, '%')}`
}

const reactivating = ref('')
async function reactivate(id: string) {
  reactivating.value = id
  try {
    await reactivateAlert(id)
  } catch (error) {
    alertsError.value = error instanceof Error ? error.message : '重新啟用失敗'
  } finally {
    reactivating.value = ''
  }
}

// 顏色：漲、站上、黃金交叉、過熱用紅；跌、跌破、死亡交叉、超賣用綠
function toneOf(alert: MarketAlert) {
  const direction = alert.kind && alert.kind !== 'price' ? alert.params?.direction : alert.condition
  return ['above', 'up', 'golden'].includes(direction ?? '') ? 'text-up' : 'text-down'
}

const activeAlerts = computed(() => marketAlerts.value.filter((alert) => alert.active))
const firedAlerts = computed(() => marketAlerts.value.filter((alert) => !alert.active))

function formatTime(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(
    new Date(value),
  )
}

onMounted(async () => {
  await loadAlerts()
  // 第一次切過來就帶著 prefill 時，等價格查完再帶入，才有目前價格可以參考
  applyPrefill()
})
</script>

<template>
  <section class="space-y-4 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div>
      <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Price Alerts</p>
      <h2 class="mt-1 text-title font-semibold text-ink">價位提醒</h2>
      <p class="mt-1 text-body text-ink-muted">
        網頁開著時每 3 分鐘檢查一次，到價會在畫面上提示；瀏覽器允許通知的話也會跳系統通知。開啟推播後，網頁關著也會跳出通知。
        也可以在股市諮詢的「操作建議」或自訂追蹤一鍵帶入標的。
      </p>
    </div>

    <MarketNotifySettings />

    <!-- 輸入框都要 min-w-0，否則原生 input 的預設寬度會把整列撐出框外 -->
    <form class="space-y-2" @submit.prevent="submitAlert">
      <div class="flex flex-wrap gap-2">
        <div class="flex shrink-0" role="radiogroup" aria-label="市場">
          <button
            v-for="market in (['tw', 'us'] as const)"
            :key="market"
            type="button"
            role="radio"
            :aria-checked="form.market === market"
            class="cursor-pointer border-2 px-3 py-2 text-button transition font-pixel"
            :class="form.market === market ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
            @click="
              () => {
                form.market = market
                picked = null
              }
            "
          >
            {{ market === 'tw' ? '台股' : '美股' }}
          </button>
        </div>
        <StockSearchInput
          v-model="form.query"
          class="flex-[2_1_14rem]"
          :market="form.market"
          :placeholder="form.market === 'tw' ? '代號或名稱（2330、台積電）' : '代號或名稱（NVDA、輝達）'"
          @select="picked = $event"
        />
      </div>
      <!-- 提醒種類 -->
      <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="提醒種類">
        <button
          v-for="option in KINDS"
          :key="option.value"
          type="button"
          role="radio"
          :aria-checked="form.kind === option.value"
          class="cursor-pointer border px-2.5 py-1 text-button transition"
          :class="form.kind === option.value ? 'border-accent-hue/50 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
          @click="selectKind(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <!-- 原生 select 的選項面板是瀏覽器畫的，深色主題下看不到字，改用切換按鈕 -->
        <div v-if="DIRECTIONS[form.kind].length" class="flex shrink-0" role="radiogroup" aria-label="提醒條件">
          <button
            v-for="option in DIRECTIONS[form.kind]"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="form.direction === option.value"
            class="cursor-pointer border-2 px-3 py-2 text-button transition font-pixel"
            :class="
              form.direction === option.value
                ? option.tone === 'up'
                  ? 'border-up-hue/50 bg-up-hue/15 text-up-ink'
                  : 'border-down-hue/50 bg-down-hue/15 text-down-ink'
                : 'border-tint/10 text-ink-muted hover:bg-tint/10'
            "
            @click="form.direction = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <input
          v-if="form.kind === 'price'"
          ref="priceInput"
          v-model="form.price"
          inputmode="decimal"
          class="min-w-0 flex-[1_1_7rem] border-2 border-tint/10 bg-tint/5 px-3 py-2 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40"
          placeholder="價格"
        />
        <!-- 均線：MA20 或 MA60 -->
        <div v-else-if="form.kind === 'ma'" class="flex shrink-0" role="radiogroup" aria-label="均線">
          <button
            v-for="period in ([20, 60] as const)"
            :key="period"
            type="button"
            role="radio"
            :aria-checked="form.period === period"
            class="cursor-pointer border-2 px-3 py-2 text-button transition font-pixel"
            :class="form.period === period ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
            @click="form.period = period"
          >
            {{ period === 20 ? '月線 MA20' : '季線 MA60' }}
          </button>
        </div>
        <label v-else-if="form.kind !== 'kd'" class="flex min-w-0 flex-[1_1_9rem] items-center gap-2">
          <span v-if="form.kind === 'volume'" class="shrink-0 text-body text-ink-muted">量比達</span>
          <input
            v-model="form.value"
            inputmode="decimal"
            class="min-w-0 flex-1 border-2 border-tint/10 bg-tint/5 px-3 py-2 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40"
            :placeholder="form.kind === 'changePct' ? '例如 5' : form.kind === 'rsi' ? '例如 70' : '例如 2'"
          />
          <span class="shrink-0 text-body text-ink-muted">{{ form.kind === 'changePct' ? '%' : form.kind === 'volume' ? '倍' : '' }}</span>
        </label>
      </div>
      <p v-if="form.kind === 'ma'" class="text-caption text-ink-muted">均線提醒會先記下目前在均線哪一側，之後從另一側穿越過來才通知。</p>
      <p v-else-if="form.kind === 'volume'" class="text-caption text-ink-muted">量比是當日成交量相對前 20 日平均量的倍數；盤中量還沒累積完，收盤前比較容易偏低。</p>
      <div class="flex flex-wrap gap-2">
        <input
          v-model="form.note"
          maxlength="100"
          class="min-w-0 flex-[2_1_12rem] border-2 border-tint/10 bg-tint/5 px-3 py-2 text-body text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40"
          placeholder="備註（選填）"
        />
        <button
          type="submit"
          class="shrink-0 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-4 py-2 text-button text-accent transition hover:bg-accent-hue/25 disabled:opacity-60 font-pixel"
          :disabled="saving"
        >
          {{ saving ? '新增中…' : '新增提醒' }}
        </button>
      </div>
    </form>
    <p v-if="formError" class="text-body text-danger">{{ formError }}</p>

    <!-- 骨架對應每筆提醒的一列：名稱與條件、距離提醒價、刪除鈕 -->
    <ul v-if="alertsStatus === 'loading'" class="space-y-2">
      <li v-for="n in 3" :key="n" class="flex items-center justify-between gap-3 border-2 border-tint/10 px-3 py-2.5">
        <div class="flex min-w-0 flex-1 items-center gap-3">
          <SkeletonBlock class="h-4 w-40 rounded-none" />
          <SkeletonBlock class="hidden h-3 w-32 rounded-none sm:block" />
        </div>
        <SkeletonBlock class="h-6 w-12 shrink-0 rounded-none" />
      </li>
    </ul>
    <div v-else-if="alertsStatus === 'error'" class="flex flex-wrap items-center gap-3 text-body text-danger">
      <span>{{ alertsError }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-3 py-1 text-button font-pixel" @click="loadAlerts">重試</button>
    </div>

    <template v-else>
      <p v-if="alertsError" class="text-body text-danger">{{ alertsError }}</p>
      <p v-if="marketAlerts.length === 0" class="text-body text-ink-muted">還沒有設定任何提醒。</p>

      <ul v-if="activeAlerts.length" class="space-y-2">
        <li v-for="alert in activeAlerts" :key="alert.id" class="flex flex-wrap items-center justify-between gap-2 border-2 border-tint/10 bg-tint/5 px-3 py-2 text-body">
          <span class="min-w-0">
            <span class="text-ink">{{ alert.target.name }}</span>
            <span :class="toneOf(alert)"> {{ alertTitle(alert) }}</span>
            <span v-if="distanceText(alert)" class="ml-2 text-caption text-ink-muted">{{ distanceText(alert) }}</span>
            <span v-if="alert.note" class="block text-caption text-ink-muted">{{ alert.note }}</span>
          </span>
          <button
            type="button"
            class="cursor-pointer border-2 border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 disabled:opacity-60 font-pixel"
            :disabled="deleting === alert.id"
            @click="deleteAlert(alert.id)"
          >
            刪除
          </button>
        </li>
      </ul>

      <div v-if="firedAlerts.length" class="space-y-2">
        <p class="text-body text-ink-muted">已觸發</p>
        <ul class="space-y-2">
          <li v-for="alert in firedAlerts" :key="alert.id" class="flex flex-wrap items-center justify-between gap-2 border-2 border-accent-hue/20 bg-accent-hue/5 px-3 py-2 text-body">
            <span>
              <span class="text-ink">{{ alert.target.name }}</span>
              <span class="text-ink-muted"> {{ alertTitle(alert) }}</span>
              <span class="ml-2 text-caption text-accent">
                {{ formatTime(alert.triggeredAt) }} 觸發<template v-if="alert.triggeredPrice !== null">，當時 {{ formatNumber(alert.triggeredPrice) }}</template><template v-if="alert.triggeredNote">，{{ alert.triggeredNote }}</template>
              </span>
              <span v-if="alert.notifiedAt" class="ml-2 border border-info-hue/30 px-1.5 text-caption text-info">已推播</span>
            </span>
            <div class="flex gap-2">
              <button
                type="button"
                class="cursor-pointer border-2 border-accent-hue/30 px-2 py-0.5 text-button text-accent transition hover:bg-accent-hue/10 disabled:opacity-60 font-pixel"
                :disabled="reactivating === alert.id"
                @click="reactivate(alert.id)"
              >
                重新啟用
              </button>
              <button
                type="button"
                class="cursor-pointer border-2 border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 disabled:opacity-60 font-pixel"
                :disabled="deleting === alert.id"
                @click="deleteAlert(alert.id)"
              >
                刪除
              </button>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
