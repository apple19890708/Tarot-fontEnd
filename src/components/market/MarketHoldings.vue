<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { confirmDialog } from '../../lib/confirm'

import { updateWatchHoldings } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import type { MarketDividend, MarketTrade, MarketWatchItem } from '../../types'

// 一檔股票的持股：買賣紀錄（先進先出）、股利、損益。
// 損益數字全部由後端算（含手續費、證交稅），這裡只負責顯示與編輯紀錄。
const props = defineProps<{ item: MarketWatchItem }>()
const editing = defineModel<boolean>('editing', { default: false })
const emit = defineEmits<{ saved: [item: MarketWatchItem] }>()

const MAX_TRADES = 100
const MAX_DIVIDENDS = 100
const unitLabel = computed(() => (props.item.target.market === 'tw' ? '張' : '股'))
const currency = computed(() => (props.item.target.market === 'tw' ? '元' : '美元'))
const position = computed(() => props.item.position)

// ---- 編輯 ----
interface TradeRow {
  side: 'buy' | 'sell'
  quantity: string
  price: string
  date: string
}
interface DividendRow {
  amount: string
  date: string
}

const tradeRows = ref<TradeRow[]>([])
const dividendRows = ref<DividendRow[]>([])
const editError = ref('')
const saving = ref(false)

function resetRows() {
  editError.value = ''
  tradeRows.value = props.item.trades.length
    ? props.item.trades.map((t) => ({ side: t.side, quantity: String(t.quantity), price: String(t.price), date: t.date ?? '' }))
    : [{ side: 'buy', quantity: '', price: '', date: '' }]
  dividendRows.value = props.item.dividends.map((d) => ({ amount: String(d.amount), date: d.date ?? '' }))
}
watch(editing, (value) => value && resetRows(), { immediate: true })

function addTrade(side: 'buy' | 'sell') {
  if (tradeRows.value.length < MAX_TRADES) {
    tradeRows.value = [...tradeRows.value, { side, quantity: '', price: '', date: new Date().toISOString().slice(0, 10) }]
  }
}
function removeTrade(index: number) {
  tradeRows.value = tradeRows.value.filter((_, i) => i !== index)
}
function addDividend() {
  if (dividendRows.value.length < MAX_DIVIDENDS) dividendRows.value = [...dividendRows.value, { amount: '', date: '' }]
}
function removeDividend(index: number) {
  dividendRows.value = dividendRows.value.filter((_, i) => i !== index)
}

// 整列空白的略過；其他格式問題回傳錯誤訊息
function parseRows(): { trades?: MarketTrade[]; dividends?: MarketDividend[]; error?: string } {
  const trades: MarketTrade[] = []
  for (const [index, row] of tradeRows.value.entries()) {
    if (!row.quantity.trim() && !row.price.trim()) continue
    const quantity = Number(row.quantity)
    const price = Number(row.price)
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `第 ${index + 1} 筆：數量要大於 0。` }
    if (!Number.isFinite(price) || price <= 0) return { error: `第 ${index + 1} 筆：成交價要大於 0。` }
    trades.push({ side: row.side, quantity, price, date: row.date || null })
  }
  const dividends: MarketDividend[] = []
  for (const [index, row] of dividendRows.value.entries()) {
    if (!row.amount.trim()) continue
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount <= 0) return { error: `第 ${index + 1} 筆股利：金額要大於 0。` }
    dividends.push({ amount, date: row.date || null })
  }
  return { trades, dividends }
}

// 編輯中的即時數量（賣超過時提醒；正確的數字以儲存後後端算的為準）
const previewQuantity = computed(() =>
  tradeRows.value.reduce((sum, row) => {
    const q = Number(row.quantity)
    return Number.isFinite(q) && q > 0 ? sum + (row.side === 'buy' ? q : -q) : sum
  }, 0),
)

