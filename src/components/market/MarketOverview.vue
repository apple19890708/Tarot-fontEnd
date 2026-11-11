<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'

import { fetchMarketOverview, fetchMarketSettings, fetchWatchlist, saveMarketDashboard } from '../../lib/api'
import { confirmDialog } from '../../lib/confirm'
import {
  BLOCK_LABELS,
  BREADTH_KEYS,
  CARD_BLOCKS,
  DEFAULT_HIGHLIGHTS,
  HIGHLIGHT_MAX,
  MACRO_KEYS,
  PERSONAL_BLOCKS,
  SECTOR_TOP_OPTIONS,
  defaultBlocks,
  isDefaultLayout,
  resolveBlocks,
} from '../../lib/marketDashboard'
import { usePointerReorder } from '../../lib/usePointerReorder'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { watchlistVersion } from '../../lib/watchlistSync'
import { useCooldown } from '../../lib/useCooldown'
import HelpTip from '../HelpTip.vue'
import RefreshButton from '../RefreshButton.vue'
import ViewToggleButton from '../ViewToggleButton.vue'
import CheckboxField from '../CheckboxField.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import EditToggleButton from '../EditToggleButton.vue'
import DashboardCardPicker from './DashboardCardPicker.vue'
import DashboardNews from './DashboardNews.vue'
import DashboardPicks from './DashboardPicks.vue'
import DashboardWatchList from './DashboardWatchList.vue'
import MarketChips from './MarketChips.vue'
import MarketQuoteDialog from './MarketQuoteDialog.vue'
import MarketSparkline from './MarketSparkline.vue'
import type { DailyPickType, DashboardBlock, MarketBreadth, MarketFuturesQuote, MarketIndexCard, MarketOverview, MarketWatchGroup, MarketWatchItem } from '../../types'

// 股市總覽（原「大盤概況」）：主要指數、漲跌家數、類股漲跌熱力圖、三大法人、美股與匯率。資料由後端整理（快取 10 分鐘）。
// 區塊的順序與顯示由使用者自己排（v19 計畫書），存在帳號裡
const overview = ref<MarketOverview | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  if (!overview.value) status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchMarketOverview()
    if (id !== requestId) return
    overview.value = result.overview
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '股市總覽暫時讀不到。'
    if (!overview.value) status.value = 'error'
  }
}
// 手動更新：按完 30 秒內不能再按（後端也有 10 分鐘快取）
const cooldown = useCooldown(30, 'market-overview-refresh')
// 已經有資料時 load() 不會進入 loading（畫面不換成骨架），按鈕要自己知道「更新中」
const refreshing = ref(false)
const refresh = () =>
  cooldown.run(async () => {
    refreshing.value = true
    try {
      // 追蹤清單（自選清單、持股、重點卡上的個股）抓過的話一起更新
      if (watchLoaded) void loadWatch(true)
      await load()
    } finally {
      refreshing.value = false
    }
  })

// ---- 版面（v19）：區塊的順序與顯示。編輯時改 draft（畫面即時預覽），按「確認」才存 ----
const blocks = ref<DashboardBlock[]>(defaultBlocks())
const editing = ref(false)
const draft = ref<DashboardBlock[]>([])
const savingLayout = ref(false)
const layoutError = ref('')

async function loadLayout() {
  try {
    const result = await fetchMarketSettings()
    blocks.value = resolveBlocks(result.dashboard)
  } catch {
    // 版面讀不到就用預設的，不影響大盤資料
  }
}
// ---- 單一區塊的設定（卡片、熱力圖數量）：在區塊標題旁按筆就地編輯，按勾勾存（使用者要求放在各區塊，不放在調整區塊的清單）----
const blockEditing = ref<DashboardBlock | null>(null)
const savingBlock = ref(false)
const blockError = ref('')

// 正在編輯的那一塊用編輯中的設定畫（即時預覽）
const shownBlocks = computed(() =>
  (editing.value ? draft.value : blocks.value)
    .map((block) => (blockEditing.value?.type === block.type ? blockEditing.value : block))
    .filter((block) => block.visible),
)

function startEdit() {
  // 區塊設定和整體排列一次只開一個
  blockEditing.value = null
  draft.value = blocks.value.map((block) => ({ ...block, options: { ...block.options } }))
  layoutError.value = ''
  editing.value = true
}
function cancelEdit() {
  editing.value = false
  layoutError.value = ''
}
function moveBlock(from: number, to: number) {
  if (to < 0 || to >= draft.value.length) return
  const list = [...draft.value]
  const [moved] = list.splice(from, 1)
  if (moved) list.splice(to, 0, moved)
  draft.value = list
}
// 拖曳排序（滑鼠、手指都能用；把手按上下方向鍵也可以）
// 列表外面包一層 div 拿 ref：TransitionGroup 本身的 ref 是元件不是元素
const blockListWrap = ref<HTMLElement | null>(null)
const blockListEl = computed(() => (blockListWrap.value?.firstElementChild as HTMLElement | null) ?? null)
const reorder = usePointerReorder(blockListEl, moveBlock, () => draft.value.length)
function toggleBlock(index: number) {
  draft.value = draft.value.map((block, i) => (i === index ? { ...block, visible: !block.visible } : block))
}
async function resetLayout() {
  const ok = await confirmDialog({
    title: '恢復預設版面',
    message: '區塊的順序和顯示會回到原本的樣子（按「確認」後才會儲存）。',
    confirmText: '恢復預設',
  })
  if (ok) draft.value = defaultBlocks()
}
async function saveLayout() {
  savingLayout.value = true
  layoutError.value = ''
  try {
    // 和預設一樣就存 null：之後預設版面改了也會跟著
    await saveMarketDashboard(isDefaultLayout(draft.value) ? null : { blocks: draft.value })
    blocks.value = draft.value
    editing.value = false
  } catch (err) {
    layoutError.value = err instanceof Error ? err.message : '版面存不起來，請稍後再試。'
  } finally {
    savingLayout.value = false
  }
}

