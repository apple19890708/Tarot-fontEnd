<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'

import HelpTip from '../HelpTip.vue'
import RefreshButton from '../RefreshButton.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import ViewToggleButton from '../ViewToggleButton.vue'
import MonthRangePicker from '../MonthRangePicker.vue'
import CheckboxField from '../CheckboxField.vue'
import EditToggleButton from '../EditToggleButton.vue'
import MarketGroupManager from './MarketGroupManager.vue'
import MarketHoldings from './MarketHoldings.vue'
import WatchAddForm from './WatchAddForm.vue'
import WatchItemDialog from './WatchItemDialog.vue'
import IncomeMonthDialog from './IncomeMonthDialog.vue'
import { monthEntries } from '../../lib/incomeMonthEntries'
import IncomeConcentration from './IncomeConcentration.vue'
import IncomeFills from './IncomeFills.vue'
import IncomeGrowth from './IncomeGrowth.vue'
import IncomeForecastCheck from './IncomeForecastCheck.vue'
import IncomeYearReport from './IncomeYearReport.vue'
import { deleteWatch, fetchIncome, fetchMarketSettings, fetchNotifyStatus, saveExDividendReminder, setWatchGroups, updateWatchHoldings } from '../../lib/api'
import { dismissPatch, entitlementPatch, linkDividendPatch } from '../../lib/incomeImport'
import { confirmDialog } from '../../lib/confirm'
import { watchlistVersion } from '../../lib/watchlistSync'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { useCooldown } from '../../lib/useCooldown'
import { usePaged } from '../../lib/usePaged'
import { useStoredToggle } from '../../lib/useStoredToggle'
import ListPager from '../ListPager.vue'
import type { IncomeAnnualized, IncomeBreakdown, IncomeEntitlementEvent, IncomeFrequency, IncomeItem, IncomeReport, MarketWatchGroup, MarketWatchItem } from '../../types'

// 股利獲利與預測（v20）：自選清單的持股損益、未來 12 個月的股利預估（依除息月）、每檔的殖利率。
// 數字全部由後端算（GET /api/market/income），這裡只負責排版、切清單、換卡片／表格。
// 頁內可以加股票、管理清單、點一檔編輯持股／改清單／移除（v20 階段 3），都沿用自訂股票追蹤的元件與 API。
// 放在 KeepAlive 裡：切回這個分頁時重抓（清單、持股可能在別的分頁改過）；開著時清單版本號一變（本頁或彈窗裡改的）就重抓

// 記住看哪個清單、卡片還是表格（每台裝置自己的偏好；讀寫失敗就用預設）
const GROUP_KEY = 'market-income-group'
const VIEW_KEY = 'market-income-view'
function readStore(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStore(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 無痕模式等存不了：只是下次不記得
  }
}

const group = ref<string | null>(readStore(GROUP_KEY))
const view = ref<'card' | 'table'>(readStore(VIEW_KEY) === 'table' ? 'table' : 'card')
const report = ref<IncomeReport | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
// 清單另外存：換清單時 report 會先清空，清單列不能跟著消失（畫面會跳）
const groups = ref<MarketWatchGroup[]>([])
const groupsLoaded = ref(false)
let requestId = 0

async function load() {
  const id = ++requestId
  if (!report.value) status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchIncome(group.value)
    if (id !== requestId) return
    report.value = result
    groups.value = result.groups ?? []
    groupsLoaded.value = true
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    const message = err instanceof Error ? err.message : '股利獲利與預測暫時讀不到。'
    // 記住的清單已經被刪掉：回到全部（watch 會重抓）
    if (group.value && message.includes('找不到這個清單')) {
      group.value = null
      return
    }
    error.value = message
    if (!report.value) status.value = 'error'
  }
}

// 換清單：清掉舊的（不同清單的數字不能混著看），放骨架重抓
watch(group, (value) => {
  writeStore(GROUP_KEY, value)
  report.value = null
  void load()
})
watch(view, (value) => writeStore(VIEW_KEY, value))

// 手動更新：按完 30 秒內不能再按（股利資料後端快取 24 小時，主要是更新報價）
const cooldown = useCooldown(30, 'market-income-refresh')
// 已經有資料時 load() 不會進入 loading，按鈕要自己知道「更新中」
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
// 改了清單、持股、交易成本（本頁、彈窗、或別的元件）：開著就重抓；沒開著的話切回來時會重抓
watch(watchlistVersion, () => {
  if (active) void load()
})

// ---- 顯示用 ----
const items = computed(() => report.value?.items ?? [])
// 有買賣紀錄的（全部賣掉的也算，已實現損益還在）
const held = computed(() => items.value.filter((item) => item.position))
// 清單裡還沒持股的個股：給「每張一年約領多少」參考
const watching = computed(() => items.value.filter((item) => !item.position && item.target.kind === 'stock'))
const totals = computed(() => report.value?.totals ?? null)
const hasTw = computed(() => (totals.value?.tw.count ?? 0) > 0)
const hasUs = computed(() => (totals.value?.us.count ?? 0) > 0)

// 下面的 watch 建立當下就會讀 items、groups，所以放在它們宣告之後（見 CLAUDE.md「immediate 的 watch」那條）
// ---- 頁內更新清單（v20 階段 3）----
const showAdd = ref(false)
// 加到別的清單時切過去，免得看起來像沒加成功（加到未分類時回到全部）
function onAdded({ group: addedTo }: { group: string | null }) {
  if (group.value !== null && group.value !== addedTo) group.value = addedTo
}
const managingGroups = ref(false)
function onGroupRemoved(id: string) {
  if (group.value === id) group.value = null
}

// 點一檔開詳細：編輯持股、勾選清單、移除追蹤。用 id 對回最新的資料（重抓後彈窗內容跟著換）
const selectedId = ref<string | null>(null)
const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
// 改清單後這一檔不在目前的清單了：彈窗關掉
watch(selectedItem, (item) => {
  if (!item && selectedId.value && report.value) selectedId.value = null
})
const editingHoldings = ref(false)
watch(selectedId, () => {
  editingHoldings.value = false
  dialogError.value = ''
})
// MarketHoldings 要的形狀；後端沒給原始紀錄（舊版）時不能編輯，否則存檔會把紀錄清空
const holdingsItem = computed<MarketWatchItem | null>(() => {
  const item = selectedItem.value
  if (!item || !item.trades || !item.dividends) return null
  return { id: item.id, target: item.target, groups: item.groups, trades: item.trades, dividends: item.dividends, position: item.position, createdAt: '', summary: null }
})
const dialogError = ref('')
const movingGroup = ref('')
async function toggleItemGroup(item: IncomeItem, id: string) {
  if (movingGroup.value) return
  const current = item.groups ?? []
  const leaving = current.includes(id)
  if (leaving) {
    const name = groups.value.find((g) => g.id === id)?.name ?? ''
    const ok = await confirmDialog({
      title: '從清單拿掉',
      message: `把 ${item.target.name} 從「${name}」清單拿掉？只是不放在這個清單，持股紀錄不會刪除。`,
      confirmText: '拿掉',
      danger: true,
    })
    if (!ok) return
  }
  const wanted = leaving ? current.filter((g) => g !== id) : [...current, id]
  // 順序照清單本身的順序
  const next = groups.value.map((g) => g.id).filter((g) => wanted.includes(g))
  movingGroup.value = id
  dialogError.value = ''
  try {
    await setWatchGroups(item.id, next)
  } catch (err) {
    dialogError.value = err instanceof Error ? err.message : '清單更新失敗'
  } finally {
    movingGroup.value = ''
  }
}
const removingItem = ref(false)
async function removeItem(item: IncomeItem) {
  const extra = item.trades?.length || item.dividends?.length ? '買賣與股利紀錄也會一起刪除。' : ''
  const ok = await confirmDialog({
    title: '移除追蹤',
    message: `確定要移除 ${item.target.name} 嗎？所有清單都會拿掉這一檔。${extra}`,
    confirmText: '移除',
    danger: true,
  })
  if (!ok) return
  removingItem.value = true
  dialogError.value = ''
  try {
    await deleteWatch(item.id)
    selectedId.value = null
  } catch (err) {
    dialogError.value = err instanceof Error ? err.message : '移除失敗'
  } finally {
    removingItem.value = false
  }
}