async function save(clear = false) {
  editError.value = ''
  let payload: { trades: MarketTrade[]; dividends: MarketDividend[] }
  if (clear) {
    const ok = await confirmDialog({
      title: '清除持股紀錄',
      message: `確定要清除 ${props.item.target.name} 的全部買賣與股利紀錄嗎？`,
      confirmText: '清除',
      danger: true,
    })
    if (!ok) return
    payload = { trades: [], dividends: [] }
  } else {
    const parsed = parseRows()
    if (parsed.error) {
      editError.value = parsed.error
      return
    }
    payload = { trades: parsed.trades!, dividends: parsed.dividends! }
  }
  saving.value = true
  try {
    const { item } = await updateWatchHoldings(props.item.id, payload)
    emit('saved', item)
    editing.value = false
  } catch (err) {
    editError.value = err instanceof Error ? err.message : '儲存失敗'
  } finally {
    saving.value = false
  }
}

// ---- 待確認的股利 ----
// 持有中、而且即將除息（有現金股利）：預估可領 = 每股現金 × 張數 × 1000 股。
// 除權息預告表過了除息日就查不到，所以讓使用者在除息前確認記入（實際入帳金額以券商為準，之後可以改）
const pendingDividend = computed(() => {
  const event = props.item.summary?.events?.exDividend
  const quantity = position.value?.quantity ?? 0
  if (!event?.cashDividend || quantity <= 0 || props.item.target.market !== 'tw') return null
  if (props.item.dividends.some((d) => d.date === event.date)) return null
  return { date: event.date, perShare: event.cashDividend, quantity, amount: Math.round(event.cashDividend * quantity * 1000) }
})
const recording = ref(false)
const recordError = ref('')

async function recordDividend() {
  const pending = pendingDividend.value
  if (!pending) return
  const ok = await confirmDialog({
    title: '記入股利',
    message: `記入 ${formatNumber(pending.amount, 0)} 元的股利（除息日 ${pending.date}）？
實際入帳金額以券商為準，之後可以在「編輯持股」修改。`,
    confirmText: '記入',
  })
  if (!ok) return
  recording.value = true
  recordError.value = ''
  try {
    const dividends = [...props.item.dividends, { amount: pending.amount, date: pending.date }]
    const { item } = await updateWatchHoldings(props.item.id, { dividends })
    emit('saved', item)
  } catch (err) {
    recordError.value = err instanceof Error ? err.message : '記入失敗'
  } finally {
    recording.value = false
  }
}

// ---- 顯示 ----
function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-300'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}
const money = (value: number | null | undefined, digits = 0) => (value === null || value === undefined ? '—' : formatNumber(value, digits))
// 台股金額取整數；美股保留到分
const signedMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return formatSigned(props.item.target.market === 'tw' ? Math.round(value) : Math.round(value * 100) / 100)
}

const INPUT_CLASS =
  'min-w-0 border-2 border-white/10 bg-white/5 px-2.5 py-2 text-sm tabular-nums text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40'
</script>

