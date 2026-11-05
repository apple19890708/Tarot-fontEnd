<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { createWatch, deleteWatch, fetchMarketNews, fetchWatchlist, moveWatchToGroup, reorderWatchlist, saveMarketSettings } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { useCooldown } from '../../lib/useCooldown'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketAssetHistory from './MarketAssetHistory.vue'
import MarketHoldingPie from './MarketHoldingPie.vue'
import MarketHoldings from './MarketHoldings.vue'
import MarketSparkline from './MarketSparkline.vue'
import MarketWatchDetail from './MarketWatchDetail.vue'
import MarketEventsCalendar from './MarketEventsCalendar.vue'
import MarketGroupManager from './MarketGroupManager.vue'
import MarketNewsList from './MarketNewsList.vue'
import StockSearchInput from './StockSearchInput.vue'
import type { MarketAlertTarget, MarketFees, MarketPosition, MarketSearchResult, MarketSignal, MarketNewsItem, MarketTrade, MarketWatchGroup, MarketWatchItem } from '../../types'

// 自訂股票追蹤：自己加的觀察清單（台股／美股分開），可以記下買賣與股利算損益。
// 報價、技術判讀與每檔損益都來自後端；前端只做各檔的加總與排序。
const emit = defineEmits<{ alert: [target: MarketAlertTarget, price: number | null] }>()

type Market = 'tw' | 'us'
const MARKET_LABELS: Record<Market, string> = { tw: '台股', us: '美股' }
// 台股持股單位是「張」（1 張 = 1000 股），美股是「股」
const UNIT: Record<Market, { label: string }> = { tw: { label: '張' }, us: { label: '股' } }
const REFRESH_MS = 60 * 1000

// ---- 清單 ----
const items = ref<MarketWatchItem[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const asOf = ref('')
// 下一次月營收公布截止日（後端算好）
const revenueDeadline = ref<{ deadline: string; forMonth: string } | null>(null)
const refreshing = ref(false)
let requestId = 0

async function load({ silent = false } = {}) {
  const id = (requestId += 1)
  if (silent) refreshing.value = true
  else status.value = 'loading'
  try {
    const result = await fetchWatchlist()
    if (id !== requestId) return
    items.value = result.items
    asOf.value = result.asOf
    revenueDeadline.value = result.revenueDeadline ?? null
    groups.value = result.groups ?? []
    // 目前選的清單被刪掉了（例如在別的裝置）就回到全部
    if (groupFilter.value !== 'all' && groupFilter.value !== 'none' && !groups.value.some((g) => g.id === groupFilter.value)) {
      groupFilter.value = 'all'
    }
    if (result.fees) applyFees(result.fees)
    status.value = 'ready'
    error.value = ''
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '追蹤清單暫時讀不到。'
    // 背景更新失敗時保留舊資料，只顯示錯誤訊息
    if (!silent || items.value.length === 0) status.value = 'error'
  } finally {
    if (id === requestId) refreshing.value = false
  }
}

// 手動「更新報價」：按完 30 秒內不能再按（自動更新每分鐘一次，不受影響）
const refreshCooldown = useCooldown(30)
const manualRefresh = () => refreshCooldown.run(() => load({ silent: true }))

// 分頁開著、瀏覽器分頁在前景時每分鐘更新一次報價
let timer: ReturnType<typeof setInterval> | null = null
function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && status.value === 'ready') void load({ silent: true })
  }, REFRESH_MS)
}
function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}
// ---- 重大訊息（另外查，不拖慢清單）----
const news = ref<MarketNewsItem[]>([])
const newsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let newsRequestId = 0
async function loadNews() {
  const id = (newsRequestId += 1)
  if (newsStatus.value !== 'ready') newsStatus.value = 'loading'
  try {
    const result = await fetchMarketNews()
    if (id !== newsRequestId) return
    news.value = result.news
    newsStatus.value = 'ready'
  } catch {
    if (id !== newsRequestId) return
    if (newsStatus.value !== 'ready') newsStatus.value = 'error'
  }
}
const newsByCode = computed(() => {
  const map = new Map<string, MarketNewsItem[]>()
  for (const item of news.value) {
    if (!map.has(item.code)) map.set(item.code, [])
    map.get(item.code)!.push(item)
  }
  return map
})
const newsOf = (item: MarketWatchItem) => (item.target.code ? newsByCode.value.get(item.target.code) ?? [] : [])
// 3 天內有新訊息就在那一行標「重訊」（以這檔報價的日期為準）
const NEWS_RECENT_DAYS = 3
function hasRecentNews(item: MarketWatchItem) {
  const latest = newsOf(item)[0]
  const today = item.summary?.quote.date
  if (!latest || !today) return false
  return (Date.parse(today) - Date.parse(latest.date)) / 86400000 <= NEWS_RECENT_DAYS
}

onMounted(async () => {
  startTimer()
  await load()
  void loadNews()
})
// 放在 KeepAlive 裡：切到其他分頁時停止更新，切回來時先更新一次
let firstActivation = true
onActivated(() => {
  if (firstActivation) {
    firstActivation = false
    return
  }
  void load({ silent: true })
  startTimer()
})
onDeactivated(stopTimer)
onBeforeUnmount(stopTimer)

// ---- 新增 ----
const form = ref({ market: 'tw' as Market, query: '', quantity: '', cost: '' })
const picked = ref<MarketSearchResult | null>(null)
const formError = ref('')
const adding = ref(false)

// 選了候選之後又改了文字，就不再用剛才選的標的
watch(
  () => form.value.query,
  (value) => {
    if (picked.value && value !== picked.value.name) picked.value = null
  },
)
watch(
  () => form.value.market,
  () => {
    picked.value = null
  },
)