const unitOf = (item: IncomeItem) => (item.target.market === 'tw' ? '張' : '股')
// 台股金額取整數；美股到分
const money = (value: number | null | undefined, market: 'tw' | 'us' = 'tw') =>
  value === null || value === undefined ? '—' : formatNumber(value, market === 'tw' ? 0 : 2)
const signedMoney = (value: number | null | undefined, market: 'tw' | 'us' = 'tw') =>
  value === null || value === undefined ? '—' : formatSigned(market === 'tw' ? Math.round(value) : Math.round(value * 100) / 100)
function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}
const pctText = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${formatNumber(value, 2)}%`)

const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  monthly: '月配',
  quarterly: '季配',
  semiannual: '半年配',
  annual: '年配',
  none: '近一年沒配息',
}
// 年化報酬算不出來的原因（短句，放在數字的位置）
const ANNUALIZED_REASONS: Record<string, string> = {
  missingDates: '有買賣或股利沒填日期',
  noQuote: '報價暫時取不到',
  tooShort: '持有不到 90 天',
  noSolution: '算不出來',
  noTrades: '—',
  noFx: '匯率取不到',
}
function annualizedText(value: IncomeAnnualized | null | undefined) {
  if (!value) return '—'
  if (value.pct !== null) return formatSigned(value.pct, '%')
  if (value.reason === 'partial') return `有 ${value.blocked ?? 0} 檔算不出來`
  return ANNUALIZED_REASONS[value.reason ?? ''] ?? '—'
}
// 報酬拆解的列：價差（可正可負）、股利（加）、三種費用（減）
function breakdownRows(b: IncomeBreakdown) {
  return [
    { label: '價差（買賣與現價的差）', value: b.price, sign: b.price < 0 ? '−' : '＋', tone: trendClass(b.price), help: null },
    { label: '股利', value: b.dividends, sign: '＋', tone: 'text-accent', help: null },
    { label: '手續費', value: b.fees, sign: '−', tone: 'text-ink-soft', help: null },
    { label: '證交稅', value: b.tax, sign: '−', tone: 'text-ink-soft', help: null },
    { label: '現在賣出還要付', value: b.sellCost, sign: '−', tone: 'text-ink-soft', help: 'sellCost' as const },
  ]
}

// 摘要卡：台股（元）、美股（美元）、兩邊都有時再加一張合計（台幣）
const summaryCards = computed(() => {
  const t = totals.value
  if (!t) return []
  const cards: {
    key: string
    title: string
    note: string
    market: 'tw' | 'us'
    data: { cost: number; value: number; unrealized: number; unrealizedPct: number | null; realized: number; dividends: number; totalReturn: number; annualNet: number; annualized?: IncomeAnnualized; breakdown?: IncomeBreakdown }
    missingQuote: number
  }[] = []
  if (hasTw.value) cards.push({ key: 'tw', title: '台股', note: '元', market: 'tw', data: t.tw, missingQuote: t.tw.missingQuote })
  if (hasUs.value) cards.push({ key: 'us', title: '美股', note: '美元', market: 'us', data: t.us, missingQuote: t.us.missingQuote })
  if (hasTw.value && hasUs.value) {
    const note = t.twd.usIncluded && report.value?.usdTwd ? `台幣，美元以 ${formatNumber(report.value.usdTwd, 2)} 換算` : '台幣，匯率取不到，只含台股'
    cards.push({ key: 'twd', title: '合計', note, market: 'tw', data: t.twd, missingQuote: t.tw.missingQuote + t.us.missingQuote })
  }
  return cards
})
// 桌機摘要表：summaryRows 的欄名（順序要一致）
const SUMMARY_COLUMNS = ['投入成本', '目前市值', '還沒賣的賺賠', '已經賣掉的賺賠', '已記錄的股利']
const summaryRows = (card: (typeof summaryCards.value)[number]) => [
  { label: '投入成本', value: money(card.data.cost, card.market), tone: '' },
  { label: '目前市值', value: money(card.data.value, card.market), tone: '' },
  {
    label: '還沒賣的賺賠',
    value: `${signedMoney(card.data.unrealized, card.market)}（${formatSigned(card.data.unrealizedPct, '%')}）`,
    tone: trendClass(card.data.unrealized),
  },
  { label: '已經賣掉的賺賠', value: signedMoney(card.data.realized, card.market), tone: trendClass(card.data.realized) },
  { label: '已記錄的股利', value: money(card.data.dividends, card.market), tone: '' },
]

// ---- 每月股利明細（2026-11-10 改成可以選區間；長條圖依使用者要求拿掉，只留明細表）----
// 時間軸：本月之前 24 個月（實際應收，依買賣紀錄）＋本月起 12 個月（已公告／推估）。一次看 12 個月，用 MonthRangePicker 選起始月份，
// 最早往前 2 年、最晚就是「本月起 12 個月」。過去的月份另外列「當時的預估」（有記錄到才有），拿來看預估準不準。
// 兩個市場都有時畫台幣合計；只有一邊就用那一邊的幣別
const chartSide = computed(() => {
  const t = totals.value
  if (!t) return null
  const pick = (side: { monthly: number[]; monthlyEstimated?: number[]; pastActual?: number[]; pastEstimate?: (number | null)[]; annualNet: number }) => ({
    monthly: side.monthly,
    estimated: side.monthlyEstimated,
    pastActual: side.pastActual ?? [],
    pastEstimate: side.pastEstimate ?? [],
    annual: side.annualNet,
  })
  if (hasTw.value && hasUs.value) return { ...pick(t.twd), market: 'tw' as const, unit: '元（台幣）' }
  if (hasUs.value) return { ...pick(t.us), market: 'us' as const, unit: '美元' }
  return { ...pick(t.tw), market: 'tw' as const, unit: '元' }
})
const pastMonths = computed(() => report.value?.pastMonths ?? [])
const futureMonths = computed(() => report.value?.months ?? [])
const timeline = computed(() => [...pastMonths.value, ...futureMonths.value])
// 區間（起 ~ 迄，最長 12 個月）：預設本月到 11 個月後（＝原本的「未來 12 個月」）；資料重抓後超出範圍就拉回預設
const windowStart = ref('')
const windowEnd = ref('')
watch(
  timeline,
  (list) => {
    if (!list.includes(windowStart.value) || !list.includes(windowEnd.value)) {
      windowStart.value = futureMonths.value[0] ?? list[0] ?? ''
      windowEnd.value = futureMonths.value[futureMonths.value.length - 1] ?? list[list.length - 1] ?? ''
    }
  },
  { immediate: true },
)
const windowMonths = computed(() => timeline.value.filter((month) => month >= windowStart.value && month <= windowEnd.value))
const isPastWindow = computed(() => windowMonths.value.some((month) => pastMonths.value.includes(month)))
const fullMonth = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`
const monthRows = computed(() =>
  windowMonths.value.map((month) => {
    const side = chartSide.value
    const past = pastMonths.value.indexOf(month)
    if (past >= 0) {
      const total = side?.pastActual[past] ?? 0
      return { month, label: fullMonth(month), past: true, total, confirmed: total, estimated: 0, pastEstimate: side?.pastEstimate[past] ?? null }
    }
    const future = futureMonths.value.indexOf(month)
    const total = side?.monthly[future] ?? 0
    const estimated = side?.estimated?.[future] ?? 0
    return { month, label: fullMonth(month), past: false, total, estimated, confirmed: Math.max(0, total - estimated), pastEstimate: null as number | null }
  }),
)
const hasProjection = computed(() => monthRows.value.some((row) => row.total > 0 || (row.pastEstimate ?? 0) > 0))
// 區間合計；過去的月份有預估紀錄時，一起算「當時預估」合計與差距
const windowSummary = computed(() => {
  const total = monthRows.value.reduce((sum, row) => sum + row.total, 0)
  const compared = monthRows.value.filter((row) => row.past && row.pastEstimate !== null)
  const estimate = compared.reduce((sum, row) => sum + (row.pastEstimate ?? 0), 0)
  const actual = compared.reduce((sum, row) => sum + row.total, 0)
  return { total, average: total / Math.max(1, monthRows.value.length), compared: compared.length, estimate, actual, diffPct: actual > 0 ? ((estimate - actual) / actual) * 100 : null }
})