onMounted(() => {
  void load()
  void loadLayout()
})
// 放在 KeepAlive 裡：切回這個分頁時更新（後端有快取，不會一直打外部來源）。
// 追蹤清單在別的分頁改過（版本號變了，見 lib/watchlistSync.ts）才重抓，沒變就不多打一次
let first = true
onActivated(() => {
  if (first) {
    first = false
    return
  }
  void load()
  if (watchLoaded && watchSeen !== watchlistVersion.value) void loadWatch(true)
})

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

// 熱力圖：漲紅跌綠，幅度越大顏色越深
function heatClass(pct: number) {
  if (pct >= 3) return 'bg-up-hue-3/55 text-up-pale'
  if (pct >= 1.5) return 'bg-up-hue-3/35 text-up-pale'
  if (pct > 0) return 'bg-up-hue-2/15 text-up-ink'
  if (pct === 0) return 'bg-tint/5 text-ink-muted'
  if (pct > -1.5) return 'bg-down-hue-2/15 text-down-ink'
  if (pct > -3) return 'bg-down-hue-3/35 text-down-pale'
  return 'bg-down-hue-3/55 text-down-pale'
}

const BREADTH_LABELS = { tse: '上市', otc: '上櫃' } as const
function breadthParts(b: MarketBreadth) {
  const total = b.up + b.down + b.flat || 1
  return [
    { key: 'up', label: '上漲', count: b.up, pct: (b.up / total) * 100, bar: 'bg-up-hue-2/70', text: 'text-up' },
    { key: 'flat', label: '平盤', count: b.flat, pct: (b.flat / total) * 100, bar: 'bg-ink-muted/50', text: 'text-ink-muted' },
    { key: 'down', label: '下跌', count: b.down, pct: (b.down / total) * 100, bar: 'bg-down-hue-2/70', text: 'text-down' },
  ]
}

const sectorDate = computed(() => overview.value?.sectors[0]?.date ?? null)
const priceDigits = (card: MarketIndexCard) => (card.symbol === 'TWD=X' ? 3 : 2)

// ---- 重點卡：使用者從卡片池挑（v19 階段 2），預設是加權、櫃買、台指期夜盤、那斯達克、費半、美元兌台幣 ----
// 下面各區塊照樣完整顯示，這裡只是把最常看的幾個拉到最上面；某一張抓不到就少一張
type Highlight = {
  key: string
  name: string
  price: number | null
  digits: number
  change: number | null
  changePct: number | null
  // 卡片下方的小字：盤中／收盤日期、夜盤的合約與時間
  note: string
  // 點開走勢彈窗用：指數與匯率給 symbol（櫃買指數是後端給的 chartSymbol）；台指期夜盤給 futures（期交所分鐘走勢）；
  // 兩個都沒有（舊版後端的櫃買指數）就不能點
  symbol: string | null
  futures: MarketFuturesQuote | null
}

// 點了哪一張重點卡（開走勢彈窗）
const opened = ref<Highlight | null>(null)

const shortDay = (date: string | null) => (date ? date.slice(5).replace('-', '/') : '')

// 自己的追蹤清單（v19）：重點卡的個股、自選清單、持股總覽共用一份。只有用得到（版面有這些區塊、或正在編輯）時才去抓
const watchItems = ref<MarketWatchItem[]>([])
const watchGroups = ref<MarketWatchGroup[]>([])
// 追蹤清單還沒抓到（自選清單、持股總覽先放骨架）
const watchReady = ref(false)
// 抓失敗的原因：沒有資料時在自選清單區塊顯示＋重試（以前失敗只重設旗標，骨架會永遠轉下去）
const watchError = ref('')
const watchRetrying = ref(false)
let watchLoaded = false
let watchRequestId = 0
// 這份清單資料對應的版本號（抓的當下記下來）
let watchSeen = -1
// force：已經抓過也重抓（切回這個分頁、按更新）。清單可能在「自訂股票追蹤」被改過，
// 以前只抓一次，刪掉的股票要整頁重新整理才會消失。重抓時舊資料先留著，不換回骨架
async function loadWatch(force = false) {
  if (watchLoaded && !force) return
  watchLoaded = true
  watchSeen = watchlistVersion.value
  const id = ++watchRequestId
  try {
    const result = await fetchWatchlist()
    if (id !== watchRequestId) return
    watchItems.value = result.items
    watchGroups.value = result.groups ?? []
    watchReady.value = true
    watchError.value = ''
  } catch (error) {
    if (id !== watchRequestId) return
    // 已經有資料時重抓失敗就繼續顯示舊的，下次切回來或按更新再試
    if (watchReady.value) return
    watchLoaded = false
    watchError.value = error instanceof Error ? error.message : '自選清單暫時讀不到。'
  }
}
// 重試也有短冷卻，避免後端還在重啟時被連續按
const watchRetryCooldown = useCooldown(5)
const retryWatch = () =>
  watchRetryCooldown.run(async () => {
    watchRetrying.value = true
    try {
      await loadWatch()
    } finally {
      watchRetrying.value = false
    }
  })
const needWatch = computed(
  () =>
    editing.value ||
    blockEditing.value !== null ||
    blocks.value.some((block) => block.visible && block.type === 'watchGroup'),
)
watch(needWatch, (need) => need && void loadWatch(), { immediate: true })

