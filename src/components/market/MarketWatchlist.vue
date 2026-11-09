<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { confirmDialog } from '../../lib/confirm'
import HelpTip from '../HelpTip.vue'
import { signalGlossaryKeys } from '../../lib/marketGlossary'

import { createWatch, createWatchGroup, deleteWatch, fetchMarketNews, fetchWatchlist, reorderWatchlist, saveMarketSettings, setWatchGroups } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { holdingTotals } from '../../lib/marketHoldings'
import { useCooldown } from '../../lib/useCooldown'
import RefreshButton from '../RefreshButton.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import MarketAssetHistory from './MarketAssetHistory.vue'
import MarketHoldingPie from './MarketHoldingPie.vue'
import MarketHoldings from './MarketHoldings.vue'
import MarketSparkline from './MarketSparkline.vue'
import MarketWatchDetail from './MarketWatchDetail.vue'
import MarketEventsCalendar from './MarketEventsCalendar.vue'
import MarketGroupManager from './MarketGroupManager.vue'
import MarketNewsList from './MarketNewsList.vue'
import StockAnalysisDialog from './StockAnalysisDialog.vue'
import StockSearchInput from './StockSearchInput.vue'
import DashboardWatchList from './DashboardWatchList.vue'
import WatchItemDialog from './WatchItemDialog.vue'
import SelectField from '../SelectField.vue'
import EditToggleButton from '../EditToggleButton.vue'
import type { MarketAlertTarget, MarketFees, MarketSearchResult, MarketSignal, MarketNewsItem, MarketTrade, MarketWatchGroup, MarketWatchItem } from '../../types'

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
const refreshCooldown = useCooldown(30, 'watchlist-refresh')
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
// 新增表單的成功提示：已經在追蹤的股票，這次只是加進另一個清單
const formNotice = ref('')
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
  formNotice.value = ''
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
  // 加到哪個清單：選「新清單」就先建立
  let group: string | null = addTarget.value === NEW_GROUP ? null : addTarget.value || null
  if (addTarget.value === NEW_GROUP) {
    const name = newGroupName.value.trim()
    if (!name) {
      formError.value = '請輸入新清單的名稱。'
      return
    }
    if (name.length > 20) {
      formError.value = '清單名稱最多 20 個字。'
      return
    }
    if (groups.value.some((g) => g.name === name)) {
      formError.value = `已經有「${name}」這個清單了，直接選它就好。`
      return
    }
  }
  adding.value = true
  try {
    if (addTarget.value === NEW_GROUP) {
      const created = await createWatchGroup(newGroupName.value.trim())
      groups.value = [...groups.value, created.group]
      group = created.group.id
      // 清單已經建好：之後就算加股票失敗，重試也不會再建一次
      addTarget.value = created.group.id
      newGroupName.value = ''
    }
    const { item, existing, tradesIgnored } = await createWatch({
      market: form.value.market,
      query,
      target: picked.value ?? undefined,
      trades: parsed.trade ? [parsed.trade] : [],
      group,
    })
    if (existing) {
      // 已經在追蹤：後端把清單加上去了，換掉原本那一筆
      items.value = items.value.map((it) => (it.id === item.id ? item : it))
      const name = item.summary?.name || item.target.name
      formNotice.value =
        `${name} 已經在追蹤，這次加到「${groupName(group)}」清單。` +
        (tradesIgnored ? '持股沒有變動；要記這筆買進，請展開這檔，在持股那一區記錄。' : '')
    } else {
      items.value = [...items.value, item]
    }
    form.value = { ...form.value, query: '', quantity: '', cost: '' }
    picked.value = null
    // 正在看別的清單時切到剛加入的那個清單，免得看起來像沒加成功
    if (groupFilter.value !== 'all' && groupFilter.value !== (group ?? 'none')) groupFilter.value = group ?? 'none'
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

// ---- 個股分析彈窗 ----
const analysisFor = ref<{ id: string; name: string } | null>(null)
function openAnalysis(item: MarketWatchItem) {
  analysisFor.value = { id: item.id, name: item.summary?.name || item.target.name }
}

// ---- 清單呈現：和股市總覽的自選清單一樣，卡片或表格（使用者決定，2026-11-09）----
// 選擇記在這台瀏覽器（只是顯示偏好）；讀寫不了（無痕、被封鎖）就用卡片
const VIEW_KEY = 'market-watchlist-view'
function readView(): 'card' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'card'
  } catch {
    return 'card'
  }
}
const listView = ref<'card' | 'table'>(readView())
function toggleListView() {
  listView.value = listView.value === 'table' ? 'card' : 'table'
  try {
    localStorage.setItem(VIEW_KEY, listView.value)
  } catch {
    // 存不了就只在這次有效
  }
}