// 新增時一起填的張數與成本 → 第一筆買進；兩個都空白就不記
function firstTrade(): { trade?: MarketTrade; error?: string } {
  const { quantity, cost } = form.value
  if (!quantity.trim() && !cost.trim()) return {}
  const q = Number(quantity)
  const c = Number(cost)
  if (!quantity.trim() || !Number.isFinite(q) || q <= 0) return { error: '數量要大於 0。' }
  if (!cost.trim() || !Number.isFinite(c) || c <= 0) return { error: '成本價要大於 0。' }
  return { trade: { side: 'buy', quantity: q, price: c, date: new Date().toISOString().slice(0, 10) } }
}

async function submit() {
  formError.value = ''
  const query = form.value.query.trim()
  if (!query) {
    formError.value = '請輸入代號或名稱。'
    return
  }
  const parsed = firstTrade()
  if (parsed.error) {
    formError.value = parsed.error
    return
  }
  adding.value = true
  try {
    const { item } = await createWatch({
      market: form.value.market,
      query,
      target: picked.value ?? undefined,
      trades: parsed.trade ? [parsed.trade] : [],
      group: addGroup.value,
    })
    items.value = [...items.value, item]
    form.value = { ...form.value, query: '', quantity: '', cost: '' }
    picked.value = null
    // 剛加的股票不在目前的篩選裡時切回全部，免得看起來像沒加成功
    if (marketFilter.value !== 'all' && marketFilter.value !== item.target.market) marketFilter.value = 'all'
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '新增失敗'
  } finally {
    adding.value = false
  }
}

// ---- 編輯持股（MarketHoldings 負責編輯與顯示）----
const editingId = ref('')
function onSaved(updated: MarketWatchItem) {
  items.value = items.value.map((it) => (it.id === updated.id ? updated : it))
}

// ---- 交易成本設定 ----
const feeForm = ref({ twDiscount: '1', twMinFee: '20', usFee: '0' })
const feeError = ref('')
const feeSaving = ref(false)
const feeSaved = ref(false)
function applyFees(fees: MarketFees) {
  feeForm.value = { twDiscount: String(fees.twDiscount), twMinFee: String(fees.twMinFee), usFee: String(fees.usFee) }
}
async function saveFees() {
  feeError.value = ''
  feeSaved.value = false
  const fees = {
    twDiscount: Number(feeForm.value.twDiscount),
    twMinFee: Number(feeForm.value.twMinFee),
    usFee: Number(feeForm.value.usFee),
  }
  feeSaving.value = true
  try {
    applyFees((await saveMarketSettings(fees)).fees)
    feeSaved.value = true
    // 損益要用新的成本設定重算
    await load({ silent: true })
  } catch (err) {
    feeError.value = err instanceof Error ? err.message : '儲存失敗'
  } finally {
    feeSaving.value = false
  }
}

// ---- 快速占卜 ----
// 到首頁開一次新的占卜：問題帶入這檔股票、類別選股市諮詢、牌陣預設「投資決策」。
// 問題只是預設文字，使用者可以再改。指數的代號（^GSPC）不放進問題，避免被誤認成另一個美股代號
const router = useRouter()
function quickReading(item: MarketWatchItem) {
  const name = item.summary?.name || item.target.name
  const id = item.target.kind === 'stock' ? idOf(item.target) : null
  const q = `${name}${id ? `（${id}）` : ''}接下來的走勢與操作方向？`
  void router.push({ name: 'home', query: { q, domain: 'stock', spread: 'investment-decision' } })
}