// 每月小卡（2026-11-10 使用者覺得一個月一列的表太佔空間，改成格子；也取代原本的股利月曆）：
// 卡片上放合計與有持股的代號，點開彈窗看這個月每一檔的除息日與股利。哪幾檔的判斷在 lib/incomeMonthEntries（原本月曆那一套）
const thisMonth = computed(() => report.value?.today.slice(0, 7) ?? '')
const monthCards = computed(() =>
  monthRows.value.map((row) => {
    const entries = monthEntries(items.value, futureMonths.value, thisMonth.value, row.month)
    return { ...row, entries, held: entries.filter((entry) => entry.held) }
  }),
)
// 卡片上最多放幾個代號，其他寫「+N」
const CARD_CHIPS = 4
const openMonth = ref<string | null>(null)
const openCard = computed(() => monthCards.value.find((card) => card.month === openMonth.value) ?? null)
function openMonthItem(id: string) {
  openMonth.value = null
  selectedId.value = id
}

const MONTH_SKELETON = 12

// ---- 應收股利對照與帶入（v20 階段 4）----
// 每檔：持有期間應該領到、但還沒記錄的現金股利與配股。金額都是後端算的（扣過健保補充保費／預扣稅）
const entitlementRows = computed(() =>
  held.value
    .filter((item) => item.entitlement && (item.entitlement.reason !== 'noTrades' || item.entitlement.available))
    .map((item) => {
      const events = item.entitlement?.events ?? []
      return {
        item,
        // 刪掉的（dismissed）不再列出，之後要記請自己在持股手動加
        pending: events.filter((e) => e.recorded !== 'yes' && !e.dismissed),
        recordedCount: events.filter((e) => e.recorded === 'yes').length,
        dismissedCount: events.filter((e) => e.dismissed && e.recorded !== 'yes').length,
        // 「還沒記錄」才能一次全部帶入；「可能已記錄」要使用者自己判斷
        importable: events.filter((e) => e.recorded === 'no' && !e.dismissed),
      }
    })
    .filter((row) => !row.item.entitlement?.available || row.pending.length || row.item.entitlement?.splitWarning),
)
// 分頁（清單股票多的時候；每頁筆數各自記住）
const { items: heldPageItems, page: heldPage, pageSize: heldPageSize, total: heldTotal } = usePaged(held, 'income-held')
const { items: watchingPageItems, page: watchingPage, pageSize: watchingPageSize, total: watchingTotal } = usePaged(watching, 'income-watching')
const { items: entitlementPageRows, page: entitlementPage, pageSize: entitlementPageSize, total: entitlementTotal } = usePaged(entitlementRows, 'income-entitlement', 5)
const entitlementOpen = useStoredToggle('income-entitlement', false)
const pendingCount = computed(() => entitlementRows.value.reduce((sum, row) => sum + row.pending.length, 0))
const importableCount = computed(() => entitlementRows.value.reduce((sum, row) => sum + row.importable.length, 0))
const importing = ref('')
const importError = ref('')

async function importEvents(item: IncomeItem, events: IncomeEntitlementEvent[], key: string) {
  if (importing.value || !events.length) return
  importing.value = key
  importError.value = ''
  try {
    await updateWatchHoldings(item.id, entitlementPatch(item, events))
  } catch (err) {
    importError.value = `${item.target.name}：${err instanceof Error ? err.message : '帶入失敗'}`
  } finally {
    importing.value = ''
  }
}
async function linkEvent(item: IncomeItem, event: IncomeEntitlementEvent) {
  const patch = linkDividendPatch(item, event)
  if (!patch || importing.value) return
  importing.value = `link:${item.id}:${event.exDate}`
  importError.value = ''
  try {
    await updateWatchHoldings(item.id, patch)
  } catch (err) {
    importError.value = `${item.target.name}：${err instanceof Error ? err.message : '更新失敗'}`
  } finally {
    importing.value = ''
  }
}
// 刪除（不帶入）：一筆、這檔全部、全部。只是不再提醒，之後要記就自己在持股詳細手動加；不能復原，所以先確認
async function dismissEvents(item: IncomeItem, events: IncomeEntitlementEvent[], key: string) {
  if (importing.value || !events.length) return
  importing.value = key
  importError.value = ''
  try {
    await updateWatchHoldings(item.id, dismissPatch(item, events))
  } catch (err) {
    importError.value = `${item.target.name}：${err instanceof Error ? err.message : '刪除失敗'}`
  } finally {
    importing.value = ''
  }
}
async function confirmDismiss(rows: { item: IncomeItem; pending: IncomeEntitlementEvent[] }[], key: string) {
  const count = rows.reduce((sum, row) => sum + row.pending.length, 0)
  if (!count || importing.value) return
  const ok = await confirmDialog({
    title: '刪除應收股利',
    message: `${rows.length === 1 ? rows[0]!.item.target.name : `${rows.length} 檔`}共 ${count} 筆應收股利從清單刪掉、不帶入？
刪掉之後不會再出現在這裡，要記的話請點股票名稱，在持股裡自己手動加。`,
    confirmText: '刪除',
    danger: true,
  })
  if (!ok) return
  for (const row of rows) {
    await dismissEvents(row.item, row.pending, key)
    if (importError.value) break
  }
}

// 全部帶入：一檔一個請求，依序送（同一檔的紀錄要一次改完）；失敗的那一檔停下來顯示原因
async function importAll() {
  const rows = entitlementRows.value.filter((row) => row.importable.length)
  if (!rows.length || importing.value) return
  const ok = await confirmDialog({
    title: '全部帶入',
    message: `把 ${rows.length} 檔、共 ${importableCount.value} 筆還沒記錄的股利與配股記進持股紀錄？
現金股利的入帳日先填除息日，金額是扣掉健保補充保費／預扣稅後的預估，和券商不同的話可以在詳細裡修改。`,
    confirmText: '全部帶入',
  })
  if (!ok) return
  for (const row of rows) {
    await importEvents(row.item, row.importable, 'all')
    if (importError.value) break
  }
}
const matchedDividend = (item: IncomeItem, event: IncomeEntitlementEvent) =>
  event.matchIndex !== null && event.matchIndex !== undefined ? item.dividends?.[event.matchIndex] ?? null : null
const ENTITLEMENT_REASONS: Record<string, string> = {
  missingDates: '有買賣紀錄沒填日期，算不出當時有沒有持股。點股票名稱補上日期就能算。',
  noData: '股利資料暫時抓不到，稍後再按更新。',
}
// 除息前推播的開關：存在帳號的股市設定裡；推播本身要先在「價位提醒」開啟（這裡只提示）
const reminderOn = ref<boolean | null>(null)
const reminderSaving = ref(false)
const reminderError = ref('')
// 有沒有可以收通知的管道（瀏覽器推播裝置或 Discord）；查不到時是 null，不顯示提示
const hasNotifyChannel = ref<boolean | null>(null)
async function loadReminder() {
  try {
    const settings = await fetchMarketSettings()
    reminderOn.value = settings.reminders?.exDividend ?? false
  } catch {
    reminderOn.value = null
  }
  try {
    const notify = await fetchNotifyStatus()
    hasNotifyChannel.value = notify.push.devices.length > 0 || Boolean(notify.discord?.linked)
  } catch {
    hasNotifyChannel.value = null
  }
}
onMounted(loadReminder)
async function toggleReminder() {
  if (reminderSaving.value || reminderOn.value === null) return
  reminderSaving.value = true
  reminderError.value = ''
  try {
    const result = await saveExDividendReminder(!reminderOn.value)
    reminderOn.value = result.reminders.exDividend
  } catch (err) {
    reminderError.value = err instanceof Error ? err.message : '設定存不起來'
  } finally {
    reminderSaving.value = false
  }
}
</script>