// ---- 詳細彈窗：卡片／表格點一檔就開，內容是原本展開後的全部（摘要、走勢籌碼、持股編輯、清單、提醒、移除）----
// 存 id、從清單找：更新報價時彈窗跟著換新資料；移除後找不到就自動關閉
const selectedId = ref('')
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
function closeSelected() {
  selectedId.value = ''
  if (editingId.value) editingId.value = ''
}

// ---- 移除 ----
const removing = ref('')
async function remove(item: MarketWatchItem) {
  const extra = item.trades.length || item.dividends.length ? '（買賣與股利紀錄也會一起刪除）' : ''
  const ok = await confirmDialog({
    title: '移除追蹤',
    message: `確定要移除 ${item.target.name} 嗎？${extra}`,
    confirmText: '移除',
    danger: true,
  })
  if (!ok) return
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
// 每檔的損益由後端算好（item.position）；加總和股市總覽的「我的持股總覽」共用 holdingTotals
const totals = computed(() => holdingTotals(items.value))

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
// 「管理清單」面板開著沒
const managingGroups = ref(false)
// 新增股票時放進哪個清單：正在看某個清單就放那裡，否則未分類
const addGroup = computed(() => (groupFilter.value === 'all' || groupFilter.value === 'none' ? null : groupFilter.value))
const groupName = (id: string | null | undefined) => groups.value.find((g) => g.id === id)?.name ?? '未分類'

// 新增表單的「加到清單」：預設是目前所在的清單分頁；''＝未分類，NEW_GROUP＝當場建立新清單
const NEW_GROUP = '__new__'
const MAX_GROUPS = 10
const addTarget = ref('')
// 「加到清單」的選項：未分類、既有清單、還沒滿就可以當場建立新清單
const addTargetOptions = computed(() => [
  { value: '', label: '未分類' },
  ...groups.value.map((group) => ({ value: group.id, label: group.name })),
  ...(groups.value.length < MAX_GROUPS ? [{ value: NEW_GROUP, label: '＋ 新清單…' }] : []),
])
const newGroupName = ref('')
watch(addGroup, (id) => {
  if (addTarget.value !== NEW_GROUP) addTarget.value = id ?? ''
}, { immediate: true })
// 這一檔所在的清單（一檔可以放進好幾個）；舊版後端只有單一的 group
const groupIdsOf = (item: MarketWatchItem) => item.groups ?? (item.group ? [item.group] : [])
// 清單分頁的篩選：all 全部、none 一個清單都不在、其他是「有放進這個清單」
const inGroupTab = (item: MarketWatchItem, id: string) =>
  id === 'all' ? true : id === 'none' ? groupIdsOf(item).length === 0 : groupIdsOf(item).includes(id)
const groupCount = (id: string) => items.value.filter((item) => inGroupTab(item, id)).length

function onGroupsChanged(next: MarketWatchGroup[]) {
  groups.value = next
}
function onGroupRemoved(id: string) {
  items.value = items.value.map((item) => {
    const ids = groupIdsOf(item)
    if (!ids.includes(id)) return item
    const rest = ids.filter((g) => g !== id)
    return { ...item, groups: rest, group: rest[0] ?? null }
  })
  if (groupFilter.value === id) groupFilter.value = 'all'
  if (addTarget.value === id) addTarget.value = ''
}

const moving = ref('')
// 「移到清單」下拉選單（<details data-dropdown>）：選了就關；點選單外面、按 Esc 也關
function closeDropdowns(except: Element | null = null) {
  for (const el of document.querySelectorAll('details[data-dropdown][open]')) {
    if (el !== except) el.removeAttribute('open')
  }
}
function onDocumentClick(event: MouseEvent) {
  const inside = event.target instanceof Element ? event.target.closest('details[data-dropdown]') : null
  closeDropdowns(inside)
}
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDropdowns()
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})

// 勾選／取消某個清單（一檔可以放進好幾個）；選單維持打開，方便連續勾。順序照清單本身的順序
async function toggleGroup(item: MarketWatchItem, id: string) {
  const current = groupIdsOf(item)
  const wanted = current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
  const next = groups.value.map((g) => g.id).filter((g) => wanted.includes(g))
  moving.value = item.id
  try {
    await setWatchGroups(item.id, next)
    items.value = items.value.map((it) => (it.id === item.id ? { ...it, groups: next, group: next[0] ?? null } : it))
  } catch (err) {
    error.value = err instanceof Error ? err.message : '清單更新失敗'
  } finally {
    moving.value = ''
  }
}
const groupNamesOf = (item: MarketWatchItem) => groupIdsOf(item).map((id) => groupName(id)).join('、')

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
const sortKey = ref<'added' | 'change' | 'pnl'>('added')
// 換成其他排序時離開排序模式
watch(sortKey, (key) => {
  if (key !== 'added') sortMode.value = false
})
const SORT_OPTIONS = [
  { value: 'added', label: '自訂順序' },
  { value: 'change', label: '今日漲跌' },
  { value: 'pnl', label: '持股損益' },
] as const