// ---- 卡片展開 ----
// 預設每檔只顯示一行，點了才展開完整資訊；重新整理報價不會收回
const expandedIds = ref<Set<string>>(new Set())
function toggleExpanded(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

// ---- 移除 ----
const removing = ref('')
async function remove(item: MarketWatchItem) {
  const extra = item.trades.length || item.dividends.length ? '（買賣與股利紀錄也會一起刪除）' : ''
  if (!window.confirm(`確定要移除 ${item.target.name} 嗎？${extra}`)) return
  removing.value = item.id
  try {
    await deleteWatch(item.id)
    items.value = items.value.filter((it) => it.id !== item.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '移除失敗'
  } finally {
    removing.value = ''
  }
}

// ---- 持股加總 ----
// 每檔的損益由後端算好（item.position）；這裡只把同一個市場的加起來（台股、美股幣別不同，分開）
const totals = computed(() =>
  (['tw', 'us'] as const)
    .map((market) => {
      const positions = items.value
        .filter((item) => item.target.market === market && item.position)
        .map((item) => item.position as MarketPosition)
      if (positions.length === 0) return null
      const held = positions.filter((p) => p.quantity > 0 && p.marketValue !== null)
      const sum = (list: MarketPosition[], pick: (p: MarketPosition) => number | null) => list.reduce((acc, p) => acc + (pick(p) ?? 0), 0)
      const value = sum(held, (p) => p.marketValue)
      const cost = sum(held, (p) => p.costBasis)
      const pnl = sum(held, (p) => p.unrealized)
      const todays = held.map((p) => p.today).filter((t): t is number => t !== null)
      return {
        market,
        currency: market === 'tw' ? 'TWD' : 'USD',
        count: held.length,
        value,
        cost,
        pnl,
        pnlPct: cost ? (pnl / cost) * 100 : 0,
        realized: sum(positions, (p) => p.realized),
        dividends: sum(positions, (p) => p.dividends),
        today: todays.length ? todays.reduce((a, b) => a + b, 0) : null,
      }
    })
    .filter((t) => t !== null),
)

const holdingPnl = (item: MarketWatchItem) => (item.position && item.position.quantity > 0 ? item.position.unrealized : null)

// 兩週內要除權息的才在那一行標出來（除息日 − 今天，台北日期由後端給的報價日期為準）
const EX_SOON_DAYS = 14
function exSoon(item: MarketWatchItem) {
  const event = item.summary?.events?.exDividend
  const today = item.summary?.quote.date
  if (!event || !today) return null
  const days = Math.round((Date.parse(event.date) - Date.parse(today)) / 86400000)
  return days >= 0 && days <= EX_SOON_DAYS ? event : null
}
const shortDate = (date: string) => date.slice(5).replace('-', '/')
const monthText = (month: string) => `${Number(month.slice(5))} 月`
const hasTwStock = computed(() => items.value.some((item) => item.target.market === 'tw' && item.target.kind === 'stock'))

// 資產走勢第一次展開才載入
const historyOpened = ref(false)

// 每檔的「K 線與籌碼」第一次展開才載入（之後收起來再打開不重查）
const detailOpened = ref<Set<string>>(new Set())
function onDetailToggle(id: string, event: Event) {
  if ((event.target as HTMLDetailsElement).open && !detailOpened.value.has(id)) {
    detailOpened.value = new Set(detailOpened.value).add(id)
  }
}

// ---- 自選清單 ----
const groups = ref<MarketWatchGroup[]>([])
// all：全部；none：未分類；其他是清單 id
const groupFilter = ref<string>('all')
// 新增股票時放進哪個清單：正在看某個清單就放那裡，否則未分類
const addGroup = computed(() => (groupFilter.value === 'all' || groupFilter.value === 'none' ? null : groupFilter.value))
const groupName = (id: string | null | undefined) => groups.value.find((g) => g.id === id)?.name ?? '未分類'
const groupCount = (id: string) =>
  items.value.filter((item) => (id === 'all' ? true : id === 'none' ? !item.group : item.group === id)).length

function onGroupsChanged(next: MarketWatchGroup[]) {
  groups.value = next
}
function onGroupRemoved(id: string) {
  items.value = items.value.map((item) => (item.group === id ? { ...item, group: null } : item))
  if (groupFilter.value === id) groupFilter.value = 'all'
}

const moving = ref('')
async function moveToGroup(item: MarketWatchItem, group: string | null) {
  moving.value = item.id
  try {
    await moveWatchToGroup(item.id, group)
    items.value = items.value.map((it) => (it.id === item.id ? { ...it, group } : it))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '移動失敗'
  } finally {
    moving.value = ''
  }
}

// ---- 自訂順序（排序模式）----
// 排序模式下每檔是精簡的一列：桌機可以拖曳，手機用上移／下移。只調整目前看得到的這些，其他的位置不變
const sortMode = ref(false)
const dragId = ref('')
const savingOrder = ref(false)

async function applyOrder(visibleIds: string[]) {
  const visibleSet = new Set(visibleIds)
  const queue = [...visibleIds]
  // 全部依目前順序排好，把看得到的那些位置依新順序填回去
  const merged = items.value.map((item) => (visibleSet.has(item.id) ? queue.shift()! : item.id))
  const byId = new Map(items.value.map((item) => [item.id, item]))
  items.value = merged.map((id, index) => ({ ...byId.get(id)!, order: index + 1 }))
  savingOrder.value = true
  try {
    await reorderWatchlist(merged)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '順序儲存失敗'
  } finally {
    savingOrder.value = false
  }
}

function moveBy(id: string, delta: number) {
  const ids = visibleItems.value.map((item) => item.id)
  const index = ids.indexOf(id)
  const target = index + delta
  if (index < 0 || target < 0 || target >= ids.length) return
  ids.splice(target, 0, ids.splice(index, 1)[0]!)
  void applyOrder(ids)
}

function dropOn(targetId: string) {
  const from = dragId.value
  dragId.value = ''
  if (!from || from === targetId) return
  const ids = visibleItems.value.map((item) => item.id)
  const fromIndex = ids.indexOf(from)
  const toIndex = ids.indexOf(targetId)
  if (fromIndex < 0 || toIndex < 0) return
  ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0]!)
  void applyOrder(ids)
}

// ---- 篩選與排序 ----
const marketFilter = ref<'all' | Market>('all')
const sortKey = ref<'added' | 'change' | 'pnl' | 'position'>('added')
// 換成其他排序時離開排序模式
watch(sortKey, (key) => {
  if (key !== 'added') sortMode.value = false
})
const SORT_OPTIONS = [
  { value: 'added', label: '自訂順序' },
  { value: 'change', label: '今日漲跌' },
  { value: 'pnl', label: '持股損益' },
  { value: 'position', label: '52 週位置' },
] as const

const counts = computed(() => ({
  all: items.value.length,
  tw: items.value.filter((i) => i.target.market === 'tw').length,
  us: items.value.filter((i) => i.target.market === 'us').length,
}))

const visibleItems = computed(() => {
  const list = items.value.filter(
    (item) =>
      (marketFilter.value === 'all' || item.target.market === marketFilter.value) &&
      (groupFilter.value === 'all' || (groupFilter.value === 'none' ? !item.group : item.group === groupFilter.value)),
  )
  if (sortKey.value === 'added') return list
  // 沒有數值的排最後
  const valueOf = (item: MarketWatchItem): number | null => {
    if (sortKey.value === 'change') return item.summary?.quote.changePct ?? null
    if (sortKey.value === 'pnl') return item.position?.unrealizedPct ?? null
    return item.summary?.range52w?.position ?? null
  }
  return [...list].sort((a, b) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    return vb - va
  })
})

// ---- 顯示 ----
function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-300'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

const TONE_STYLES: Record<MarketSignal['tone'], string> = {
  bull: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  bear: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
  warn: 'border-amber-200/30 bg-amber-200/10 text-amber-100',
  neutral: 'border-white/15 bg-white/5 text-stone-200',
}

function idOf(target: MarketAlertTarget) {
  return target.market === 'tw' && target.kind === 'stock' ? target.code : target.symbol || target.code
}

function money(value: number, digits = 0) {
  return formatNumber(value, digits)
}