// 卡片池：id → 卡片。指數與匯率用代號（櫃買指數用 chartSymbol），台指期夜盤 txf-night
const highlightPool = computed(() => {
  const pool = new Map<string, Highlight>()
  const o = overview.value
  const fromCard = (card: MarketIndexCard, key: string): Highlight => ({
    key,
    name: card.name,
    price: card.price,
    digits: priceDigits(card),
    change: card.change,
    changePct: card.changePct,
    note: card.session === 'intraday' ? '盤中' : `收盤 ${shortDay(card.date)}`,
    symbol: card.symbol ?? card.chartSymbol ?? null,
    futures: null,
  })
  if (o) {
    for (const card of o.tw) pool.set(card.symbol ?? card.chartSymbol ?? card.name, fromCard(card, card.symbol ?? card.chartSymbol ?? card.name))
    const night = o.futures?.night
    if (night) {
      pool.set('txf-night', {
        key: 'txf-night',
        name: '台指期夜盤',
        price: night.price,
        digits: 0,
        change: night.change,
        changePct: night.changePct,
        note: [night.contract, night.date && `${shortDay(night.date)} ${night.time?.slice(0, 5) ?? ''}`].filter(Boolean).join('・'),
        symbol: null,
        futures: night,
      })
    }
    for (const card of o.us) if (card.symbol) pool.set(card.symbol, fromCard(card, card.symbol))
  }
  // 追蹤的個股不放進重點卡（使用者決定：和下面的「自選清單」區塊重複）。
  // 以前存過的 watch:<id> 在這裡找不到，畫面上不顯示，下次儲存重點卡時一起拿掉
  return pool
})
// 挑卡片時的分組：台股（加權、櫃買、台指期夜盤，加上和台股資金最相關的美元兌台幣），其他都是美股
const TW_HIGHLIGHT_EXTRA = new Set(['txf-night', 'TWD=X'])
function highlightGroup(key: string) {
  const tw = overview.value?.tw.some((card) => (card.symbol ?? card.chartSymbol ?? card.name) === key)
  return tw || TW_HIGHLIGHT_EXTRA.has(key) ? '台股' : '美股'
}
const highlightsOf = (block: DashboardBlock) =>
  (block.options.cards ?? DEFAULT_HIGHLIGHTS).map((id) => highlightPool.value.get(id)).filter((item): item is Highlight => !!item)
// 重點卡的欄數跟著張數：桌機一排排滿（最多 8），手機兩欄
const HIGHLIGHT_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  8: 'lg:grid-cols-8',
}
const highlightGrid = (count: number) => `${count % 3 === 0 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} ${HIGHLIGHT_COLS[count] ?? 'lg:grid-cols-6'}`

const canOpen = (item: Highlight) => !!(item.symbol || item.futures)

// ---- 美國總經數據：通膨看年增率（和上個月的年增率比，升溫或降溫），非農看新增人數 ----
const monthText = (month: string) => `${Number(month.slice(5, 7))} 月`
// 千人 → 萬人：165 → +16.5 萬人
const jobsText = (thousands: number) => `${thousands > 0 ? '+' : ''}${formatNumber(thousands / 10, 1)} 萬人`

// 通膨升溫不是「漲」的好事，不用紅綠（紅綠在這裡代表股價漲跌），用琥珀＝升溫、天藍＝降溫
function inflationTrend(yoy: number, prevYoy: number) {
  if (yoy > prevYoy) return { label: '升溫', class: 'text-warn' }
  if (yoy < prevYoy) return { label: '降溫', class: 'text-info' }
  return { label: '持平', class: 'text-ink-muted' }
}

const macroOf = (block: DashboardBlock) =>
  (block.options.cards ?? MACRO_KEYS).map((key) => overview.value?.macro?.find((item) => item.key === key)).filter((item) => !!item)
const breadthOf = (block: DashboardBlock) =>
  (block.options.cards ?? [...BREADTH_KEYS]).filter((key): key is (typeof BREADTH_KEYS)[number] => (BREADTH_KEYS as readonly string[]).includes(key))
// 熱力圖只看前 N 個：漲跌幅絕對值最大的，再照漲到跌排
const sectorsOf = (block: DashboardBlock) => {
  const all = overview.value?.sectors ?? []
  if (!block.options.top) return all
  return [...all]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, block.options.top)
    .sort((a, b) => b.changePct - a.changePct)
}

// 美股區塊分組；舊版後端沒有 group 時全部放在第一組
const US_GROUPS: { key: NonNullable<MarketIndexCard['group']>; title: string }[] = [
  { key: 'index', title: '美股主要指數' },
  { key: 'tw', title: '和台股最相關' },
  { key: 'mood', title: '市場情緒、利率與美元' },
]
const usGroups = computed(() =>
  US_GROUPS.map((group, index) => ({
    ...group,
    cards: (overview.value?.us ?? []).filter((card) => (card.group ?? 'index') === group.key || (index === 0 && !card.group)),
  })).filter((group) => group.cards.length),
)
// 自己挑過美股卡片就不分組，照挑的順序排成一片
const usGroupsOf = (block: DashboardBlock) => {
  if (!block.options.cards) return usGroups.value
  const cards = block.options.cards
    .map((symbol) => overview.value?.us.find((card) => card.symbol === symbol))
    .filter((card): card is MarketIndexCard => !!card)
  return cards.length ? [{ key: 'custom', title: '', cards }] : []
}