// 市場的計數只算目前選的清單（市場是清單底下的篩選）
const inGroup = computed(() =>
  items.value.filter((item) => inGroupTab(item, groupFilter.value)),
)
const counts = computed(() => ({
  all: inGroup.value.length,
  tw: inGroup.value.filter((i) => i.target.market === 'tw').length,
  us: inGroup.value.filter((i) => i.target.market === 'us').length,
}))

const visibleItems = computed(() => {
  const list = items.value.filter(
    (item) =>
      (marketFilter.value === 'all' || item.target.market === marketFilter.value) &&
      inGroupTab(item, groupFilter.value),
  )
  if (sortKey.value === 'added') return list
  // 沒有數值的排最後
  const valueOf = (item: MarketWatchItem): number | null => {
    if (sortKey.value === 'change') return item.summary?.quote.changePct ?? null
    return item.position?.unrealizedPct ?? null
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
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

const TONE_STYLES: Record<MarketSignal['tone'], string> = {
  bull: 'border-up-hue/30 bg-up-hue/10 text-up-ink',
  bear: 'border-down-hue/30 bg-down-hue/10 text-down-ink',
  warn: 'border-accent-hue/30 bg-accent-hue/10 text-accent',
  neutral: 'border-tint/15 bg-tint/5 text-ink-soft',
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
  'min-w-0 border-2 border-tint/10 bg-tint/5 px-3 py-2 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40'
</script>

<template>
  <section class="space-y-5 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Watchlist</p>
        <h2 class="mt-1 text-title font-semibold text-ink">自訂股票追蹤</h2>
        <p class="mt-1 text-body text-ink-muted">
          加入想觀察的台股或美股，可以另外記下持股（台股以「張」計，零股可填小數；美股以「股」計）。頁面開著時每分鐘更新報價。
        </p>
      </div>
      <RefreshButton
        label="更新報價"
        :loading="refreshing"
        :disabled="status === 'loading'"
        :failed="!!error"
        :cooldown="refreshCooldown"
        @click="manualRefresh"
      />
    </div>

    <!-- ── 新增 ── -->
    <form class="space-y-2 border-2 border-tint/10 bg-tint/[0.03] p-3" @submit.prevent="submit">
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
          class="shrink-0 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-4 py-2 text-button text-accent transition hover:bg-accent-hue/25 disabled:opacity-60 font-pixel"
          :disabled="adding"
        >
          {{ adding ? '加入中…' : '加入追蹤' }}
        </button>
      </div>
      <!-- 加到哪個清單：可以選既有清單，或當場建立新清單 -->
      <div class="flex flex-wrap items-center gap-2">
        <span class="shrink-0 text-caption text-ink-muted" aria-hidden="true">加到清單</span>
        <SelectField v-model="addTarget" :options="addTargetOptions" label="加到清單" variant="pixel" hide-label class="min-w-0 flex-[1_1_9rem]" />
        <input
          v-if="addTarget === NEW_GROUP"
          v-model="newGroupName"
          maxlength="20"
          :class="INPUT_CLASS"
          class="flex-[2_1_12rem]"
          placeholder="新清單名稱（例如 長期存股）"
          aria-label="新清單名稱"
        />
      </div>
      <p v-if="formError" class="text-body text-danger">{{ formError }}</p>
      <p v-else-if="formNotice" class="text-body text-ok-hue">{{ formNotice }}</p>
    </form>

    <!-- 交易成本：損益會扣掉手續費與證交稅，券商有折扣的話在這裡設定 -->
    <details class="border-2 border-tint/10 bg-tint/[0.03] px-3 py-2">
      <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">交易成本設定</summary>
      <div class="mt-3 space-y-2 text-body">
        <p class="leading-5 text-ink-muted">
          台股手續費 0.1425% × 折扣（2.8 折填 0.28），單筆有最低金額；證交稅股票 0.3%、ETF 0.1%（賣出時收，不用設定）。美股以每筆固定手續費計。
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex min-w-0 flex-[1_1_7rem] flex-col gap-1">
            <span class="text-ink-muted">台股手續費折扣</span>
            <input v-model="feeForm.twDiscount" inputmode="decimal" :class="INPUT_CLASS" />
          </label>
          <label class="flex min-w-0 flex-[1_1_7rem] flex-col gap-1">
            <span class="text-ink-muted">台股最低手續費（元）</span>
            <input v-model="feeForm.twMinFee" inputmode="decimal" :class="INPUT_CLASS" />
          </label>
          <label class="flex min-w-0 flex-[1_1_7rem] flex-col gap-1">
            <span class="text-ink-muted">美股每筆手續費（美元）</span>
            <input v-model="feeForm.usFee" inputmode="decimal" :class="INPUT_CLASS" />
          </label>
          <button
            type="button"
            class="shrink-0 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-3 py-2 text-button text-accent transition hover:bg-accent-hue/25 disabled:opacity-60 font-pixel"
            :disabled="feeSaving"
            @click="saveFees"
          >
            {{ feeSaving ? '儲存中…' : '儲存設定' }}
          </button>
        </div>
        <p v-if="feeError" class="text-danger">{{ feeError }}</p>
        <p v-else-if="feeSaved" class="text-down-ink">已儲存，損益已用新設定重算。</p>
      </div>
    </details>

    <!-- 骨架對應載入後的版面：持股總覽卡（含圓餅圖）、篩選與排序列、收合時一行一檔的清單 -->
    <div v-if="status === 'loading'" class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-2 border-2 border-tint/10 p-3">
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
      <!-- 第一層清單分頁（底線）、第二層市場與排序 -->
      <div class="flex items-end gap-2 border-b-2 border-tint/10 pb-1.5">
        <SkeletonBlock class="h-3 w-6 rounded-none" />
        <SkeletonBlock v-for="n in 3" :key="n" class="h-6 w-16 rounded-none" />
        <SkeletonBlock class="ml-auto h-5 w-16 rounded-none" />
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SkeletonBlock class="h-5 w-44 rounded-none" />
        <SkeletonBlock class="h-5 w-64 rounded-none" />
      </div>
      <ul class="space-y-3">
        <li v-for="n in 4" :key="n" class="flex items-center gap-3 border-2 border-tint/10 px-3 py-3">
          <!-- 欄寬和收合的一行相同：名稱、現價、漲跌、標籤、損益 -->
          <SkeletonBlock class="h-4 flex-1 rounded-none" />
          <SkeletonBlock class="h-4 w-20 shrink-0 rounded-none" />
          <SkeletonBlock class="h-4 w-16 shrink-0 rounded-none" />
          <SkeletonBlock class="h-4 w-9 shrink-0 rounded-none md:w-52" />
          <SkeletonBlock class="hidden h-4 w-24 shrink-0 rounded-none sm:block" />
        </li>
      </ul>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-3 py-1 text-button font-pixel" @click="load()">重試</button>
    </div>

    <template v-else>
      <p v-if="error" class="text-body text-danger">{{ error }}</p>

      <p v-if="items.length === 0" class="text-body text-ink-muted">還沒有追蹤任何股票，從上面輸入代號或名稱加入。</p>

      <template v-else>
        <!-- ── 持股總覽（依幣別分開）── -->
        <div v-if="totals.length" class="grid gap-3 sm:grid-cols-2">
          <div v-for="total in totals" :key="total.market" class="border-2 border-accent-hue/20 bg-accent-hue/5 p-3">
            <p class="text-body text-accent">{{ MARKET_LABELS[total.market] }}持股（{{ total.count }} 檔，{{ total.currency }}）</p>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p class="text-display font-semibold tabular-nums text-ink">{{ money(total.value) }}</p>
              <p class="text-body tabular-nums" :class="trendClass(total.pnl)">
                {{ formatSigned(Math.round(total.pnl)) }}（{{ formatSigned(total.pnlPct, '%') }}）
              </p>
            </div>
            <p class="mt-1 text-caption tabular-nums text-ink-muted">
              成本 {{ money(total.cost) }}
              <template v-if="total.today !== null">
                ・今日 <span :class="trendClass(total.today)">{{ formatSigned(Math.round(total.today)) }}</span>
              </template>
            </p>
            <p v-if="total.realized || total.dividends" class="mt-0.5 text-caption tabular-nums text-ink-muted">
              已實現 <span :class="trendClass(total.realized)">{{ formatSigned(Math.round(total.realized)) }}</span>
              ・股利 <span class="text-accent">{{ money(total.dividends) }}</span>
            </p>
            <MarketHoldingPie v-if="total.cost > 0" class="mt-3" :cost="total.cost" :pnl="total.pnl" :currency="total.currency" />
          </div>
        </div>

        <!-- ── 資產走勢：展開時才載入 ── -->
        <details v-if="totals.length" class="border-2 border-tint/10 bg-tint/[0.03] px-3 py-2" @toggle="historyOpened = historyOpened || ($event.target as HTMLDetailsElement).open">
          <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">資產走勢與大盤比較</summary>
          <MarketAssetHistory v-if="historyOpened" class="mt-3" />
        </details>

        <!-- ── 重大訊息（台股）── -->
        <details v-if="hasTwStock" class="border-2 border-tint/10 bg-tint/[0.03] px-3 py-2">
          <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">
            重大訊息<span v-if="newsStatus === 'ready'" class="ml-1 text-ink-muted">（最近 30 天 {{ news.length }} 則）</span>
          </summary>
          <div class="mt-2">
            <div v-if="newsStatus === 'loading' || newsStatus === 'idle'" class="space-y-1.5">
              <SkeletonBlock v-for="n in 4" :key="n" class="h-4 w-full rounded-none" />
            </div>
            <div v-else-if="newsStatus === 'error'" class="flex flex-wrap items-center gap-3 text-body text-danger">
              <span>重大訊息暫時讀不到。</span>
              <button type="button" class="cursor-pointer border border-danger-hue/30 px-2 py-0.5 text-button" @click="loadNews">重試</button>
            </div>
            <p v-else-if="!news.length" class="text-body text-ink-muted">追蹤的公司最近 30 天沒有重大訊息。</p>
            <MarketNewsList v-else :news="news" show-company />
            <p class="mt-2 text-caption text-ink-muted">資料來自公開資訊觀測站（每 30 分鐘更新），保留 30 天。說明是公司原文。</p>
          </div>
        </details>

        <!-- ── 除權息與營收一覽（台股）── -->
        <details v-if="hasTwStock" class="border-2 border-tint/10 bg-tint/[0.03] px-3 py-2">
          <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">除權息與營收一覽</summary>
          <MarketEventsCalendar class="mt-3" :items="items" :revenue-deadline="revenueDeadline" />
        </details>

        <!-- ── 第一層：自選清單（分頁）。右邊是管理清單 ── -->
        <div>
          <div class="flex items-end gap-2 border-b-2 border-tint/10">
            <span class="shrink-0 pb-2 text-caption text-ink-muted">清單</span>
            <div class="-mb-[2px] flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]" role="tablist" aria-label="自選清單">
              <button
                v-for="option in [{ id: 'all', name: '全部' }, ...groups, { id: 'none', name: '未分類' }]"
                :key="option.id"
                type="button"
                role="tab"
                :aria-selected="groupFilter === option.id"
                class="shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-1.5 text-button transition"
                :class="groupFilter === option.id ? 'border-accent-hue bg-selected text-on-selected' : 'border-transparent text-ink-muted hover:bg-tint/5 hover:text-ink-soft'"
                @click="groupFilter = option.id"
              >
                {{ option.name }}<span class="text-caption text-ink-muted">（{{ groupCount(option.id) }}）</span>
              </button>
            </div>
            <!-- 管理清單：筆 → 勾勾（完成） -->
            <EditToggleButton
              class="mb-1"
              size="sm"
              :active="managingGroups"
              label="管理清單"
              active-label="完成管理清單"
              :aria-expanded="managingGroups"
              @click="managingGroups = !managingGroups"
            />
          </div>
          <MarketGroupManager
            v-if="managingGroups"
            class="mt-2 border-2 border-tint/10 bg-tint/[0.03] p-3 text-body"
            :groups="groups"
            @changed="onGroupsChanged"
            @removed="onGroupRemoved"
          />
        </div>

        <!-- ── 第二層：這個清單裡的篩選與排序 ── -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-button">
          <div class="flex flex-wrap items-center gap-1">
            <span class="mr-1 text-ink-muted">市場</span>
            <button
              v-for="option in (['all', 'tw', 'us'] as const)"
              :key="option"
              type="button"
              class="cursor-pointer border px-2 py-0.5 transition"
              :class="marketFilter === option ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
              :aria-pressed="marketFilter === option"
              @click="marketFilter = option"
            >
              {{ option === 'all' ? '全部' : MARKET_LABELS[option] }}（{{ counts[option] }}）
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <span class="mr-1 text-ink-muted">排序</span>
            <button
              v-for="option in SORT_OPTIONS"
              :key="option.value"
              type="button"
              class="cursor-pointer border px-2 py-0.5 transition"
              :class="sortKey === option.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
              @click="sortKey = option.value"
            >
              {{ option.label }}
            </button>
            <button
              v-if="sortKey === 'added'"
              type="button"
              class="cursor-pointer border px-2 py-0.5 transition"
              :class="sortMode ? 'border-info-hue/50 bg-info-hue/10 text-info-ink' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
              :aria-pressed="sortMode"
              @click="sortMode = !sortMode"
            >
              {{ sortMode ? '完成排序' : '調整順序' }}
            </button>
          </div>
        </div>
        <p v-if="sortMode" class="text-caption text-info">
          排序模式：桌機可以直接拖曳，手機用 ↑ ↓。只調整目前畫面上的這些股票{{ savingOrder ? '（儲存中…）' : '' }}。
        </p>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-caption text-ink-muted">{{ asOf ? `報價更新於 ${timeText(asOf)}` : '' }}</p>
          <!-- 卡片／表格切換：和股市總覽同一個樣子，圖示是「按了會變成的樣子」 -->
          <button
            v-if="!sortMode && visibleItems.length"
            type="button"
            class="flex h-7 w-8 shrink-0 cursor-pointer items-center justify-center border border-tint/15 text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
            :aria-label="listView === 'table' ? '改成卡片檢視' : '改成表格檢視'"
            :title="listView === 'table' ? '改成卡片檢視' : '改成表格檢視'"
            @click="toggleListView"
          >
            <svg v-if="listView === 'table'" class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" />
              <rect x="2" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" />
            </svg>
            <svg v-else class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="2" y="3" width="12" height="2" /><rect x="2" y="7" width="12" height="2" /><rect x="2" y="11" width="12" height="2" />
            </svg>
          </button>
        </div>

        <p v-if="visibleItems.length === 0" class="text-body text-ink-muted">這個分類還沒有股票。</p>

        <!-- ── 清單：卡片或表格（和股市總覽的自選清單同一個元件），點一檔開詳細彈窗 ── -->
        <DashboardWatchList
          v-if="!sortMode && visibleItems.length"
          :items="visibleItems"
          :view="listView"
          selectable
          @select="selectedId = $event.id"
        />

        <!-- ── 排序模式：精簡一列，可拖曳或用 ↑ ↓ ── -->
        <ul v-if="sortMode" class="space-y-2">
          <li
            v-for="(item, index) in visibleItems"
            :key="item.id"
            class="border-2 bg-tint/[0.03]"
            :class="dragId === item.id ? 'border-info-hue/50 opacity-60' : 'border-tint/10'"
            draggable="true"
            @dragstart="dragId = item.id"
            @dragend="dragId = ''"
            @dragover.prevent
            @drop.prevent="dropOn(item.id)"
          >
            <!-- 排序模式：精簡一列＋上移下移 -->
            <div class="flex cursor-grab items-center gap-2 px-3 py-2 text-body active:cursor-grabbing">
              <span class="shrink-0 select-none text-ink-muted" aria-hidden="true">⋮⋮</span>
              <span class="min-w-0 flex-1 truncate text-ink">
                {{ item.summary?.name || item.target.name }}
                <span class="text-caption tabular-nums text-ink-muted">{{ idOf(item.target) }}</span>
              </span>
              <button type="button" class="cursor-pointer border border-tint/15 px-2 py-0.5 text-button text-ink-muted hover:bg-tint/10 disabled:opacity-30" :disabled="index === 0" :aria-label="`把${item.target.name}往上移`" @click="moveBy(item.id, -1)">↑</button>
              <button type="button" class="cursor-pointer border border-tint/15 px-2 py-0.5 text-button text-ink-muted hover:bg-tint/10 disabled:opacity-30" :disabled="index === visibleItems.length - 1" :aria-label="`把${item.target.name}往下移`" @click="moveBy(item.id, 1)">↓</button>
            </div>
          </li>
        </ul>

        <p class="text-caption text-ink-muted">
          損益只用目前報價計算，不含手續費與交易稅；台股報價來自證交所（約延遲 20 秒），美股來自 Yahoo（可能延遲約 15 分鐘）。
        </p>
      </template>
    </template>

    <!-- 詳細彈窗：原本展開後的內容（摘要、走勢籌碼、持股編輯、個股分析、快速占卜、提醒、清單、移除） -->
    <WatchItemDialog
      v-if="selectedItem"
      :title="`${selectedItem.summary?.name || selectedItem.target.name} · 詳細`"
      :esc-disabled="!!analysisFor"
      @close="closeSelected"
    >
      <template v-for="item in [selectedItem]" :key="item.id">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2">
                  <span class="font-semibold text-ink">{{ item.summary?.name || item.target.name }}</span>
                  <span class="text-caption tabular-nums text-ink-muted">{{ idOf(item.target) }}</span>
                  <span class="border border-tint/15 px-1.5 text-caption text-ink-muted">{{ MARKET_LABELS[item.target.market] }}</span>
                  <span v-if="item.target.kind === 'index'" class="border border-accent-hue/30 px-1.5 text-caption text-accent">指數</span>
                  <span v-if="item.summary?.session === 'intraday'" class="border border-up-hue/30 px-1.5 text-caption text-up-ink">盤中</span>
                </p>
                <p v-if="item.summary" class="mt-1 flex flex-wrap items-baseline gap-x-3">
                  <span class="text-display font-semibold tabular-nums text-ink">{{ formatNumber(item.summary.quote.price) }}</span>
                  <span class="text-body tabular-nums" :class="trendClass(item.summary.quote.change)">
                    {{ formatSigned(item.summary.quote.change) }}（{{ formatSigned(item.summary.quote.changePct, '%') }}）
                  </span>
                  <span class="text-caption text-ink-muted">{{ item.summary.quote.date }}</span>
                </p>
                <p v-else class="mt-1 text-body text-ink-muted">報價暫時取不到，稍後再更新。</p>
              </div>
              <div v-if="item.summary?.spark.length" class="w-32 shrink-0 sm:w-40">
                <MarketSparkline :values="item.summary.spark" />
                <p class="text-right text-caption text-ink-muted">近 {{ item.summary.spark.length }} 個交易日</p>
              </div>
            </div>

            <template v-if="item.summary">
              <!-- 區間漲跌與近一年的價格位置 -->
              <div class="mt-3 grid gap-3 text-body sm:grid-cols-2">
                <div v-if="item.summary.changes" class="flex gap-4 tabular-nums">
                  <span class="text-ink-muted">5 日 <span :class="trendClass(item.summary.changes.d5)">{{ formatSigned(item.summary.changes.d5, '%') }}</span></span>
                  <span class="text-ink-muted">20 日 <span :class="trendClass(item.summary.changes.d20)">{{ formatSigned(item.summary.changes.d20, '%') }}</span></span>
                  <span class="text-ink-muted">60 日 <span :class="trendClass(item.summary.changes.d60)">{{ formatSigned(item.summary.changes.d60, '%') }}</span></span>
                </div>
                <!-- 近一年（52 週）的價格範圍：黃色小標是現價落在哪裡 -->
                <div v-if="item.summary.range52w" class="min-w-0">
                  <div class="flex flex-wrap items-center justify-between gap-x-3 text-body tabular-nums">
                    <span class="flex items-center gap-1.5 text-ink-muted">近一年的價格位置 <HelpTip term="range52w" /></span>
                    <span :class="item.summary.range52w.fromHigh < 0 ? 'text-down' : 'text-up'">
                      {{ item.summary.range52w.fromHigh < 0 ? `比最高點低 ${formatNumber(Math.abs(item.summary.range52w.fromHigh))}%` : '在一年內的最高點' }}
                    </span>
                  </div>
                  <div class="relative mt-1.5 h-1.5 bg-tint/10">
                    <div
                      class="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 bg-accent-hue"
                      :style="{ left: `${item.summary.range52w.position ?? 50}%` }"
                    />
                  </div>
                  <div class="mt-1 flex justify-between text-caption tabular-nums text-ink-muted">
                    <span>最低 {{ formatNumber(item.summary.range52w.low) }}</span>
                    <span>最高 {{ formatNumber(item.summary.range52w.high) }}</span>
                  </div>
                </div>
              </div>

              <!-- 技術判讀（文字來自後端） -->
              <div v-if="item.summary.signals.length" class="mt-3 flex flex-wrap gap-1.5">
                <span
                  v-for="signal in item.summary.signals"
                  :key="signal.key"
                  class="border px-2 py-0.5 text-body"
                  :class="TONE_STYLES[signal.tone]"
                >
                  {{ signal.label }} {{ signal.value }}
                </span>
                <!-- 這排標籤的名詞說明 -->
                <HelpTip class="self-center" :terms="signalGlossaryKeys(item.summary.signals)" />
              </div>

              <p v-if="item.summary.supports.length || item.summary.resistances.length" class="mt-2 text-body text-ink-muted">
                <HelpTip class="mr-1.5" term="supportResistance" />
                <template v-if="item.summary.supports[0]">
                  支撐 <span class="tabular-nums text-down-ink">{{ formatNumber(item.summary.supports[0].price) }}</span>（{{ item.summary.supports[0].label }}）
                </template>
                <template v-if="item.summary.resistances[0]">
                  <span v-if="item.summary.supports[0]" class="mx-1 text-ink-muted">／</span>
                  壓力 <span class="tabular-nums text-danger">{{ formatNumber(item.summary.resistances[0].price) }}</span>（{{ item.summary.resistances[0].label }}）
                </template>
              </p>

              <!-- 除權息與月營收（台股個股；資料來自證交所、櫃買中心） -->
              <div v-if="item.summary.events?.exDividend || item.summary.events?.revenue" class="mt-2 space-y-0.5 text-caption tabular-nums text-ink-muted">
                <p v-if="item.summary.events.exDividend">
                  <span class="text-accent">{{ item.summary.events.exDividend.date }} 除{{ item.summary.events.exDividend.type }}</span>
                  <template v-if="item.summary.events.exDividend.cashDividend">，每股現金 {{ formatNumber(item.summary.events.exDividend.cashDividend, 4) }} 元</template>
                  <template v-if="item.summary.events.exDividend.stockRatio">，配股 {{ formatNumber(item.summary.events.exDividend.stockRatio * 1000, 2) }} 股／張</template>
                </p>
                <p v-if="item.summary.events.revenue">
                  {{ monthText(item.summary.events.revenue.month) }}營收 年增
                  <span :class="trendClass(item.summary.events.revenue.yoy)">{{ formatSigned(item.summary.events.revenue.yoy, '%') }}</span>
                  ・月增 <span :class="trendClass(item.summary.events.revenue.mom)">{{ formatSigned(item.summary.events.revenue.mom, '%') }}</span>
                  ・累計年增 <span :class="trendClass(item.summary.events.revenue.cumYoy)">{{ formatSigned(item.summary.events.revenue.cumYoy, '%') }}</span>
                  <span v-if="item.summary.events.revenue.note" class="block text-ink-muted">{{ item.summary.events.revenue.note }}</span>
                </p>
              </div>
            </template>

            <!-- 重大訊息：最近 3 則 -->
            <div v-if="newsOf(item).length" class="mt-3 border-t border-tint/10 pt-2">
              <p class="text-body text-ink-muted">重大訊息<span class="ml-1 text-ink-muted">（最近 30 天 {{ newsOf(item).length }} 則）</span></p>
              <MarketNewsList class="mt-1" :news="newsOf(item).slice(0, 3)" />
            </div>

            <!-- K 線與籌碼：點開才載入 -->
            <details v-if="item.summary" class="mt-3 border-t border-tint/10 pt-2" @toggle="onDetailToggle(item.id, $event)">
              <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">
                走勢圖{{ item.target.market === 'tw' && item.target.kind === 'stock' ? '與籌碼' : '' }}
                <span v-if="item.summary.chipsTag" class="ml-1 border px-1.5 text-caption" :class="TONE_STYLES[item.summary.chipsTag.tone]">{{ item.summary.chipsTag.text }}</span>
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
                class="cursor-pointer border-2 border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 font-pixel"
                @click="editingId = item.id"
              >
                {{ item.trades.length || item.dividends.length ? '編輯持股' : '記錄持股' }}
              </button>
              <button
                type="button"
                class="cursor-pointer border-2 border-info-hue/40 bg-info-hue/10 px-2 py-0.5 text-button text-info-ink transition hover:bg-info-hue/20 font-pixel"
                title="完整的行情、籌碼、回測與操作建議，也可以要求 AI 深度分析"
                @click="openAnalysis(item)"
              >
                個股分析
              </button>
              <button
                type="button"
                class="cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/10 px-2 py-0.5 text-button text-accent transition hover:bg-accent-hue/20 font-pixel"
                title="帶入這檔股票，用「股市諮詢」與「投資決策」牌陣占卜"
                @click="quickReading(item)"
              >
                快速占卜
              </button>
              <button
                type="button"
                class="cursor-pointer border-2 border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 font-pixel"
                @click="(closeSelected(), emit('alert', item.target, item.summary?.quote.price ?? null))"
              >
                設價位提醒
              </button>
              <details v-if="groups.length" class="relative" data-dropdown>
                <!-- 外觀和旁邊的按鈕一致 -->
                <summary class="cursor-pointer list-none border-2 border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 font-pixel [&::-webkit-details-marker]:hidden">
                  清單（{{ groupNamesOf(item) || '未分類' }}）
                </summary>
                <!-- 可以勾好幾個；全部取消就是未分類 -->
                <div class="absolute left-0 top-full z-20 mt-1 flex min-w-[10rem] flex-col border-2 border-tint/15 bg-surface py-1 shadow-xl shadow-shade">
                  <label
                    v-for="option in groups"
                    :key="option.id"
                    class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-button transition hover:bg-tint/10"
                    :class="[groupIdsOf(item).includes(option.id) ? 'text-accent' : 'text-ink-muted', moving === item.id ? 'pointer-events-none opacity-60' : '']"
                  >
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer"
                      :checked="groupIdsOf(item).includes(option.id)"
                      :disabled="moving === item.id"
                      @change="toggleGroup(item, option.id)"
                    />
                    {{ option.name }}
                  </label>
                  <p class="border-t border-tint/10 px-3 pt-1.5 text-caption text-ink-muted">都不勾＝未分類</p>
                </div>
              </details>
              <button
                type="button"
                class="cursor-pointer border-2 border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 disabled:opacity-60 font-pixel"
                :disabled="removing === item.id"
                @click="remove(item)"
              >
                移除
              </button>
            </div>
      </template>
    </WatchItemDialog>

    <StockAnalysisDialog v-if="analysisFor" :watch-id="analysisFor.id" :name="analysisFor.name" @close="analysisFor = null" />
  </section>
</template>