function timeText(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}

const INPUT_CLASS =
  'min-w-0 border-2 border-white/10 bg-white/5 px-3 py-2 text-sm tabular-nums text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40'
</script>

<template>
  <section class="space-y-5 border-2 border-white/10 bg-[#0f1526] p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-[10px] uppercase tracking-[0.2em] text-stone-300/60 sm:text-xs sm:tracking-[0.3em]">Watchlist</p>
        <h2 class="mt-1 text-lg font-semibold text-stone-50">自訂股票追蹤</h2>
        <p class="mt-1 text-xs leading-5 text-stone-400">
          加入想觀察的台股或美股，可以另外記下持股（台股以「張」計，零股可填小數；美股以「股」計）。頁面開著時每分鐘更新報價。
        </p>
      </div>
      <button
        type="button"
        class="cursor-pointer border-2 border-white/15 px-3 py-1 text-[12px] text-stone-300 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
        :disabled="refreshing || status === 'loading' || refreshCooldown.active.value"
        @click="manualRefresh"
      >
        {{ refreshing ? '更新中…' : refreshCooldown.active.value ? `更新報價（${refreshCooldown.remaining.value}）` : '更新報價' }}
      </button>
    </div>

    <!-- ── 新增 ── -->
    <form class="space-y-2 border-2 border-white/10 bg-white/[0.03] p-3" @submit.prevent="submit">
      <div class="flex flex-wrap gap-2">
        <div class="flex shrink-0" role="radiogroup" aria-label="市場">
          <button
            v-for="market in (['tw', 'us'] as const)"
            :key="market"
            type="button"
            role="radio"
            :aria-checked="form.market === market"
            class="cursor-pointer border-2 px-3 py-2 text-[12px] transition font-pixel"
            :class="form.market === market ? 'border-amber-200/40 bg-amber-200/15 text-amber-50' : 'border-white/10 text-stone-400 hover:bg-white/10'"
            @click="form.market = market"
          >
            {{ MARKET_LABELS[market] }}
          </button>
        </div>
        <StockSearchInput
          v-model="form.query"
          class="flex-[2_1_14rem]"
          :market="form.market"
          :placeholder="form.market === 'tw' ? '代號或名稱（2330、台積電、0050）' : '代號或名稱（NVDA、Apple、輝達）'"
          @select="picked = $event"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <input
          v-model="form.quantity"
          inputmode="decimal"
          :class="INPUT_CLASS"
          class="flex-[1_1_8rem]"
          :placeholder="`第一筆${UNIT[form.market].label}數（選填）`"
        />
        <input v-model="form.cost" inputmode="decimal" :class="INPUT_CLASS" class="flex-[1_1_8rem]" placeholder="第一筆成本價（選填）" />
        <button
          type="submit"
          class="shrink-0 cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-4 py-2 text-[12px] text-amber-50 transition hover:bg-amber-200/25 disabled:opacity-60 font-pixel"
          :disabled="adding"
        >
          {{ adding ? '加入中…' : '加入追蹤' }}
        </button>
      </div>
      <p v-if="groups.length" class="text-[11px] text-stone-500">會加入「{{ groupName(addGroup) }}」（先點上面的清單標籤可以改）</p>
      <p v-if="formError" class="text-sm text-rose-200">{{ formError }}</p>
    </form>

    <!-- 交易成本：損益會扣掉手續費與證交稅，券商有折扣的話在這裡設定 -->
    <details class="border-2 border-white/10 bg-white/[0.03] px-3 py-2">
      <summary class="cursor-pointer text-xs text-stone-300 marker:text-stone-200 hover:text-stone-100">交易成本設定</summary>
      <div class="mt-3 space-y-2 text-xs">
        <p class="leading-5 text-stone-400">
          台股手續費 0.1425% × 折扣（2.8 折填 0.28），單筆有最低金額；證交稅股票 0.3%、ETF 0.1%（賣出時收，不用設定）。美股以每筆固定手續費計。
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex min-w-0 flex-[1_1_7rem] flex-col gap-1">
            <span class="text-stone-400">台股手續費折扣</span>
            <input v-model="feeForm.twDiscount" inputmode="decimal" :class="INPUT_CLASS" />
          </label>
          <label class="flex min-w-0 flex-[1_1_7rem] flex-col gap-1">
            <span class="text-stone-400">台股最低手續費（元）</span>
            <input v-model="feeForm.twMinFee" inputmode="decimal" :class="INPUT_CLASS" />
          </label>
          <label class="flex min-w-0 flex-[1_1_7rem] flex-col gap-1">
            <span class="text-stone-400">美股每筆手續費（美元）</span>
            <input v-model="feeForm.usFee" inputmode="decimal" :class="INPUT_CLASS" />
          </label>
          <button
            type="button"
            class="shrink-0 cursor-pointer border-2 border-amber-200/40 bg-amber-200/15 px-3 py-2 text-[12px] text-amber-50 transition hover:bg-amber-200/25 disabled:opacity-60 font-pixel"
            :disabled="feeSaving"
            @click="saveFees"
          >
            {{ feeSaving ? '儲存中…' : '儲存設定' }}
          </button>
        </div>
        <p v-if="feeError" class="text-rose-200">{{ feeError }}</p>
        <p v-else-if="feeSaved" class="text-emerald-200">已儲存，損益已用新設定重算。</p>
      </div>
    </details>

    <!-- 骨架對應載入後的版面：持股總覽卡（含圓餅圖）、篩選與排序列、收合時一行一檔的清單 -->
    <div v-if="status === 'loading'" class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-2 border-2 border-white/10 p-3">
          <SkeletonBlock class="h-3 w-32 rounded-none" />
          <SkeletonBlock class="h-7 w-40 rounded-none" />
          <SkeletonBlock class="h-3 w-48 rounded-none" />
          <div class="flex items-center gap-4 pt-2">
            <SkeletonBlock class="h-28 w-28 shrink-0 rounded-full" />
            <div class="flex-1 space-y-2">
              <SkeletonBlock class="h-3 w-28 rounded-none" />
              <SkeletonBlock class="h-3 w-24 rounded-none" />
            </div>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex gap-2">
          <SkeletonBlock v-for="n in 3" :key="n" class="h-[1.875rem] w-20 rounded-none" />
        </div>
        <SkeletonBlock class="h-5 w-64 rounded-none" />
      </div>
      <ul class="space-y-3">
        <li v-for="n in 4" :key="n" class="flex items-center gap-3 border-2 border-white/10 px-3 py-3">
          <SkeletonBlock class="h-4 flex-1 rounded-none" />
          <SkeletonBlock class="h-4 w-14 rounded-none" />
          <SkeletonBlock class="h-4 w-12 rounded-none" />
          <SkeletonBlock class="hidden h-4 w-20 rounded-none sm:block" />
        </li>
      </ul>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-[12px] font-pixel" @click="load()">重試</button>
    </div>

    <template v-else>
      <p v-if="error" class="text-xs text-rose-200">{{ error }}</p>

      <p v-if="items.length === 0" class="text-sm text-stone-300/80">還沒有追蹤任何股票，從上面輸入代號或名稱加入。</p>

      <template v-else>
        <!-- ── 持股總覽（依幣別分開）── -->
        <div v-if="totals.length" class="grid gap-3 sm:grid-cols-2">
          <div v-for="total in totals" :key="total.market" class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
            <p class="text-xs text-amber-100/80">{{ MARKET_LABELS[total.market] }}持股（{{ total.count }} 檔，{{ total.currency }}）</p>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p class="text-2xl font-semibold tabular-nums text-stone-50">{{ money(total.value) }}</p>
              <p class="text-sm tabular-nums" :class="trendClass(total.pnl)">
                {{ formatSigned(Math.round(total.pnl)) }}（{{ formatSigned(total.pnlPct, '%') }}）
              </p>
            </div>
            <p class="mt-1 text-[11px] tabular-nums text-stone-400">
              成本 {{ money(total.cost) }}
              <template v-if="total.today !== null">
                ・今日 <span :class="trendClass(total.today)">{{ formatSigned(Math.round(total.today)) }}</span>
              </template>
            </p>
            <p v-if="total.realized || total.dividends" class="mt-0.5 text-[11px] tabular-nums text-stone-400">
              已實現 <span :class="trendClass(total.realized)">{{ formatSigned(Math.round(total.realized)) }}</span>
              ・股利 <span class="text-amber-100">{{ money(total.dividends) }}</span>
            </p>
            <MarketHoldingPie v-if="total.cost > 0" class="mt-3" :cost="total.cost" :pnl="total.pnl" :currency="total.currency" />
          </div>
        </div>

        <!-- ── 資產走勢：展開時才載入 ── -->
        <details v-if="totals.length" class="border-2 border-white/10 bg-white/[0.03] px-3 py-2" @toggle="historyOpened = historyOpened || ($event.target as HTMLDetailsElement).open">
          <summary class="cursor-pointer text-xs text-stone-300 marker:text-stone-200 hover:text-stone-100">資產走勢與大盤比較</summary>
          <MarketAssetHistory v-if="historyOpened" class="mt-3" />
        </details>

        <!-- ── 重大訊息（台股）── -->
        <details v-if="hasTwStock" class="border-2 border-white/10 bg-white/[0.03] px-3 py-2">
          <summary class="cursor-pointer text-xs text-stone-300 marker:text-stone-200 hover:text-stone-100">
            重大訊息<span v-if="newsStatus === 'ready'" class="ml-1 text-stone-500">（最近 30 天 {{ news.length }} 則）</span>
          </summary>
          <div class="mt-2">
            <div v-if="newsStatus === 'loading' || newsStatus === 'idle'" class="space-y-1.5">
              <SkeletonBlock v-for="n in 4" :key="n" class="h-4 w-full rounded-none" />
            </div>
            <div v-else-if="newsStatus === 'error'" class="flex flex-wrap items-center gap-3 text-xs text-rose-200">
              <span>重大訊息暫時讀不到。</span>
              <button type="button" class="cursor-pointer border border-rose-200/30 px-2 py-0.5 text-[11px]" @click="loadNews">重試</button>
            </div>
            <p v-else-if="!news.length" class="text-xs text-stone-400">追蹤的公司最近 30 天沒有重大訊息。</p>
            <MarketNewsList v-else :news="news" show-company />
            <p class="mt-2 text-[11px] leading-5 text-stone-500">資料來自公開資訊觀測站（每 30 分鐘更新），保留 30 天。說明是公司原文。</p>
          </div>
        </details>

        <!-- ── 除權息與營收一覽（台股）── -->
        <details v-if="hasTwStock" class="border-2 border-white/10 bg-white/[0.03] px-3 py-2">
          <summary class="cursor-pointer text-xs text-stone-300 marker:text-stone-200 hover:text-stone-100">除權息與營收一覽</summary>
          <MarketEventsCalendar class="mt-3" :items="items" :revenue-deadline="revenueDeadline" />
        </details>

        <!-- ── 自選清單 ── -->
        <div class="space-y-2">
          <div class="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" role="tablist" aria-label="自選清單">
            <button
              v-for="option in [{ id: 'all', name: '全部' }, ...groups, { id: 'none', name: '未分類' }]"
              :key="option.id"
              type="button"
              role="tab"
              :aria-selected="groupFilter === option.id"
              class="shrink-0 cursor-pointer whitespace-nowrap border px-2.5 py-1 text-[12px] transition"
              :class="groupFilter === option.id ? 'border-amber-200/50 bg-amber-200/15 text-amber-50' : 'border-white/10 text-stone-300 hover:bg-white/10'"
              @click="groupFilter = option.id"
            >
              {{ option.name }}（{{ groupCount(option.id) }}）
            </button>
          </div>
          <details class="text-xs">
            <summary class="cursor-pointer text-stone-400 marker:text-stone-300 hover:text-stone-200">管理清單</summary>
            <MarketGroupManager class="mt-2" :groups="groups" @changed="onGroupsChanged" @removed="onGroupRemoved" />
          </details>
        </div>

        <!-- ── 篩選與排序 ── -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex gap-2">
            <button
              v-for="option in (['all', 'tw', 'us'] as const)"
              :key="option"
              type="button"
              class="cursor-pointer border-2 px-3 py-1 text-[12px] transition font-pixel"
              :class="marketFilter === option ? 'border-amber-200/40 bg-amber-200/15 text-amber-50' : 'border-white/15 text-stone-300 hover:bg-white/10'"
              @click="marketFilter = option"
            >
              {{ option === 'all' ? '全部' : MARKET_LABELS[option] }}（{{ counts[option] }}）
            </button>
          </div>
          <div class="flex flex-wrap gap-1 text-[11px]">
            <span class="self-center text-stone-500">排序</span>
            <button
              v-for="option in SORT_OPTIONS"
              :key="option.value"
              type="button"
              class="cursor-pointer border px-2 py-0.5 transition"
              :class="sortKey === option.value ? 'border-amber-200/40 text-amber-100' : 'border-white/10 text-stone-400 hover:bg-white/10'"
              @click="sortKey = option.value"
            >
              {{ option.label }}
            </button>
            <button
              v-if="sortKey === 'added'"
              type="button"
              class="cursor-pointer border px-2 py-0.5 transition"
              :class="sortMode ? 'border-sky-300/50 bg-sky-300/10 text-sky-100' : 'border-white/10 text-stone-400 hover:bg-white/10'"
              :aria-pressed="sortMode"
              @click="sortMode = !sortMode"
            >
              {{ sortMode ? '完成排序' : '調整順序' }}
            </button>
          </div>
        </div>
        <p v-if="sortMode" class="text-[11px] text-sky-200/80">
          排序模式：桌機可以直接拖曳，手機用 ↑ ↓。只調整目前畫面上的這些股票{{ savingOrder ? '（儲存中…）' : '' }}。
        </p>

        <p v-if="asOf" class="text-[11px] text-stone-500">報價更新於 {{ timeText(asOf) }}</p>

        <p v-if="visibleItems.length === 0" class="text-sm text-stone-300/80">這個分類還沒有股票。</p>

        <!-- ── 清單 ── -->
        <ul class="space-y-3">
          <li
            v-for="(item, index) in visibleItems"
            :key="item.id"
            class="border-2 bg-white/[0.03]"
            :class="dragId === item.id ? 'border-sky-300/50 opacity-60' : 'border-white/10'"
            :draggable="sortMode"
            @dragstart="dragId = item.id"
            @dragend="dragId = ''"
            @dragover.prevent
            @drop.prevent="dropOn(item.id)"
          >
            <!-- 排序模式：精簡一列＋上移下移 -->
            <div v-if="sortMode" class="flex cursor-grab items-center gap-2 px-3 py-2 text-sm active:cursor-grabbing">
              <span class="shrink-0 select-none text-stone-500" aria-hidden="true">⋮⋮</span>
              <span class="min-w-0 flex-1 truncate text-stone-100">
                {{ item.summary?.name || item.target.name }}
                <span class="text-xs tabular-nums text-stone-500">{{ idOf(item.target) }}</span>
              </span>
              <button type="button" class="cursor-pointer border border-white/15 px-2 py-0.5 text-xs text-stone-300 hover:bg-white/10 disabled:opacity-30" :disabled="index === 0" :aria-label="`把${item.target.name}往上移`" @click="moveBy(item.id, -1)">↑</button>
              <button type="button" class="cursor-pointer border border-white/15 px-2 py-0.5 text-xs text-stone-300 hover:bg-white/10 disabled:opacity-30" :disabled="index === visibleItems.length - 1" :aria-label="`把${item.target.name}往下移`" @click="moveBy(item.id, 1)">↓</button>
            </div>

            <!-- 收合時：一行（名稱、現價、今日漲跌、持股損益） -->
            <button
              v-else-if="!expandedIds.has(item.id)"
              type="button"
              class="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-white/5 sm:gap-3 sm:px-4"
              :aria-expanded="false"
              @click="toggleExpanded(item.id)"
            >
              <span class="w-3 shrink-0 text-stone-200">›</span>
              <span class="min-w-0 flex-1 truncate">
                <span class="font-semibold text-stone-50">{{ item.summary?.name || item.target.name }}</span>
                <span class="ml-1.5 text-xs tabular-nums text-stone-500">{{ idOf(item.target) }}</span>
                <span v-if="marketFilter === 'all'" class="ml-1.5 text-[10px] text-stone-500">{{ MARKET_LABELS[item.target.market] }}</span>
                <span v-if="groupFilter === 'all' && item.group" class="ml-1.5 text-[10px] text-sky-200/70">{{ groupName(item.group) }}</span>
              </span>
              <template v-if="item.summary">
                <span class="shrink-0 tabular-nums text-stone-100">{{ formatNumber(item.summary.quote.price) }}</span>
                <span class="w-16 shrink-0 text-right text-xs tabular-nums" :class="trendClass(item.summary.quote.change)">
                  {{ formatSigned(item.summary.quote.changePct, '%') }}
                </span>
              </template>
              <span v-else class="shrink-0 text-xs text-stone-500">無報價</span>
              <span v-if="hasRecentNews(item)" class="shrink-0 border border-sky-300/40 px-1.5 text-[10px] text-sky-100">重訊</span>
              <span v-if="exSoon(item)" class="hidden shrink-0 border border-amber-200/40 px-1.5 text-[10px] text-amber-100 md:inline">
                除{{ exSoon(item)!.type }} {{ shortDate(exSoon(item)!.date) }}
              </span>
              <span
                v-if="item.summary?.chipsTag"
                class="hidden shrink-0 border px-1.5 text-[10px] md:inline"
                :class="TONE_STYLES[item.summary.chipsTag.tone]"
              >
                {{ item.summary.chipsTag.text }}
              </span>
              <span
                v-if="holdingPnl(item) !== null"
                class="hidden w-24 shrink-0 text-right text-xs tabular-nums sm:inline"
                :class="trendClass(holdingPnl(item))"
                title="未實現損益"
              >
                {{ formatSigned(Math.round(holdingPnl(item)!)) }}
              </span>
            </button>

            <div v-else class="p-3 sm:p-4">
            <div
              class="-m-1 flex cursor-pointer flex-wrap items-start justify-between gap-x-4 gap-y-2 p-1 hover:bg-white/[0.03]"
              role="button"
              tabindex="0"
              :aria-expanded="true"
              title="點一下收合"
              @click="toggleExpanded(item.id)"
              @keydown.enter.prevent="toggleExpanded(item.id)"
              @keydown.space.prevent="toggleExpanded(item.id)"
            >
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2">
                  <span class="w-3 rotate-90 text-stone-200">›</span>
                  <span class="font-semibold text-stone-50">{{ item.summary?.name || item.target.name }}</span>
                  <span class="text-xs tabular-nums text-stone-500">{{ idOf(item.target) }}</span>
                  <span class="border border-white/15 px-1.5 text-[10px] text-stone-400">{{ MARKET_LABELS[item.target.market] }}</span>
                  <span v-if="item.target.kind === 'index'" class="border border-amber-200/30 px-1.5 text-[10px] text-amber-100/80">指數</span>
                  <span v-if="item.summary?.session === 'intraday'" class="border border-rose-300/30 px-1.5 text-[10px] text-rose-200">盤中</span>
                </p>
                <p v-if="item.summary" class="mt-1 flex flex-wrap items-baseline gap-x-3">
                  <span class="text-2xl font-semibold tabular-nums text-stone-50">{{ formatNumber(item.summary.quote.price) }}</span>
                  <span class="text-sm tabular-nums" :class="trendClass(item.summary.quote.change)">
                    {{ formatSigned(item.summary.quote.change) }}（{{ formatSigned(item.summary.quote.changePct, '%') }}）
                  </span>
                  <span class="text-[11px] text-stone-500">{{ item.summary.quote.date }}</span>
                </p>
                <p v-else class="mt-1 text-sm text-stone-400">報價暫時取不到，稍後再更新。</p>
              </div>
              <div v-if="item.summary?.spark.length" class="w-32 shrink-0 sm:w-40">
                <MarketSparkline :values="item.summary.spark" />
                <p class="text-right text-[10px] text-stone-500">近 {{ item.summary.spark.length }} 個交易日</p>
              </div>
            </div>

            <template v-if="item.summary">
              <!-- 區間漲跌與 52 週位置 -->
              <div class="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div v-if="item.summary.changes" class="flex gap-4 tabular-nums">
                  <span class="text-stone-400">5 日 <span :class="trendClass(item.summary.changes.d5)">{{ formatSigned(item.summary.changes.d5, '%') }}</span></span>
                  <span class="text-stone-400">20 日 <span :class="trendClass(item.summary.changes.d20)">{{ formatSigned(item.summary.changes.d20, '%') }}</span></span>
                  <span class="text-stone-400">60 日 <span :class="trendClass(item.summary.changes.d60)">{{ formatSigned(item.summary.changes.d60, '%') }}</span></span>
                </div>
                <div v-if="item.summary.range52w" class="min-w-0">
                  <div class="flex justify-between text-[11px] tabular-nums text-stone-500">
                    <span>52 週低 {{ formatNumber(item.summary.range52w.low) }}</span>
                    <span>距高點 {{ formatSigned(item.summary.range52w.fromHigh, '%') }}</span>
                    <span>高 {{ formatNumber(item.summary.range52w.high) }}</span>
                  </div>
                  <div class="relative mt-1 h-1.5 bg-white/10">
                    <div
                      class="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 bg-amber-200"
                      :style="{ left: `${item.summary.range52w.position ?? 50}%` }"
                    />
                  </div>
                </div>
              </div>

              <!-- 技術判讀（文字來自後端） -->
              <div v-if="item.summary.signals.length" class="mt-3 flex flex-wrap gap-1.5">
                <span
                  v-for="signal in item.summary.signals"
                  :key="signal.key"
                  class="border px-2 py-0.5 text-[11px]"
                  :class="TONE_STYLES[signal.tone]"
                >
                  {{ signal.label }} {{ signal.value }}
                </span>
              </div>

              <p v-if="item.summary.supports.length || item.summary.resistances.length" class="mt-2 text-[11px] leading-5 text-stone-400">
                <template v-if="item.summary.supports[0]">
                  支撐 <span class="tabular-nums text-emerald-200">{{ formatNumber(item.summary.supports[0].price) }}</span>（{{ item.summary.supports[0].label }}）
                </template>
                <template v-if="item.summary.resistances[0]">
                  <span v-if="item.summary.supports[0]" class="mx-1 text-stone-600">／</span>
                  壓力 <span class="tabular-nums text-rose-200">{{ formatNumber(item.summary.resistances[0].price) }}</span>（{{ item.summary.resistances[0].label }}）
                </template>
              </p>

              <!-- 除權息與月營收（台股個股；資料來自證交所、櫃買中心） -->
              <div v-if="item.summary.events?.exDividend || item.summary.events?.revenue" class="mt-2 space-y-0.5 text-[11px] leading-5 tabular-nums text-stone-400">
                <p v-if="item.summary.events.exDividend">
                  <span class="text-amber-100">{{ item.summary.events.exDividend.date }} 除{{ item.summary.events.exDividend.type }}</span>
                  <template v-if="item.summary.events.exDividend.cashDividend">，每股現金 {{ formatNumber(item.summary.events.exDividend.cashDividend, 4) }} 元</template>
                  <template v-if="item.summary.events.exDividend.stockRatio">，配股 {{ formatNumber(item.summary.events.exDividend.stockRatio * 1000, 2) }} 股／張</template>
                </p>
                <p v-if="item.summary.events.revenue">
                  {{ monthText(item.summary.events.revenue.month) }}營收 年增
                  <span :class="trendClass(item.summary.events.revenue.yoy)">{{ formatSigned(item.summary.events.revenue.yoy, '%') }}</span>
                  ・月增 <span :class="trendClass(item.summary.events.revenue.mom)">{{ formatSigned(item.summary.events.revenue.mom, '%') }}</span>
                  ・累計年增 <span :class="trendClass(item.summary.events.revenue.cumYoy)">{{ formatSigned(item.summary.events.revenue.cumYoy, '%') }}</span>
                  <span v-if="item.summary.events.revenue.note" class="block text-stone-500">{{ item.summary.events.revenue.note }}</span>
                </p>
              </div>
            </template>

            <!-- 重大訊息：最近 3 則 -->
            <div v-if="newsOf(item).length" class="mt-3 border-t border-white/10 pt-2">
              <p class="text-xs text-stone-300">重大訊息<span class="ml-1 text-stone-500">（最近 30 天 {{ newsOf(item).length }} 則）</span></p>
              <MarketNewsList class="mt-1" :news="newsOf(item).slice(0, 3)" />
            </div>

            <!-- K 線與籌碼：點開才載入 -->
            <details v-if="item.summary" class="mt-3 border-t border-white/10 pt-2" @toggle="onDetailToggle(item.id, $event)">
              <summary class="cursor-pointer text-xs text-stone-300 marker:text-stone-200 hover:text-stone-100">
                走勢圖{{ item.target.market === 'tw' && item.target.kind === 'stock' ? '與籌碼' : '' }}
                <span v-if="item.summary.chipsTag" class="ml-1 border px-1.5 text-[10px]" :class="TONE_STYLES[item.summary.chipsTag.tone]">{{ item.summary.chipsTag.text }}</span>
              </summary>
              <MarketWatchDetail v-if="detailOpened.has(item.id)" class="mt-3" :watch-id="item.id" :market="item.target.market" />
            </details>

            <!-- 持股：買賣、股利、損益（編輯也在裡面） -->
            <MarketHoldings
              class="mt-3"
              :item="item"
              :editing="editingId === item.id"
              @update:editing="(value: boolean) => (editingId = value ? item.id : '')"
              @saved="onSaved"
            />

            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-if="item.target.kind === 'stock' && editingId !== item.id"
                type="button"
                class="cursor-pointer border-2 border-white/15 px-2 py-0.5 text-[11px] text-stone-300 transition hover:bg-white/10 font-pixel"
                @click="editingId = item.id"
              >
                {{ item.trades.length || item.dividends.length ? '編輯持股' : '記錄持股' }}
              </button>
              <button
                type="button"
                class="cursor-pointer border-2 border-amber-200/40 bg-amber-200/10 px-2 py-0.5 text-[11px] text-amber-50 transition hover:bg-amber-200/20 font-pixel"
                title="帶入這檔股票，用「股市諮詢」與「投資決策」牌陣占卜"
                @click="quickReading(item)"
              >
                快速占卜
              </button>
              <button
                type="button"
                class="cursor-pointer border-2 border-white/15 px-2 py-0.5 text-[11px] text-stone-300 transition hover:bg-white/10 font-pixel"
                @click="emit('alert', item.target, item.summary?.quote.price ?? null)"
              >
                設價位提醒
              </button>
              <details v-if="groups.length" class="relative">
                <summary class="cursor-pointer list-none border-2 border-white/15 px-2 py-0.5 text-[11px] text-stone-300 transition hover:bg-white/10 font-pixel [&::-webkit-details-marker]:hidden">
                  移到清單（{{ groupName(item.group) }}）
                </summary>
                <div class="absolute left-0 top-full z-20 mt-1 flex min-w-[9rem] flex-col border-2 border-white/15 bg-[#0f1526] py-1 shadow-xl shadow-black/40">
                  <button
                    v-for="option in [...groups, { id: null, name: '未分類', order: 0 }]"
                    :key="option.id ?? 'none'"
                    type="button"
                    class="cursor-pointer px-3 py-1.5 text-left text-xs transition hover:bg-white/10 disabled:opacity-40"
                    :class="(item.group ?? null) === option.id ? 'text-amber-100' : 'text-stone-300'"
                    :disabled="moving === item.id || (item.group ?? null) === option.id"
                    @click="moveToGroup(item, option.id)"
                  >
                    {{ option.name }}
                  </button>
                </div>
              </details>
              <button
                type="button"
                class="cursor-pointer border-2 border-white/15 px-2 py-0.5 text-[11px] text-stone-400 transition hover:bg-white/10 disabled:opacity-60 font-pixel"
                :disabled="removing === item.id"
                @click="remove(item)"
              >
                移除
              </button>
            </div>
            </div>
          </li>
        </ul>

        <p class="text-[11px] leading-5 text-stone-500">
          損益只用目前報價計算，不含手續費與交易稅；台股報價來自證交所（約延遲 20 秒），美股來自 Yahoo（可能延遲約 15 分鐘）。
        </p>
      </template>
    </template>
  </section>
</template>