// ---- 編輯時的卡片挑選（v19 階段 2）----
// 每個區塊能挑的卡片（資料要先載入；個股要等追蹤清單）
function poolOf(type: DashboardBlock['type']) {
  const o = overview.value
  if (type === 'highlights')
    // 台股排在前面，各組裡照原本的順序
    return [...highlightPool.value.values()]
      .map((item) => ({ id: item.key, label: item.name, group: highlightGroup(item.key) }))
      .sort((a, b) => Number(a.group !== '台股') - Number(b.group !== '台股'))
  if (type === 'macro') return (o?.macro ?? []).map((item) => ({ id: item.key, label: item.name }))
  if (type === 'breadth') return BREADTH_KEYS.map((key) => ({ id: key, label: `${BREADTH_LABELS[key]}漲跌家數` }))
  if (type === 'us') return (o?.us ?? []).filter((card) => card.symbol).map((card) => ({ id: card.symbol as string, label: card.name }))
  return []
}
function cardsOf(block: DashboardBlock) {
  if (block.options.cards) return block.options.cards
  if (block.type === 'highlights') return DEFAULT_HIGHLIGHTS
  if (block.type === 'macro') return MACRO_KEYS
  if (block.type === 'breadth') return [...BREADTH_KEYS]
  return (overview.value?.us ?? []).map((card) => card.symbol).filter((symbol): symbol is string => !!symbol)
}
function setCards(cards: string[]) {
  if (!blockEditing.value) return
  blockEditing.value = { ...blockEditing.value, options: { ...blockEditing.value.options, cards } }
}
function setTop(top: number | null) {
  if (!blockEditing.value) return
  const options = { ...blockEditing.value.options }
  if (top) options.top = top
  else delete options.top
  blockEditing.value = { ...blockEditing.value, options }
}
function startBlockEdit(block: DashboardBlock) {
  if (editing.value) cancelEdit()
  blockEditing.value = { ...block, options: { ...block.options } }
  blockError.value = ''
}
function cancelBlockEdit() {
  blockEditing.value = null
  blockError.value = ''
}
async function saveBlockEdit() {
  const edited = blockEditing.value
  if (!edited) return
  const next = blocks.value.map((block) => (block.type === edited.type ? edited : block))
  savingBlock.value = true
  blockError.value = ''
  try {
    await saveMarketDashboard(isDefaultLayout(next) ? null : { blocks: next })
    blocks.value = next
    blockEditing.value = null
  } catch (err) {
    blockError.value = err instanceof Error ? err.message : '設定存不起來，請稍後再試。'
  } finally {
    savingBlock.value = false
  }
}
const isBlockEditing = (block: DashboardBlock) => blockEditing.value?.type === block.type

// 推薦類型、卡片／表格：在區塊上直接切，切了就存（不用進編輯）。正在客製化區塊或編輯這一塊時，一起改進草稿，按「確認」或勾勾時才不會被蓋回去
async function setPickType(block: DashboardBlock, pickType: DailyPickType) {
  await setBlockOptions(block, { pickType })
}
async function setBlockOptions(block: DashboardBlock, patch: Partial<DashboardBlock['options']>) {
  const apply = (list: DashboardBlock[]) =>
    list.map((b) => (b.type === block.type ? { ...b, options: { ...b.options, ...patch } } : b))
  if (editing.value) draft.value = apply(draft.value)
  if (blockEditing.value?.type === block.type) blockEditing.value = { ...blockEditing.value, options: { ...blockEditing.value.options, ...patch } }
  const next = apply(blocks.value)
  blocks.value = next
  try {
    await saveMarketDashboard(isDefaultLayout(next) ? null : { blocks: next })
  } catch {
    // 存不起來也照樣切換畫面；下次打開會回到原本的類型
  }
}