<template>
  <!-- ── 編輯 ── -->
  <div v-if="editing" class="space-y-3 border-t border-white/10 pt-3">
    <div class="space-y-2">
      <p class="text-xs text-stone-400">
        買賣紀錄依順序先進先出沖銷（{{ unitLabel }}數、成交價、日期）；手續費與證交稅會自動計算。整列空白會略過。
      </p>
      <div v-for="(row, index) in tradeRows" :key="index" class="flex flex-wrap items-center gap-2">
        <span class="w-5 shrink-0 text-right text-[11px] tabular-nums text-stone-500">{{ index + 1 }}</span>
        <div class="flex shrink-0" role="radiogroup" :aria-label="`第 ${index + 1} 筆買或賣`">
          <button
            v-for="side in (['buy', 'sell'] as const)"
            :key="side"
            type="button"
            role="radio"
            :aria-checked="row.side === side"
            class="cursor-pointer border-2 px-2.5 py-2 text-[14px] transition font-pixel"
            :class="
              row.side === side
                ? side === 'buy'
                  ? 'border-rose-300/50 bg-rose-300/15 text-rose-100'
                  : 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100'
                : 'border-white/10 text-stone-400 hover:bg-white/10'
            "
            @click="row.side = side"
          >
            {{ side === 'buy' ? '買' : '賣' }}
          </button>
        </div>
        <input v-model="row.quantity" inputmode="decimal" :class="INPUT_CLASS" class="flex-[1_1_4.5rem]" :placeholder="`${unitLabel}數`" :aria-label="`第 ${index + 1} 筆的${unitLabel}數`" />
        <input v-model="row.price" inputmode="decimal" :class="INPUT_CLASS" class="flex-[1_1_4.5rem]" placeholder="成交價" :aria-label="`第 ${index + 1} 筆的成交價`" />
        <input v-model="row.date" type="date" :class="INPUT_CLASS" class="flex-[1_1_8.5rem] [color-scheme:dark]" :aria-label="`第 ${index + 1} 筆的日期`" />
        <button
          type="button"
          class="shrink-0 cursor-pointer border-2 border-white/15 px-2 py-2 text-[14px] text-stone-400 transition hover:bg-white/10 font-pixel"
          :aria-label="`刪除第 ${index + 1} 筆`"
          @click="removeTrade(index)"
        >
          刪除
        </button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex gap-2">
          <button
            type="button"
            class="cursor-pointer border-2 border-dashed border-rose-300/30 px-3 py-1.5 text-[14px] text-rose-100 transition hover:bg-rose-300/10 disabled:opacity-50 font-pixel"
            :disabled="tradeRows.length >= MAX_TRADES"
            @click="addTrade('buy')"
          >
            ＋ 買進
          </button>
          <button
            type="button"
            class="cursor-pointer border-2 border-dashed border-emerald-300/30 px-3 py-1.5 text-[14px] text-emerald-100 transition hover:bg-emerald-300/10 disabled:opacity-50 font-pixel"
            :disabled="tradeRows.length >= MAX_TRADES"
            @click="addTrade('sell')"
          >
            ＋ 賣出
          </button>
        </div>
        <p class="text-[11px] tabular-nums" :class="previewQuantity < 0 ? 'text-rose-200' : 'text-stone-400'">
          {{ previewQuantity < 0 ? '賣出的數量超過買進' : `剩餘 ${formatNumber(previewQuantity, 3)} ${unitLabel}` }}
        </p>
      </div>
    </div>

    <div class="space-y-2 border-t border-white/5 pt-3">
      <p class="text-xs text-stone-400">現金股利（實際入帳的總金額，{{ currency }}）</p>
      <div v-for="(row, index) in dividendRows" :key="index" class="flex flex-wrap items-center gap-2">
        <span class="w-5 shrink-0 text-right text-[11px] tabular-nums text-stone-500">{{ index + 1 }}</span>
        <input v-model="row.amount" inputmode="decimal" :class="INPUT_CLASS" class="flex-[1_1_6rem]" placeholder="金額" :aria-label="`第 ${index + 1} 筆股利金額`" />
        <input v-model="row.date" type="date" :class="INPUT_CLASS" class="flex-[1_1_8.5rem] [color-scheme:dark]" :aria-label="`第 ${index + 1} 筆股利日期`" />
        <button
          type="button"
          class="shrink-0 cursor-pointer border-2 border-white/15 px-2 py-2 text-[14px] text-stone-400 transition hover:bg-white/10 font-pixel"
          :aria-label="`刪除第 ${index + 1} 筆股利`"
          @click="removeDividend(index)"
        >
          刪除
        </button>
      </div>
      <button
        type="button"
        class="cursor-pointer border-2 border-dashed border-amber-200/30 px-3 py-1.5 text-[14px] text-amber-100 transition hover:bg-amber-200/10 disabled:opacity-50 font-pixel"
        :disabled="dividendRows.length >= MAX_DIVIDENDS"
        @click="addDividend"
      >
        ＋ 股利
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="shrink-0 cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-3 py-2 text-[14px] text-amber-50 transition hover:bg-amber-200/25 disabled:opacity-60 font-pixel"
        :disabled="saving"
        @click="save()"
      >
        {{ saving ? '儲存中…' : '儲存' }}
      </button>
      <button
        v-if="item.trades.length || item.dividends.length"
        type="button"
        class="shrink-0 cursor-pointer border-2 border-white/15 px-3 py-2 text-[14px] text-stone-300 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
        :disabled="saving"
        @click="save(true)"
      >
        清除全部紀錄
      </button>
      <button
        type="button"
        class="shrink-0 cursor-pointer border-2 border-white/15 px-3 py-2 text-[14px] text-stone-400 transition hover:bg-white/10 font-pixel"
        @click="editing = false"
      >
        取消
      </button>
    </div>
    <p v-if="editError" class="text-sm text-rose-200">{{ editError }}</p>
  </div>

  <!-- ── 顯示 ── -->
  <div v-else-if="position" class="space-y-2 border-t border-white/10 pt-3 text-xs tabular-nums">
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div>
        <p class="text-stone-500">持有</p>
        <p v-if="position.quantity > 0" class="text-stone-100">
          {{ formatNumber(position.quantity, 3) }} {{ unitLabel }}
          <span class="text-stone-500">均價 {{ formatNumber(position.avgCost) }}</span>
        </p>
        <p v-else class="text-stone-400">已出清</p>
      </div>
      <div>
        <p class="text-stone-500">市值</p>
        <p class="text-stone-100">{{ money(position.marketValue) }}</p>
      </div>
      <div>
        <p class="text-stone-500">未實現損益</p>
        <p :class="trendClass(position.unrealized)">
          {{ signedMoney(position.unrealized) }}<template v-if="position.unrealizedPct !== null">（{{ formatSigned(position.unrealizedPct, '%') }}）</template>
        </p>
      </div>
      <div>
        <p class="text-stone-500">今日損益</p>
        <p :class="trendClass(position.today)">{{ signedMoney(position.today) }}</p>
      </div>
      <div>
        <p class="text-stone-500">已實現損益</p>
        <p :class="trendClass(position.realized)">{{ signedMoney(position.realized) }}</p>
      </div>
      <div>
        <p class="text-stone-500">股利</p>
        <p :class="position.dividends ? 'text-amber-100' : 'text-stone-400'">{{ money(position.dividends, 2) }}</p>
      </div>
      <div>
        <p class="text-stone-500">總報酬</p>
        <p class="font-semibold" :class="trendClass(position.totalReturn)">{{ signedMoney(position.totalReturn) }}</p>
      </div>
      <div>
        <p class="text-stone-500">已付手續費／稅</p>
        <p class="text-stone-300">{{ money(position.feesPaid, 2) }}／{{ money(position.taxPaid) }}</p>
      </div>
    </div>
    <!-- 即將除息：預估可領的現金股利，確認後記入 -->
    <div v-if="pendingDividend" class="flex flex-wrap items-center gap-2 border border-amber-200/25 bg-amber-200/5 px-2.5 py-1.5 text-[11px]">
      <span class="text-amber-100">
        {{ pendingDividend.date }} 除息，預估可領 {{ formatNumber(pendingDividend.amount, 0) }} 元
        <span class="text-stone-400">（{{ formatNumber(pendingDividend.quantity, 3) }} 張 × 每股 {{ formatNumber(pendingDividend.perShare, 4) }} 元）</span>
      </span>
      <button
        type="button"
        class="cursor-pointer border border-amber-200/40 px-2 py-0.5 text-amber-50 transition hover:bg-amber-200/15 disabled:opacity-60"
        :disabled="recording"
        @click="recordDividend"
      >
        {{ recording ? '記入中…' : '記入股利' }}
      </button>
      <span v-if="recordError" class="text-rose-200">{{ recordError }}</span>
    </div>

    <p class="text-[11px] leading-5 text-stone-500">
      未實現損益已扣掉現在賣出的預估手續費與稅（{{ money(position.sellCost, 2) }}）；總報酬 = 未實現 + 已實現 + 股利。
    </p>

    <!-- 持有中的批次：每筆預設一行，點開看成本、市值、報酬率 -->
    <details v-if="position.openLots.length > 1">
      <summary class="cursor-pointer text-[11px] text-stone-300 marker:text-stone-200 hover:text-stone-100">持有中的批次（{{ position.openLots.length }}）</summary>
      <ul class="mt-1.5 space-y-0.5">
        <li v-for="(lot, index) in position.openLots" :key="index">
          <details class="group">
            <summary class="flex cursor-pointer list-none items-center gap-2 py-0.5 text-[11px] hover:bg-white/5 [&::-webkit-details-marker]:hidden">
              <span class="w-3 shrink-0 text-stone-200 transition group-open:rotate-90">›</span>
              <span class="shrink-0 text-stone-400">{{ lot.date || '未填日期' }}</span>
              <span class="min-w-0 flex-1 truncate text-stone-200">{{ formatNumber(lot.quantity, 3) }} {{ unitLabel }} @ {{ formatNumber(lot.price) }}</span>
              <span class="shrink-0" :class="trendClass(lot.pnl)">{{ signedMoney(lot.pnl) }}</span>
            </summary>
            <div class="mb-1 ml-5 grid grid-cols-3 gap-2 border-l border-white/10 py-1 pl-3 text-[11px]">
              <div>
                <p class="text-stone-500">成本（含手續費）</p>
                <p class="text-stone-200">{{ money(lot.cost) }}</p>
              </div>
              <div>
                <p class="text-stone-500">市值</p>
                <p class="text-stone-200">{{ money(lot.value) }}</p>
              </div>
              <div>
                <p class="text-stone-500">報酬率</p>
                <p :class="trendClass(lot.pnlPct)">{{ formatSigned(lot.pnlPct, '%') }}</p>
              </div>
            </div>
          </details>
        </li>
      </ul>
    </details>

    <!-- 全部交易紀錄 -->
    <details>
      <summary class="cursor-pointer text-[11px] text-stone-300 marker:text-stone-200 hover:text-stone-100">
        交易紀錄（{{ item.trades.length }} 筆買賣<template v-if="item.dividends.length">、{{ item.dividends.length }} 筆股利</template>）
      </summary>
      <ul class="mt-1.5 space-y-1 text-[11px]">
        <li v-for="(trade, index) in item.trades" :key="`t${index}`" class="flex flex-wrap items-center gap-x-3">
          <span :class="trade.side === 'buy' ? 'text-rose-200' : 'text-emerald-200'">{{ trade.side === 'buy' ? '買' : '賣' }}</span>
          <span class="text-stone-400">{{ trade.date || '未填日期' }}</span>
          <span class="text-stone-200">{{ formatNumber(trade.quantity, 3) }} {{ unitLabel }} @ {{ formatNumber(trade.price) }}</span>
          <span class="text-stone-500">
            手續費 {{ money(position.trades[index]?.fee, 2) }}<template v-if="position.trades[index]?.tax">、稅 {{ money(position.trades[index]?.tax) }}</template>
          </span>
          <span v-if="position.trades[index]?.realized !== null && position.trades[index]?.realized !== undefined" :class="trendClass(position.trades[index]?.realized)">
            已實現 {{ signedMoney(position.trades[index]?.realized) }}
          </span>
        </li>
        <li v-for="(dividend, index) in item.dividends" :key="`d${index}`" class="flex flex-wrap items-center gap-x-3">
          <span class="text-amber-200">息</span>
          <span class="text-stone-400">{{ dividend.date || '未填日期' }}</span>
          <span class="text-amber-100">+{{ money(dividend.amount, 2) }}</span>
        </li>
      </ul>
    </details>
  </div>
</template>