<template>
  <section class="space-y-5 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Profit &amp; Dividends</p>
        <h2 class="mt-1 text-title font-semibold text-ink">股利獲利與預測</h2>
        <p class="mt-1 text-body text-ink-muted">
          用自訂股票追蹤記下的買賣紀錄，算出到現在賺了多少，並預估未來 12 個月每個月大約能領多少股利。
        </p>
      </div>
      <RefreshButton label="更新" :loading="status === 'loading' || refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <!-- 清單：換頁性質（整頁內容跟著換），選中用金色；右邊管理清單（筆 → 勾勾） -->
    <div v-if="groupsLoaded">
      <div class="flex items-end gap-2 border-b-2 border-tint/10">
      <div class="-mb-[2px] flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]" role="tablist" aria-label="自選清單">
      <button
        v-for="option in [{ id: null, name: '全部追蹤' }, ...groups]"
        :key="option.id ?? 'all'"
        type="button"
        role="tab"
        :aria-selected="group === option.id"
        class="shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-1.5 text-button transition"
        :class="group === option.id ? 'border-accent-hue bg-selected text-on-selected' : 'border-transparent text-ink-muted hover:bg-tint/5 hover:text-ink-soft'"
        @click="group = option.id"
      >
        {{ option.name }}
      </button>
      </div>
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
        @changed="(next) => (groups = next)"
        @removed="onGroupRemoved"
      />
    </div>
    <!-- 第一次載入時，清單列先放同高度的佔位 -->
    <div v-else-if="status === 'loading'" class="flex gap-2">
      <SkeletonBlock v-for="n in 3" :key="n" class="h-8 w-20" />
    </div>

    <!-- 加股票：平常收起來，按了才展開共用的「加入追蹤」表單 -->
    <div v-if="groupsLoaded" class="space-y-2">
      <button
        type="button"
        class="cursor-pointer border-2 px-3 py-1 text-button transition active:translate-x-[1px] active:translate-y-[1px]"
        :class="showAdd ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10 hover:text-ink'"
        :aria-expanded="showAdd"
        @click="showAdd = !showAdd"
      >
        {{ showAdd ? '收起加股票' : '＋ 加股票' }}
      </button>
      <WatchAddForm v-if="showAdd" :groups="groups" :default-group="group" @added="onAdded" @group-created="(created) => (groups = [...groups, created])" />
    </div>

    <!-- 骨架：摘要卡、圖表、持股列表 -->
    <template v-if="status === 'loading' && !report">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="n in 2" :key="n" class="space-y-2 border-2 border-tint/10 bg-tint/5 p-3">
          <SkeletonBlock class="h-5 w-24" />
          <SkeletonBlock class="h-8 w-40" />
          <SkeletonBlock v-for="m in 5" :key="m" class="h-4 w-full" />
        </div>
      </div>
      <div class="space-y-2">
        <SkeletonBlock class="h-5 w-48" />
        <div class="flex h-56 items-end gap-2 border-2 border-tint/10 p-3">
          <SkeletonBlock v-for="n in MONTH_SKELETON" :key="n" class="flex-1" :style="{ height: `${20 + ((n * 37) % 60)}%` }" />
        </div>
      </div>
      <div class="space-y-2">
        <SkeletonBlock class="h-5 w-32" />
        <SkeletonBlock v-for="n in 3" :key="n" class="h-20 w-full" />
      </div>
    </template>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center justify-between gap-2 border-2 border-danger-hue/30 bg-danger-hue/[0.06] px-3 py-3">
      <p class="text-body text-danger">{{ error }}</p>
      <RefreshButton label="重試" loading-label="重試中…" tone="danger" :loading="refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <template v-else-if="report">
      <p class="text-caption text-ink-muted">
        更新於 {{ new Date(report.asOf).toLocaleString('zh-TW', { hour12: false }) }}<template v-if="error">｜更新失敗，先顯示上一次的資料：{{ error }}</template>
      </p>

      <!-- 清單是空的 -->
      <div v-if="!items.length" class="border-2 border-dashed border-tint/15 px-4 py-6 text-center text-body text-ink-muted">
        {{ group ? '這個清單還沒有股票。' : '還沒有追蹤任何股票。' }}按上面的「＋ 加股票」加進來、記下買進紀錄，這裡就會算出獲利與股利預測。
      </div>

      <template v-else>
        <!-- ── 摘要 ── -->
        <!-- 桌機：一個市場一列、指標排成欄（2026-11-10 使用者要求：只有一張卡時左邊一小塊、右邊全空） -->
        <div v-if="summaryCards.length" class="hidden overflow-x-auto border-2 border-tint/10 lg:block">
          <table class="w-full text-body tabular-nums">
            <thead class="bg-tint/5 text-caption text-ink-muted">
              <tr>
                <th scope="col" class="px-3 py-2 text-left font-normal">市場</th>
                <th scope="col" class="px-3 py-2 text-right font-normal">總報酬（賺賠＋股利）</th>
                <th scope="col" class="px-3 py-2 text-right font-normal"><span class="inline-flex items-center gap-1">平均每年<HelpTip term="xirr" /></span></th>
                <th v-for="label in SUMMARY_COLUMNS" :key="label" scope="col" class="px-3 py-2 text-right font-normal">{{ label }}</th>
                <th scope="col" class="px-3 py-2 text-right font-normal"><span class="inline-flex items-center gap-1">預估一年股利<HelpTip term="incomeDeduction" /></span></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="card in summaryCards" :key="card.key">
                <tr class="border-t border-tint/10">
                  <th scope="row" class="px-3 py-2.5 text-left font-normal">
                    <span class="block font-semibold text-ink">{{ card.title }}</span>
                    <span class="block text-caption text-ink-muted">{{ card.note }}</span>
                  </th>
                  <td class="whitespace-nowrap px-3 py-2.5 text-right text-subtitle font-semibold" :class="trendClass(card.data.totalReturn)">{{ signedMoney(card.data.totalReturn, card.market) }}</td>
                  <td class="whitespace-nowrap px-3 py-2.5 text-right" :class="!card.data.annualized || card.data.annualized.pct === null ? 'text-ink-muted' : trendClass(card.data.annualized.pct)">
                    {{ card.data.annualized ? annualizedText(card.data.annualized) : '—' }}
                  </td>
                  <td v-for="row in summaryRows(card)" :key="row.label" class="whitespace-nowrap px-3 py-2.5 text-right" :class="row.tone || 'text-ink-soft'">{{ row.value }}</td>
                  <td class="whitespace-nowrap px-3 py-2.5 text-right text-accent">{{ money(card.data.annualNet, card.market) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
          <!-- 報酬怎麼來的：放在表格外面、一直顯示成一行算式（2026-11-10 使用者回報：放在表格裡展開會撐寬表格、冒出橫向捲軸而抖動，右邊箭頭也不要） -->
          <div v-for="card in summaryCards.filter((c) => c.data.breakdown)" :key="card.key" class="border-t border-tint/10 px-3 py-2 text-body">
            <dl class="flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums">
              <dt class="text-caption text-ink-muted">{{ summaryCards.length > 1 ? `${card.title}：` : '' }}報酬怎麼來的</dt>
              <div v-for="row in breakdownRows(card.data.breakdown!)" :key="row.label" class="flex items-baseline gap-1.5">
                <dt class="flex items-center gap-1 text-ink-muted">{{ row.label }}<HelpTip v-if="row.help" :term="row.help" /></dt>
                <dd :class="row.tone">{{ row.sign }}{{ money(Math.abs(row.value), card.market) }}</dd>
              </div>
              <div class="flex items-baseline gap-1.5">
                <dt class="text-ink-muted">＝ 總報酬</dt>
                <dd class="font-semibold" :class="trendClass(card.data.totalReturn)">{{ signedMoney(card.data.totalReturn, card.market) }}</dd>
              </div>
            </dl>
          </div>
          <p v-for="card in summaryCards.filter((c) => c.missingQuote)" :key="card.key" class="border-t border-tint/10 px-3 py-2 text-caption text-warn">
            {{ card.title }}有 {{ card.missingQuote }} 檔報價暫時抓不到，市值與賺賠沒算進去。
          </p>
        </div>
        <!-- 手機、平板：一個市場一張卡 -->
        <div v-if="summaryCards.length" class="grid gap-3 sm:grid-cols-2 lg:hidden">
          <div v-for="card in summaryCards" :key="card.key" class="space-y-2 border-2 border-tint/10 bg-tint/5 p-3">
            <p class="flex items-baseline justify-between gap-2">
              <span class="text-subtitle font-semibold text-ink">{{ card.title }}</span>
              <span class="text-caption text-ink-muted">{{ card.note }}</span>
            </p>
            <div>
              <p class="text-caption text-ink-muted">總報酬（賺賠＋股利）</p>
              <p class="text-display font-semibold tabular-nums" :class="trendClass(card.data.totalReturn)">{{ signedMoney(card.data.totalReturn, card.market) }}</p>
              <p v-if="card.data.annualized" class="flex flex-wrap items-center gap-1 text-body text-ink-muted">
                換算成平均每年
                <span class="tabular-nums" :class="card.data.annualized.pct === null ? 'text-ink-muted' : trendClass(card.data.annualized.pct)">{{ annualizedText(card.data.annualized) }}</span>
                <HelpTip term="xirr" />
              </p>
            </div>
            <dl class="space-y-1 text-body">
              <div v-for="row in summaryRows(card)" :key="row.label" class="flex justify-between gap-3">
                <dt class="text-ink-muted">{{ row.label }}</dt>
                <dd class="tabular-nums" :class="row.tone || 'text-ink-soft'">{{ row.value }}</dd>
              </div>
              <div class="flex justify-between gap-3 border-t border-tint/10 pt-1">
                <dt class="flex items-center gap-1 text-ink-muted">預估一年股利<HelpTip term="incomeDeduction" /></dt>
                <dd class="tabular-nums text-accent">{{ money(card.data.annualNet, card.market) }}</dd>
              </div>
            </dl>
            <!-- 報酬拆解（v20 階段 8）：數字全部是後端算的，五項加起來就是總報酬 -->
            <details v-if="card.data.breakdown" class="text-body">
              <summary class="cursor-pointer text-ink-muted marker:text-ink-soft hover:text-ink">報酬怎麼來的</summary>
              <dl class="mt-1.5 space-y-1">
                <div v-for="row in breakdownRows(card.data.breakdown)" :key="row.label" class="flex justify-between gap-3">
                  <dt class="flex items-center gap-1 text-ink-muted">{{ row.label }}<HelpTip v-if="row.help" :term="row.help" /></dt>
                  <dd class="tabular-nums" :class="row.tone">{{ row.sign }}{{ money(Math.abs(row.value), card.market) }}</dd>
                </div>
                <div class="flex justify-between gap-3 border-t border-tint/10 pt-1">
                  <dt class="text-ink-muted">＝ 總報酬</dt>
                  <dd class="tabular-nums font-semibold" :class="trendClass(card.data.totalReturn)">{{ signedMoney(card.data.totalReturn, card.market) }}</dd>
                </div>
              </dl>
            </details>
            <p v-if="card.missingQuote" class="text-caption text-warn">有 {{ card.missingQuote }} 檔報價暫時抓不到，市值與賺賠沒算進去。</p>
          </div>
        </div>
        <p v-else class="border-2 border-dashed border-tint/15 px-3 py-3 text-body text-ink-muted">
          這裡的股票都還沒記錄持股。點下面的股票名稱記下買進紀錄，就會算出賺賠和預估股利；先列出每張一年大約能領多少。
        </p>

        <!-- ── 集中度提醒（v20 2.9.8）：摘要下面；舊版後端沒有 concentration 就不顯示 ── -->
        <IncomeConcentration v-if="report.concentration" :concentration="report.concentration" @saved="load" />

        <!-- ── 每月股利預估 ── -->
        <section v-if="summaryCards.length" class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p class="flex items-center gap-1 text-body text-ink-muted">
              每月股利（扣款後，{{ chartSide?.unit }}）<HelpTip term="incomeProjection" />
            </p>
            <!-- 除息前推播的開關（原本在股利月曆，月曆拿掉後移到這裡；中性色，和換頁的金色區分） -->
            <CheckboxField v-if="reminderOn !== null" :model-value="reminderOn" :disabled="reminderSaving" class="text-body" @update:model-value="toggleReminder">
              除息前一個交易日提醒我{{ reminderSaving ? '（儲存中…）' : '' }}
            </CheckboxField>
            <!-- 區間（起 ~ 迄，最長 12 個月）：最早往前 2 年，最晚到本月起第 12 個月（2026-11-10 使用者要求可以看過去、用日期選擇器） -->
            <MonthRangePicker
              v-if="timeline.length"
              v-model:start="windowStart"
              v-model:end="windowEnd"
              :min="timeline[0]!"
              :max="timeline[timeline.length - 1]!"
            />
          </div>
          <p v-if="reminderError" class="text-body text-danger">{{ reminderError }}</p>
          <p v-else-if="reminderOn && hasNotifyChannel === false" class="text-body text-warn">
            還沒開啟推播通知，提醒送不出去。到
            <router-link :to="{ query: { tab: 'alerts' } }" class="underline">價位提醒</router-link>
            開啟這台裝置的通知。
          </p>
          <p v-else-if="reminderOn" class="text-caption text-ink-muted">
            追蹤的台股在已公告的除息（除權）日前一個交易日早上推播；推估的日期不提醒。
          </p>
          <p v-if="hasProjection && chartSide" class="text-body text-ink-soft">
            這 {{ monthRows.length }} 個月合計約 <span class="tabular-nums text-accent">{{ money(windowSummary.total, chartSide.market) }}</span>，平均每月
            <span class="tabular-nums text-accent">{{ money(windowSummary.average, chartSide.market) }}</span>
            <template v-if="windowSummary.compared && windowSummary.diffPct !== null">
              ；有預估紀錄的 {{ windowSummary.compared }} 個月，當時預估 {{ money(windowSummary.estimate, chartSide.market) }}，實際
              {{ money(windowSummary.actual, chartSide.market) }}（預估{{ windowSummary.diffPct >= 0 ? '高' : '低' }}了
              <span class="tabular-nums font-semibold">{{ formatNumber(Math.abs(windowSummary.diffPct), 1) }}%</span>）
            </template>
          </p>
          <template v-if="hasProjection">
            <!-- 每月小卡：手機 2 欄、平板 3 欄、桌機 4 欄。卡片上只放合計與有持股的代號（實線已公告／實際、虛線推估），點開看細節 -->
            <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <li v-for="card in monthCards" :key="card.month">
                <component
                  :is="card.entries.length ? 'button' : 'div'"
                  :type="card.entries.length ? 'button' : undefined"
                  class="flex h-full w-full flex-col gap-1 border-2 border-tint/10 bg-tint/[0.03] p-2.5 text-left tabular-nums"
                  :class="[
                    card.entries.length ? 'cursor-pointer transition hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]' : '',
                    card.month === thisMonth ? 'border-accent-hue/40' : '',
                  ]"
                  :aria-label="card.entries.length ? `${card.label}，${card.held.length} 檔，點開看除息日與股利` : card.label"
                  @click="card.entries.length && (openMonth = card.month)"
                >
                  <span class="flex items-baseline justify-between gap-1 text-caption text-ink-soft">
                    <span>{{ card.label }}</span>
                    <span v-if="card.past" class="text-ink-muted">已過</span>
                    <span v-else-if="card.month === thisMonth" class="text-accent">本月</span>
                  </span>
                  <span class="text-subtitle font-semibold" :class="card.total ? 'text-accent' : 'text-ink-muted'">{{ card.total ? money(card.total, chartSide?.market) : '—' }}</span>
                  <!-- 過去的月份：當時的預估與差距（有記錄到才有） -->
                  <span v-if="card.past && card.pastEstimate !== null" class="text-caption text-ink-muted">
                    當時預估 {{ money(card.pastEstimate, chartSide?.market) }}
                    <span v-if="card.total > 0" :class="Math.abs(card.pastEstimate - card.total) / card.total <= 0.1 ? 'text-ok' : 'text-warn'">
                      {{ card.pastEstimate >= card.total ? '高' : '低' }} {{ formatNumber((Math.abs(card.pastEstimate - card.total) / card.total) * 100, 1) }}%
                    </span>
                  </span>
                  <span v-if="card.held.length" class="mt-auto flex flex-wrap gap-1 pt-1">
                    <span
                      v-for="entry in card.held.slice(0, CARD_CHIPS)"
                      :key="`${entry.item.id}:${entry.date}`"
                      class="border px-1 text-caption"
                      :class="entry.cash?.source === 'estimated' ? 'border-dashed border-ink-muted/60 text-ink-soft' : 'border-accent-hue/50 bg-accent-hue/15 text-ink'"
                    >
                      {{ entry.item.target.code || entry.item.target.symbol }}
                    </span>
                    <span v-if="card.held.length > CARD_CHIPS" class="text-caption text-ink-muted">+{{ card.held.length - CARD_CHIPS }}</span>
                  </span>
                </component>
              </li>
            </ul>
            <IncomeMonthDialog
              v-if="openCard"
              :month="openCard.month"
              :entries="openCard.entries"
              :total="openCard.total ? money(openCard.total, chartSide?.market) : null"
              @close="openMonth = null"
              @open="openMonthItem"
            />
            <p class="text-caption text-ink-muted">
              依除息月排，實際入帳通常再晚 3～5 週。實線框是已公告／已除息、虛線框是推估；點月份看每一檔的除息日與股利。<template v-if="isPastWindow">已過的月份是依你的買賣紀錄算的實際應收；「當時預估」從開始記錄後才有。</template>
            </p>
            <p v-if="hasTw && hasUs && !totals?.twd.usIncluded" class="text-caption text-warn">匯率暫時取不到，合計只有台股。</p>
          </template>
          <p v-else class="border-2 border-dashed border-tint/15 px-3 py-3 text-body text-ink-muted">
            這段期間沒有配息（近一年沒配息、買賣沒填日期算不出過去的應收，或股利資料暫時抓不到）。換個區間看看。
          </p>
        </section>

        <!-- ── 預估準不準（正式公布後比較；舊版後端沒有 forecastChecks 就不顯示）── -->
        <IncomeForecastCheck v-if="report.forecastChecks" :checks="report.forecastChecks" />

        <!-- ── 股利成長（v20 2.9.7）── -->
        <IncomeGrowth :items="items" @open="(id) => (selectedId = id)" />

        <!-- ── 填息追蹤（v20 階段 7）── -->
        <IncomeFills :items="items" @open="(id) => (selectedId = id)" />

        <!-- ── 每檔持股 ── -->
        <section v-if="held.length" class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-body text-ink-muted">每檔持股（{{ held.length }}）</p>
            <ViewToggleButton :view="view" @toggle="view = view === 'table' ? 'card' : 'table'" />
          </div>

          <!-- 卡片 -->
          <div v-if="view === 'card'" class="grid gap-3 md:grid-cols-2">
            <article v-for="item in heldPageItems" :key="item.id" class="space-y-2 border-2 border-tint/10 bg-tint/5 p-3">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p class="min-w-0">
                  <button type="button" class="cursor-pointer text-left underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent text-subtitle font-semibold text-ink" :title="`${item.target.name}：編輯持股、清單`" @click="selectedId = item.id">
                    {{ item.target.name }}
                  </button>
                  <span class="ml-2 text-caption text-ink-muted">{{ item.target.code || item.target.symbol }}</span>
                </p>
                <p class="flex flex-wrap gap-1.5 text-caption">
                  <span v-if="item.quantity === 0" class="border border-tint/20 px-1.5 text-ink-muted">已出清</span>
                  <span v-if="item.projection" class="border border-tint/20 px-1.5 text-ink-muted">{{ FREQUENCY_LABELS[item.projection.frequency] }}</span>
                  <span v-if="item.dividendStatus === 'failed'" class="border border-warn/40 px-1.5 text-warn">股利資料暫時抓不到</span>
                </p>
              </div>
              <p class="text-body text-ink-soft">
                {{ formatNumber(item.quantity, 3) }} {{ unitOf(item) }}<template v-if="item.position?.avgCost">，均價 <span class="text-warn">{{ formatNumber(item.position.avgCost) }}</span></template><template v-if="item.price">，現價 {{ formatNumber(item.price) }}</template>
              </p>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-body">
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">還沒賣的</dt>
                  <dd class="tabular-nums" :class="trendClass(item.position?.unrealized)">
                    {{ signedMoney(item.position?.unrealized, item.target.market) }}
                  </dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">報酬率</dt>
                  <dd class="tabular-nums" :class="trendClass(item.position?.unrealizedPct)">{{ formatSigned(item.position?.unrealizedPct, '%') }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">已賣掉的</dt>
                  <dd class="tabular-nums" :class="trendClass(item.position?.realized)">{{ signedMoney(item.position?.realized, item.target.market) }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">已記股利</dt>
                  <dd class="tabular-nums text-ink-soft">{{ money(item.position?.dividends, item.target.market) }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">總報酬</dt>
                  <dd class="tabular-nums font-semibold" :class="trendClass(item.position?.totalReturn)">{{ signedMoney(item.position?.totalReturn, item.target.market) }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="flex items-center gap-1 text-ink-muted">平均每年<HelpTip term="xirr" /></dt>
                  <dd class="tabular-nums" :class="item.annualized?.pct == null ? 'text-caption text-ink-muted' : trendClass(item.annualized.pct)">{{ annualizedText(item.annualized) }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="text-ink-muted">一年股利</dt>
                  <dd class="tabular-nums text-accent">{{ money(item.projection?.annualNet, item.target.market) }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="flex items-center gap-1 text-ink-muted">成本殖利率<HelpTip term="yieldOnCost" /></dt>
                  <dd class="tabular-nums text-ink-soft">{{ pctText(item.yieldOnCost) }}</dd>
                </div>
                <div class="flex justify-between gap-2">
                  <dt class="flex items-center gap-1 text-ink-muted">現價殖利率<HelpTip term="currentYield" /></dt>
                  <dd class="tabular-nums text-ink-soft">{{ pctText(item.currentYield) }}</dd>
                </div>
              </dl>
            </article>
          </div>

          <!-- 表格：手機欄位放不下，表格自己橫向捲動 -->
          <div v-else class="overflow-x-auto border-2 border-tint/10">
            <table class="w-full min-w-[70rem] text-left text-body tabular-nums">
              <thead class="bg-tint/5 text-caption text-ink-muted">
                <tr>
                  <th class="px-3 py-2 font-normal">股票</th>
                  <th class="px-3 py-2 text-right font-normal">張／股數</th>
                  <th class="px-3 py-2 text-right font-normal">均價</th>
                  <th class="px-3 py-2 text-right font-normal">投入成本</th>
                  <th class="px-3 py-2 text-right font-normal">市值</th>
                  <th class="px-3 py-2 text-right font-normal">還沒賣的</th>
                  <th class="px-3 py-2 text-right font-normal">已賣掉的</th>
                  <th class="px-3 py-2 text-right font-normal">已記股利</th>
                  <th class="px-3 py-2 text-right font-normal">總報酬</th>
                  <th class="px-3 py-2 text-right font-normal"><span class="inline-flex items-center gap-1">平均每年<HelpTip term="xirr" /></span></th>
                  <th class="px-3 py-2 text-right font-normal">一年股利</th>
                  <th class="px-3 py-2 text-right font-normal"><span class="inline-flex items-center gap-1">成本殖利率<HelpTip term="yieldOnCost" /></span></th>
                  <th class="px-3 py-2 text-right font-normal"><span class="inline-flex items-center gap-1">現價殖利率<HelpTip term="currentYield" /></span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in heldPageItems" :key="item.id" class="border-t border-tint/10">
                  <td class="max-w-[14em] px-3 py-2">
                    <button type="button" class="cursor-pointer text-left underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent block max-w-full truncate text-ink" :title="`${item.target.name}：編輯持股、清單`" @click="selectedId = item.id">
                      {{ item.target.name }}
                    </button>
                    <span class="block text-caption text-ink-muted">
                      {{ item.target.code || item.target.symbol }}<template v-if="item.projection">．{{ FREQUENCY_LABELS[item.projection.frequency] }}</template><template v-if="item.quantity === 0">．已出清</template>
                      <span v-if="item.dividendStatus === 'failed'" class="text-warn">．股利資料抓不到</span>
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 text-right text-ink-soft">{{ formatNumber(item.quantity, 3) }} {{ unitOf(item) }}</td>
                  <td class="px-3 py-2 text-right text-warn">{{ item.position?.avgCost ? formatNumber(item.position.avgCost) : '—' }}</td>
                  <td class="px-3 py-2 text-right text-ink-soft">{{ money(item.position?.costBasis, item.target.market) }}</td>
                  <td class="px-3 py-2 text-right text-ink-soft">{{ money(item.position?.marketValue, item.target.market) }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right" :class="trendClass(item.position?.unrealized)">
                    {{ signedMoney(item.position?.unrealized, item.target.market) }}
                    <span class="block text-caption">{{ formatSigned(item.position?.unrealizedPct, '%') }}</span>
                  </td>
                  <td class="px-3 py-2 text-right" :class="trendClass(item.position?.realized)">{{ signedMoney(item.position?.realized, item.target.market) }}</td>
                  <td class="px-3 py-2 text-right text-ink-soft">{{ money(item.position?.dividends, item.target.market) }}</td>
                  <td class="px-3 py-2 text-right font-semibold" :class="trendClass(item.position?.totalReturn)">{{ signedMoney(item.position?.totalReturn, item.target.market) }}</td>
                  <td class="whitespace-nowrap px-3 py-2 text-right" :class="item.annualized?.pct == null ? 'text-caption text-ink-muted' : trendClass(item.annualized.pct)">{{ annualizedText(item.annualized) }}</td>
                  <td class="px-3 py-2 text-right text-accent">{{ money(item.projection?.annualNet, item.target.market) }}</td>
                  <td class="px-3 py-2 text-right text-ink-soft">{{ pctText(item.yieldOnCost) }}</td>
                  <td class="px-3 py-2 text-right text-ink-soft">{{ pctText(item.currentYield) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ListPager v-model:page="heldPage" v-model:page-size="heldPageSize" :total="heldTotal" />
          <p class="text-caption text-ink-muted">台股金額是元、美股是美元。「還沒賣的」已經扣掉現在賣出要付的手續費與稅。</p>
        </section>

        <!-- ── 應收股利對照（v20 階段 4）── -->
        <!-- 可以收合（2026-11-10 使用者：功能好但太佔空間）：預設收起、記住開關；收起時標題列仍看得到筆數，也能直接全部帶入 -->
        <section v-if="entitlementRows.length" class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="flex items-center gap-1 text-body text-ink-muted">
              <button
                type="button"
                class="flex cursor-pointer items-center gap-1 text-left transition hover:text-ink"
                :aria-expanded="entitlementOpen"
                @click="entitlementOpen = !entitlementOpen"
              >
                <span class="inline-block transition" :class="entitlementOpen ? 'rotate-90' : ''" aria-hidden="true">▸</span>
                持有期間應該領到、但還沒記錄的股利
                <span v-if="pendingCount" class="tabular-nums text-accent">（{{ entitlementRows.length }} 檔、{{ pendingCount }} 筆）</span>
              </button>
              <HelpTip term="entitlement" />
            </p>
            <div class="flex flex-wrap gap-2">
            <button
              v-if="importableCount"
              type="button"
              class="cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-3 py-1 text-button text-accent transition hover:bg-accent-hue/25 active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="importing !== ''"
              @click="importAll"
            >
              {{ importing === 'all' ? '帶入中…' : `全部帶入（${importableCount} 筆）` }}
            </button>
            <button
              v-if="pendingCount"
              type="button"
              class="cursor-pointer border-2 border-danger-hue/40 px-3 py-1 text-button text-danger transition hover:bg-danger-hue/10 active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="importing !== ''"
              @click="confirmDismiss(entitlementRows, 'dismiss-all')"
            >
              {{ importing === 'dismiss-all' ? '刪除中…' : '全部刪除' }}
            </button>
            </div>
          </div>
          <p v-if="importError" class="text-body text-danger">{{ importError }}</p>

          <template v-if="entitlementOpen">
          <div v-for="row in entitlementPageRows" :key="row.item.id" class="space-y-1.5 border-2 border-tint/10 bg-tint/5 px-3 py-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <button
                type="button"
                class="cursor-pointer text-left text-subtitle font-semibold text-ink underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent"
                @click="selectedId = row.item.id"
              >
                {{ row.item.target.name }}
              </button>
              <div class="flex flex-wrap gap-1.5">
              <button
                v-if="row.importable.length > 1"
                type="button"
                class="cursor-pointer border border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                :disabled="importing !== ''"
                @click="importEvents(row.item, row.importable, `item:${row.item.id}`)"
              >
                {{ importing === `item:${row.item.id}` ? '帶入中…' : `這檔全部帶入（${row.importable.length}）` }}
              </button>
              <button
                v-if="row.pending.length > 1"
                type="button"
                class="cursor-pointer border border-danger-hue/40 px-2 py-0.5 text-button text-danger transition hover:bg-danger-hue/10 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                :disabled="importing !== ''"
                @click="confirmDismiss([row], `dismiss-item:${row.item.id}`)"
              >
                {{ importing === `dismiss-item:${row.item.id}` ? '刪除中…' : `這檔全部刪除（${row.pending.length}）` }}
              </button>
              </div>
            </div>

            <p v-if="!row.item.entitlement?.available" class="text-body text-ink-muted">
              {{ ENTITLEMENT_REASONS[row.item.entitlement?.reason ?? ''] ?? '目前算不出應收股利。' }}
            </p>
            <p v-if="row.item.entitlement?.splitWarning" class="text-body text-warn">
              持有期間 {{ row.item.entitlement.splitWarning.date }} 股票分割過（1 股變 {{ formatNumber(row.item.entitlement.splitWarning.ratio, 4) }} 股），買賣紀錄的張數可能要自己調整。
            </p>

            <ul v-if="row.pending.length" class="divide-y divide-tint/10 text-body">
              <li v-for="event in row.pending" :key="`${event.type}:${event.exDate}`" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
                <!-- 手機兩行；平板以上日期、類別、算式排成一行 -->
                <div class="min-w-0 space-y-0.5 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:space-y-0">
                  <p class="flex flex-wrap items-baseline gap-x-2">
                    <span class="tabular-nums text-ink-soft">{{ event.exDate }}</span>
                    <span class="border px-1.5 text-caption" :class="event.type === 'cash' ? 'border-accent-hue/40 text-accent' : 'border-warn/40 text-warn'">
                      {{ event.type === 'cash' ? '現金股利' : '配股' }}
                    </span>
                    <span v-if="event.recorded === 'maybe'" class="text-caption text-warn">可能已記錄</span>
                  </p>
                  <p v-if="event.type === 'cash'" class="text-caption text-ink-muted">
                    持有 {{ formatNumber(event.shares, 0) }} 股 × 每股 {{ formatNumber(event.perShare, 4) }}
                    <template v-if="event.deduction">，扣 {{ money(event.deduction, row.item.target.market) }}</template>
                    ＝ <span class="tabular-nums text-accent">{{ money(event.net, row.item.target.market) }}</span>
                  </p>
                  <p v-else class="text-caption text-ink-muted">
                    持有 {{ formatNumber(event.shares, 0) }} 股，每股配 {{ formatNumber(event.ratio, 4) }} 股 ＝
                    <span class="tabular-nums text-warn">{{ formatNumber(event.addShares, 0) }} 股</span>（成本 0）
                  </p>
                  <p v-if="event.recorded === 'maybe' && matchedDividend(row.item, event)" class="text-caption text-ink-muted">
                    你記過一筆 {{ matchedDividend(row.item, event)!.date }} 的 {{ money(matchedDividend(row.item, event)!.amount, row.item.target.market) }}，可能就是這次。
                  </p>
                </div>
                <div class="flex shrink-0 gap-1.5">
                  <button
                    v-if="event.recorded === 'maybe'"
                    type="button"
                    class="cursor-pointer border border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                    :disabled="importing !== ''"
                    @click="linkEvent(row.item, event)"
                  >
                    {{ importing === `link:${row.item.id}:${event.exDate}` ? '更新中…' : '是同一筆' }}
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer border border-accent-hue/40 px-2 py-0.5 text-button text-accent transition hover:bg-accent-hue/15 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                    :disabled="importing !== ''"
                    @click="importEvents(row.item, [event], `one:${row.item.id}:${event.type}:${event.exDate}`)"
                  >
                    {{ importing === `one:${row.item.id}:${event.type}:${event.exDate}` ? '帶入中…' : event.recorded === 'maybe' ? '另外帶入' : '帶入' }}
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer border border-danger-hue/40 px-2 py-0.5 text-button text-danger transition hover:bg-danger-hue/10 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                    :disabled="importing !== ''"
                    :aria-label="`刪除 ${event.exDate} 這筆應收股利`"
                    @click="confirmDismiss([{ item: row.item, pending: [event] }], `dismiss-one:${row.item.id}:${event.type}:${event.exDate}`)"
                  >
                    {{ importing === `dismiss-one:${row.item.id}:${event.type}:${event.exDate}` ? '刪除中…' : '刪除' }}
                  </button>
                </div>
              </li>
            </ul>
            <p v-if="row.recordedCount || row.dismissedCount" class="text-caption text-ink-muted">
              <template v-if="row.recordedCount">另有 {{ row.recordedCount }} 次已經記錄過。</template>
              <template v-if="row.dismissedCount">{{ row.dismissedCount }} 次你刪掉了（要記請點股票名稱手動加）。</template>
            </p>
          </div>
          <ListPager v-model:page="entitlementPage" v-model:page-size="entitlementPageSize" :total="entitlementTotal" />
          <p class="text-caption text-ink-muted">
            依你填的買賣日期，算除息前一天的持股。帶入的現金股利入帳日先填除息日、金額是扣款後的預估，實際入帳和券商不同時點股票名稱修改。
          </p>
          </template>
        </section>

        <!-- ── 還沒持股的：每張一年約領多少 ── -->
        <section v-if="watching.length" class="space-y-2">
          <p class="text-body text-ink-muted">還沒買的（{{ watching.length }}）：每持有 1 張（美股 1 股）一年大約能領多少（未扣款）</p>
          <ul class="divide-y divide-tint/10 border-2 border-tint/10 text-body">
            <li v-for="item in watchingPageItems" :key="item.id" class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
              <span class="min-w-0">
                <button type="button" class="cursor-pointer text-left underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent text-ink" :title="`${item.target.name}：記錄買進、改清單`" @click="selectedId = item.id">
                  {{ item.target.name }}
                </button>
                <span class="ml-2 text-caption text-ink-muted">
                  {{ item.target.code || item.target.symbol }}<template v-if="item.projection">．{{ FREQUENCY_LABELS[item.projection.frequency] }}</template>
                </span>
              </span>
              <span v-if="item.dividendStatus === 'failed'" class="text-caption text-warn">股利資料暫時抓不到</span>
              <span v-else class="tabular-nums text-ink-soft">
                <span class="text-accent">{{ money(item.projection?.annualPerUnit, item.target.market) }}</span>
                {{ item.target.market === 'tw' ? '元' : '美元' }}／{{ item.target.market === 'tw' ? '張' : '股' }}
                <span class="ml-2 text-ink-muted">現價殖利率 {{ pctText(item.currentYield) }}</span>
              </span>
            </li>
          </ul>
          <ListPager v-model:page="watchingPage" v-model:page-size="watchingPageSize" :total="watchingTotal" />
        </section>

        <!-- ── 年度報表與 CSV（v20 階段 9）── -->
        <IncomeYearReport :items="items" :pending-dividends="pendingCount" />

      </template>
    </template>
    <!-- 一檔的詳細：編輯持股（沿用自訂追蹤的 MarketHoldings）、勾選清單、移除追蹤 -->
    <WatchItemDialog v-if="selectedItem" :title="`${selectedItem.target.name} · 持股與清單`" @close="selectedId = null">
      <div class="space-y-4">
        <p class="flex flex-wrap items-baseline gap-x-3 text-body">
          <span class="text-subtitle font-semibold text-ink">{{ selectedItem.target.name }}</span>
          <span class="text-caption text-ink-muted">{{ selectedItem.target.code || selectedItem.target.symbol }}</span>
          <span v-if="selectedItem.price" class="tabular-nums text-ink-soft">現價 {{ formatNumber(selectedItem.price) }}</span>
        </p>

        <MarketHoldings v-if="holdingsItem" v-model:editing="editingHoldings" :item="holdingsItem" />
        <p v-else class="text-body text-ink-muted">
          後端還是舊版，這裡不能編輯持股，請到
          <router-link :to="{ query: { tab: 'watch' } }" class="text-warn hover:underline" @click="selectedId = null">自訂股票追蹤</router-link>
          編輯。
        </p>

        <!-- 清單：一檔可以放進好幾個；拿掉只是不放在那個清單，紀錄不會刪 -->
        <section v-if="groups.length" class="space-y-2">
          <p class="text-body text-ink-muted">放在哪些清單</p>
          <div class="flex flex-wrap gap-1.5">
            <CheckboxField
              v-for="option in groups"
              :key="option.id"
              :model-value="(selectedItem.groups ?? []).includes(option.id)"
              :disabled="movingGroup !== ''"
              class="border border-tint/15 px-2.5 py-1 text-body"
              @update:model-value="toggleItemGroup(selectedItem, option.id)"
            >
              {{ option.name }}{{ movingGroup === option.id ? '（更新中…）' : '' }}
            </CheckboxField>
          </div>
        </section>

        <p v-if="dialogError" class="text-body text-danger">{{ dialogError }}</p>

        <div class="border-t border-tint/10 pt-3">
          <button
            type="button"
            class="cursor-pointer border-2 border-danger-hue/40 bg-danger-hue/10 px-3 py-1.5 text-button text-danger transition hover:bg-danger-hue/20 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
            :disabled="removingItem"
            @click="removeItem(selectedItem)"
          >
            {{ removingItem ? '移除中…' : '移除追蹤' }}
          </button>
        </div>
      </div>
    </WatchItemDialog>
  </section>
</template>