// 自選清單區塊：指定的清單（找不到，例如被刪了，就用第一個）與裡面的股票（照自訂順序）
function watchGroupOf(block: DashboardBlock) {
  const group = watchGroups.value.find((g) => g.id === block.options.group) ?? watchGroups.value[0] ?? null
  const items = group
    ? watchItems.value
        .filter((item) => (item.groups ?? (item.group ? [item.group] : [])).includes(group.id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : []
  return { group, items }
}
function setGroup(group: string | null) {
  if (!blockEditing.value) return
  const options = { ...blockEditing.value.options }
  if (group) options.group = group
  else delete options.group
  blockEditing.value = { ...blockEditing.value, options }
}
// 區塊標題（三大法人的標題在元件裡，不另外放）
// 標題旁的「看詳細」連結（使用者要求放在標題旁，不放在區塊底部）
function blockLink(block: DashboardBlock): { tab: string; label: string } | null {
  if (block.type === 'watchGroup') return { tab: 'watch', label: '到自訂股票追蹤看詳細 ›' }
  if (block.type === 'news') return { tab: 'news', label: '到財經新聞看全部 ›' }
  return null
}
// 推薦／熱門區塊有在畫面上時，自選清單沒有清單就不再重複顯示推薦，改成一句提示
const picksShown = computed(() => shownBlocks.value.some((block) => block.type === 'picks'))

function blockTitle(block: DashboardBlock) {
  if (block.type === 'watchGroup') {
    if (!watchReady.value) return BLOCK_LABELS.watchGroup
    const { group, items } = watchGroupOf(block)
    if (group && items.length) return `自選清單：${group.name}`
    if (picksShown.value) return '自選清單'
    return group ? `推薦／熱門股票（「${group.name}」清單還是空的）` : '推薦／熱門股票（還沒有自訂清單）'
  }
  if (block.type === 'sectors') {
    const top = block.options.top ? `（漲跌最多的 ${block.options.top} 個）` : ''
    return `類股漲跌${top}${sectorDate.value ? `（${sectorDate.value} 收盤）` : ''}`
  }
  return BLOCK_LABELS[block.type]
}
// 這一塊有沒有東西可畫；卡片全拿掉時平常整塊不出現，編輯中照樣顯示（才能加回來）
// 正在編輯的區塊卡片選了 0 張：勾勾不能按（存了整塊就消失、回不來）
const blockEmpty = computed(() => {
  const block = blockEditing.value
  return !!block && CARD_BLOCKS.includes(block.type) && cardsOf(block).filter((id) => poolOf(block.type).some((card) => card.id === id)).length === 0
})
// 選過卡片、但選的都不在了（例如重點卡上的個股從追蹤清單刪掉）：不整塊藏起來，留標題和筆讓人重新挑
function lostCards(block: DashboardBlock) {
  return !!overview.value && !!block.options.cards && !hasContent(block)
}
function hasContent(block: DashboardBlock) {
  // 自己的資料各自載入、各自處理空的狀態
  if (PERSONAL_BLOCKS.includes(block.type)) return true
  const o = overview.value
  if (!o) return false
  if (block.type === 'highlights') return highlightsOf(block).length > 0
  if (block.type === 'macro') return macroOf(block).length > 0
  if (block.type === 'breadth') return !!o.breadth && breadthOf(block).length > 0
  if (block.type === 'sectors') return o.sectors.length > 0
  if (block.type === 'institutional') return !!o.institutional
  return usGroupsOf(block).length > 0
}

function timeText(value: string) {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
</script>

<template>
  <section class="space-y-5 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Market Overview</p>
        <h2 class="mt-1 text-title font-semibold text-ink">股市總覽</h2>
        <p class="mt-1 text-body text-ink-muted">
          主要指數有盤中報價；漲跌家數、類股與三大法人是最新一個交易日的收盤資料（證交所、櫃買中心公開資料）。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- 客製化區塊（排序、顯示）：平常是筆＋「客製化區塊」；調整中這個位置換成「恢復預設」，儲存的「確認」在清單下面（使用者要求兩者互換） -->
        <EditToggleButton v-if="!editing" :active="false" label="客製化區塊" text="客製化區塊" @click="startEdit" />
        <button
          v-else
          type="button"
          class="cursor-pointer border-2 border-tint/15 px-3 py-1 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
          @click="resetLayout"
        >
          恢復預設
        </button>
        <RefreshButton label="更新" :loading="status === 'loading' || refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
      </div>
    </div>

    <!-- 編輯版面：每個區塊可以上下移、顯示或隱藏；下面的內容即時照著排（預覽），按下面的「確認」才儲存 -->
    <div v-if="editing" class="space-y-3 border-2 border-ok-hue/30 bg-ok-hue/[0.04] p-3 sm:p-4">
      <p class="text-body text-ink">
        客製化區塊
        <span class="ml-1 text-caption text-ink-muted">按住左邊的把手上下拖曳排順序，隱藏的區塊不會出現；下面的畫面會跟著變，按「確認」儲存。</span>
      </p>
      <!-- 換位置的動畫：TransitionGroup 的 FLIP（列滑到新位置，不是瞬間跳過去）；拖著的那一列稍微浮起來（放大、陰影）。
           transition 要包含 transform（FLIP 用）與 scale（Tailwind 4 的 scale 是獨立屬性）；減少動態時都不動 -->
      <div ref="blockListWrap">
      <TransitionGroup tag="ol" class="space-y-1.5" move-class="z-10">
        <li
          v-for="(block, index) in draft"
          :key="block.type"
          class="relative border-2 px-2 py-1.5 transition-[background-color,border-color,box-shadow,transform,scale] duration-200 ease-out motion-reduce:transition-none"
          :class="
            reorder.dragging.value === index
              ? 'z-20 scale-[1.02] border-ok-hue/60 bg-surface shadow-[5px_5px_0_var(--c-shade)] motion-reduce:scale-100'
              : 'border-tint/10 bg-tint/[0.03]'
          "
        >
          <div class="flex items-center gap-2">
          <!-- 把手：滑鼠、手指按住拖；取得焦點時上下方向鍵也能移動。touch-none：拖的時候頁面不要跟著捲 -->
          <button
            type="button"
            class="flex h-8 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center text-ink-muted transition hover:text-ink active:cursor-grabbing"
            :aria-label="`拖曳排序：${BLOCK_LABELS[block.type]}（也可以用上下方向鍵）`"
            @pointerdown="reorder.onPointerDown($event, index)"
            @keydown="reorder.onKeydown($event, index)"
          >
            <svg class="h-4 w-3" viewBox="0 0 6 10" fill="currentColor" aria-hidden="true">
              <rect x="0" y="0" width="2" height="2" /><rect x="4" y="0" width="2" height="2" />
              <rect x="0" y="4" width="2" height="2" /><rect x="4" y="4" width="2" height="2" />
              <rect x="0" y="8" width="2" height="2" /><rect x="4" y="8" width="2" height="2" />
            </svg>
          </button>
          <span class="w-5 shrink-0 text-center text-caption tabular-nums text-ink-muted">{{ index + 1 }}</span>
          <span class="min-w-0 flex-1 truncate text-body" :class="block.visible ? 'text-ink' : 'text-ink-muted line-through'">{{ BLOCK_LABELS[block.type] }}</span>
          <CheckboxField :model-value="block.visible" class="shrink-0 text-button" @update:model-value="toggleBlock(index)">顯示</CheckboxField>
          </div>
        </li>
      </TransitionGroup>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="cursor-pointer border-2 border-ok-hue/50 bg-ok-hue/15 px-3 py-1 text-button text-ok transition hover:bg-ok-hue/25 active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="savingLayout"
          @click="saveLayout"
        >
          {{ savingLayout ? '儲存中…' : '確認' }}
        </button>
        <button
          type="button"
          class="cursor-pointer border-2 border-tint/15 px-3 py-1 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
          @click="cancelEdit"
        >
          取消
        </button>
        <p v-if="layoutError" class="text-body text-danger">{{ layoutError }}</p>
      </div>
    </div>

    <!-- 載入中：重點卡、指數卡、漲跌家數、熱力圖、法人、美股 -->
    <div v-if="status === 'loading'" class="space-y-5">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SkeletonBlock v-for="n in 6" :key="n" class="h-[6.5rem] w-full rounded-none" />
      </div>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <SkeletonBlock v-for="n in 5" :key="n" class="h-[6.5rem] w-full rounded-none" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock v-for="n in 2" :key="n" class="h-14 w-full rounded-none" />
      </div>
      <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        <SkeletonBlock v-for="n in 18" :key="n" class="h-12 w-full rounded-none" />
      </div>
      <SkeletonBlock class="h-48 w-full rounded-none" />
      <!-- 美股三組（4／3／3 張卡片），每組一行標題 -->
      <div v-for="(count, g) in [4, 3, 3]" :key="g" class="space-y-2">
        <SkeletonBlock class="h-5 w-32 rounded-none" />
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonBlock v-for="n in count" :key="n" class="h-36 w-full rounded-none" />
        </div>
      </div>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
      <span>{{ error }}</span>
      <RefreshButton label="重試" loading-label="重試中…" tone="danger" :loading="refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <template v-else-if="overview">
      <p class="text-caption text-ink-muted">
        更新於 {{ timeText(overview.asOf) }}<template v-if="error">｜{{ error }}</template>
      </p>

      <!-- 區塊照使用者排的順序畫（v19）；每一塊各自判斷有沒有資料 -->
      <template v-for="block in shownBlocks" :key="block.type">
      <section v-if="hasContent(block) || isBlockEditing(block) || lostCards(block)" class="space-y-2">
      <!-- 區塊標題列：可以設定的區塊右邊一支筆，就地編輯卡片（三大法人沒有設定、標題在元件裡） -->
      <div v-if="block.type !== 'institutional'" class="flex items-center justify-between gap-2">
        <p class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span class="text-body text-ink-muted">{{ blockTitle(block) }}</span>
          <router-link v-if="blockLink(block)" :to="{ query: { tab: blockLink(block)!.tab } }" class="text-caption text-warn hover:underline">
            {{ blockLink(block)!.label }}
          </router-link>
        </p>
        <div
          v-if="CARD_BLOCKS.includes(block.type) || block.type === 'sectors' || block.type === 'watchGroup' || block.type === 'picks'"
          class="flex items-center gap-1.5"
        >
          <!-- 卡片／表格切換（推薦／熱門、自選清單）：按了換成另一種，直接存 -->
          <ViewToggleButton
            v-if="block.type === 'picks' || block.type === 'watchGroup'"
            :view="block.options.view === 'table' ? 'table' : 'card'"
            @toggle="setBlockOptions(block, { view: block.options.view === 'table' ? 'card' : 'table' })"
          />
          <button
            v-if="isBlockEditing(block)"
            type="button"
            class="flex h-7 w-8 shrink-0 cursor-pointer items-center justify-center border border-danger-hue/40 bg-danger-hue/10 text-danger transition hover:bg-danger-hue/20 active:translate-x-[1px] active:translate-y-[1px] active:bg-danger-hue/30"
            :aria-label="`取消${BLOCK_LABELS[block.type]}的設定`"
            :title="`取消${BLOCK_LABELS[block.type]}的設定`"
            @click="cancelBlockEdit"
          >
            <!-- 和右邊儲存的勾勾成對：紅 × 取消、綠 ✓ 儲存 -->
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="square" />
            </svg>
          </button>
          <!-- 筆：推薦／熱門沒有設定（類型在區塊裡直接切）；自選清單有兩個以上清單時才能挑 -->
          <EditToggleButton
            v-if="block.type !== 'picks' && (block.type !== 'watchGroup' || watchGroups.length > 1)"
            size="sm"
            :active="isBlockEditing(block)"
            :label="`設定${BLOCK_LABELS[block.type]}`"
            :active-label="`儲存${BLOCK_LABELS[block.type]}的設定`"
            :disabled="savingBlock || (isBlockEditing(block) && blockEmpty)"
            @click="isBlockEditing(block) ? saveBlockEdit() : startBlockEdit(block)"
          />
        </div>
      </div>
      <p v-if="lostCards(block) && !isBlockEditing(block)" class="border-2 border-dashed border-tint/15 px-3 py-3 text-body text-ink-muted">
        選的卡片都不在了（例如追蹤的股票刪掉了），按右邊的筆重新挑。
      </p>
      <!-- 就地編輯：挑卡片（拖曳排序、× 拿掉、點一下加入）／熱力圖數量；下面的卡片即時預覽 -->
      <div v-if="isBlockEditing(block)" class="space-y-2 border-2 border-ok-hue/30 bg-ok-hue/[0.04] p-3">
        <!-- 自選清單：要看哪個清單（預設是第一個） -->
        <div v-if="block.type === 'watchGroup'" class="flex flex-wrap gap-1.5">
          <button
            v-for="option in [{ id: null, name: '第一個清單' }, ...watchGroups]"
            :key="option.id ?? 'first'"
            type="button"
            class="cursor-pointer border-2 px-2 py-0.5 text-button transition"
            :class="(block.options.group ?? null) === option.id ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
            :aria-pressed="(block.options.group ?? null) === option.id"
            @click="setGroup(option.id)"
          >
            {{ option.name }}
          </button>
        </div>
        <div v-else-if="block.type === 'sectors'" class="flex flex-wrap gap-1.5">
          <button
            v-for="top in SECTOR_TOP_OPTIONS"
            :key="top ?? 'all'"
            type="button"
            class="cursor-pointer border-2 px-2 py-0.5 text-button transition"
            :class="(block.options.top ?? null) === top ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
            :aria-pressed="(block.options.top ?? null) === top"
            @click="setTop(top)"
          >
            {{ top ? `漲跌最多的 ${top} 個` : '全部' }}
          </button>
        </div>
        <p v-else-if="!poolOf(block.type).length" class="text-caption text-ink-muted">資料載入後才能挑卡片。</p>
        <DashboardCardPicker
          v-else
          :model-value="cardsOf(block)"
          :pool="poolOf(block.type)"
          :max="block.type === 'highlights' ? HIGHLIGHT_MAX : undefined"
          @update:model-value="setCards($event)"
        />
      <p v-if="blockError" class="text-body text-danger">{{ blockError }}</p>
      </div>
      <!-- ── 重點卡：最常看的六個，數字放大（6 張在手機 2×3、平板 3×2、桌機一排都剛好排滿） ── -->
      <div v-if="block.type === 'highlights' && highlightsOf(block).length" class="grid grid-cols-2 gap-2" :class="highlightGrid(highlightsOf(block).length)">
        <!-- 點了開走勢彈窗（線圖、開高低、52 週高低）；沒有走勢資料的只顯示數字、不能點 -->
        <component
          :is="canOpen(item) ? 'button' : 'div'"
          v-for="item in highlightsOf(block)"
          :key="item.key"
          :type="canOpen(item) ? 'button' : undefined"
          class="min-w-0 border-2 border-accent-hue/25 bg-accent-hue/[0.06] p-3 text-left"
          :class="canOpen(item) && 'cursor-pointer transition hover:border-accent-hue/50 hover:bg-accent-hue/10 active:translate-x-[2px] active:translate-y-[2px]'"
          :aria-label="canOpen(item) ? `${item.name} 走勢` : undefined"
          @click="canOpen(item) && (opened = item)"
        >
          <p class="flex items-center justify-between gap-2 text-body text-accent">
            <span class="truncate">{{ item.name }}</span>
            <span v-if="canOpen(item)" class="shrink-0 text-caption text-warn" aria-hidden="true">走勢 ›</span>
          </p>
          <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">{{ formatNumber(item.price, item.digits) }}</p>
          <p class="text-body tabular-nums" :class="trendClass(item.change)">
            {{ formatSigned(item.change) }}（{{ formatSigned(item.changePct, '%') }}）
          </p>
          <p class="truncate text-caption text-ink-muted">{{ item.note }}</p>
        </component>
      </div>
      <!-- ── 美國總經數據（每月公布一次） ── -->
      <div v-if="block.type === 'macro' && macroOf(block).length" class="space-y-1.5">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <div v-for="item in macroOf(block)" :key="item.key" class="min-w-0 border-2 border-info-hue/20 bg-info-hue/[0.04] p-3">
            <p class="flex items-center gap-1.5 text-body text-info-ink">
              <span class="truncate">{{ item.name }}</span>
              <HelpTip :term="item.key" />
            </p>
            <template v-if="item.kind === 'inflation'">
              <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">{{ formatNumber(item.yoy, 1) }}%</p>
              <p class="text-body tabular-nums">
                <span :class="inflationTrend(item.yoy, item.prevYoy).class">{{ inflationTrend(item.yoy, item.prevYoy).label }}</span>
                <span class="text-ink-muted">（上月 {{ formatNumber(item.prevYoy, 1) }}%）</span>
              </p>
              <p class="truncate text-caption text-ink-muted">{{ monthText(item.month) }}年增率・月增 {{ formatNumber(item.mom, 1) }}%</p>
            </template>
            <template v-else>
              <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">{{ jobsText(item.change) }}</p>
              <p class="text-body tabular-nums text-ink-muted">上月 {{ jobsText(item.prevChange) }}</p>
              <p class="truncate text-caption text-ink-muted">{{ monthText(item.month) }}新增就業</p>
            </template>
          </div>
        </div>
        <p class="text-caption text-ink-muted">資料來自聖路易聯準銀行 FRED（美國官方公布值）；免費來源沒有市場預期值，只和上個月比。</p>
      </div>

      <!-- ── 漲跌家數 ── -->
      <div v-if="block.type === 'breadth' && overview.breadth && breadthOf(block).length" class="grid gap-3" :class="breadthOf(block).length > 1 && 'sm:grid-cols-2'">
        <div v-for="exchange in breadthOf(block)" :key="exchange" class="space-y-1.5 border-2 border-tint/10 bg-tint/[0.03] p-3 text-body">
          <p class="flex justify-between text-ink-muted">
            <span>{{ BREADTH_LABELS[exchange] }}漲跌家數</span>
            <span v-if="overview.breadth[exchange]?.date" class="text-ink-muted">{{ overview.breadth[exchange]!.date }}</span>
          </p>
          <template v-if="overview.breadth[exchange]">
            <div class="flex h-2.5 w-full overflow-hidden bg-tint/5" role="img" :aria-label="`${BREADTH_LABELS[exchange]}上漲 ${overview.breadth[exchange]!.up} 家、下跌 ${overview.breadth[exchange]!.down} 家`">
              <div v-for="part in breadthParts(overview.breadth[exchange]!)" :key="part.key" :class="part.bar" :style="{ width: `${part.pct}%` }" />
            </div>
            <p class="flex flex-wrap gap-x-4 tabular-nums">
              <span v-for="part in breadthParts(overview.breadth[exchange]!)" :key="part.key" :class="part.text">{{ part.label }} {{ part.count }}</span>
            </p>
          </template>
          <p v-else class="text-ink-muted">暫時取不到。</p>
        </div>
      </div>

      <!-- ── 類股熱力圖 ── -->
      <div v-if="block.type === 'sectors' && overview.sectors.length" class="space-y-2">
        <ul class="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
          <li
            v-for="sector in sectorsOf(block)"
            :key="sector.name"
            class="flex min-h-12 flex-col justify-center px-2 py-1.5 text-center"
            :class="heatClass(sector.changePct)"
            :title="`${sector.name} ${formatNumber(sector.close)}`"
          >
            <span class="truncate text-caption">{{ sector.name }}</span>
            <span class="text-body font-semibold tabular-nums">{{ formatSigned(sector.changePct, '%') }}</span>
          </li>
        </ul>
      </div>

      <!-- ── 自選清單：第一個（或指定的）自訂清單；沒有清單或清單是空的就顯示當日推薦 ── -->
      <template v-if="block.type === 'watchGroup'">
        <div v-if="!watchReady && watchError" class="flex flex-wrap items-center justify-between gap-2 border-2 border-danger-hue/30 bg-danger-hue/[0.06] px-3 py-3">
          <p class="text-body text-danger">自選清單讀取失敗：{{ watchError }}</p>
          <RefreshButton
            label="重試"
            loading-label="重試中…"
            tone="danger"
            :loading="watchRetrying"
            :failed="!!watchError"
            :cooldown="watchRetryCooldown"
            @click="retryWatch"
          />
        </div>
        <div v-else-if="!watchReady" class="space-y-1.5">
          <SkeletonBlock v-for="n in 3" :key="n" class="h-10 w-full rounded-none" />
        </div>
        <DashboardWatchList
          v-else-if="watchGroupOf(block).items.length"
          :items="watchGroupOf(block).items"
          :view="block.options.view"
          page-key="dashboard-watch"
          :reset-key="watchGroupOf(block).group?.id ?? ''"
        />
        <p v-else-if="picksShown" class="border-2 border-dashed border-tint/15 px-3 py-4 text-center text-body text-ink-muted">
          {{ watchGroupOf(block).group ? `「${watchGroupOf(block).group!.name}」清單還是空的。` : '還沒有自訂清單。' }}到「自訂股票追蹤」把股票加進清單，這裡就會出現。
        </p>
        <DashboardPicks v-else :type="block.options.pickType" :view="block.options.view" @update:type="setPickType(block, $event)" />
      </template>
      <DashboardPicks v-if="block.type === 'picks'" :type="block.options.pickType" :view="block.options.view" @update:type="setPickType(block, $event)" />
      <DashboardNews v-if="block.type === 'news'" />

      <!-- ── 三大法人（沿用股市諮詢的籌碼元件）── -->
      <MarketChips v-if="block.type === 'institutional' && overview.institutional" :chips="overview.institutional" />

      <!-- ── 美股、匯率與市場情緒：分組，每張卡片有白話說明、小走勢圖、近 5／20 日漲跌 ── -->
      <div v-if="block.type === 'us' && usGroupsOf(block).length" class="space-y-4">
        <div v-for="group in usGroupsOf(block)" :key="group.key" class="space-y-2">
          <p v-if="group.title" class="text-subtitle font-semibold text-ink">{{ group.title }}</p>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="card in group.cards" :key="card.name" class="flex flex-col gap-1.5 border-2 border-tint/10 bg-tint/[0.03] p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="flex items-center gap-2 text-body text-ink">
                    {{ card.name }}
                    <span v-if="card.session === 'intraday'" class="border border-up-hue/30 px-1.5 text-caption text-up-ink">盤中</span>
                  </p>
                  <p class="mt-0.5 text-title font-semibold tabular-nums text-ink">
                    {{ formatNumber(card.price, priceDigits(card)) }}<span v-if="card.unit" class="ml-0.5 text-body">{{ card.unit }}</span>
                  </p>
                  <p class="text-body tabular-nums" :class="trendClass(card.change)">
                    {{ formatSigned(card.change, card.unit ?? '') }}（{{ formatSigned(card.changePct, '%') }}）
                  </p>
                </div>
                <div v-if="card.spark.length > 1" class="w-24 shrink-0 sm:w-28">
                  <MarketSparkline :values="card.spark" />
                </div>
              </div>
              <p v-if="card.changes" class="flex gap-3 text-caption tabular-nums text-ink-muted">
                <span>近 5 日 <span :class="trendClass(card.changes.d5)">{{ formatSigned(card.changes.d5, '%') }}</span></span>
                <span>近 20 日 <span :class="trendClass(card.changes.d20)">{{ formatSigned(card.changes.d20, '%') }}</span></span>
              </p>
              <p v-if="card.note" class="text-caption text-ink-muted">{{ card.note }}</p>
            </div>
          </div>
        </div>
        <p class="text-caption text-ink-muted">美股與匯率報價來自 Yahoo，可能延遲約 15 分鐘；小走勢圖是最近約 60 個交易日。</p>
      </div>
      </section>
      </template>

      <p v-if="!shownBlocks.length" class="border-2 border-dashed border-tint/15 px-4 py-6 text-center text-body text-ink-muted">
        所有區塊都隱藏了。按右上角的「客製化區塊」，把想看的區塊打開。
      </p>

      <MarketQuoteDialog
        v-if="opened"
        :name="opened.name"
        :symbol="opened.symbol"
        :futures="opened.futures"
        :digits="opened.digits"
        @close="opened = null"
      />

      <p v-for="note in overview.notes" :key="note" class="text-body text-ink-muted">{{ note }}</p>
    </template>
  </section>
</template>
