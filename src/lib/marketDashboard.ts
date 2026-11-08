// 股市總覽的版面（v19 計畫書）：區塊清單、預設順序，以及「存起來的版面」和預設合併。
// 後端只驗證格式，區塊叫什麼、預設怎麼排由這裡決定
import type { DashboardBlock, DashboardBlockType, MarketDashboard } from '../types'

export const BLOCK_LABELS: Record<DashboardBlockType, string> = {
  highlights: '重點卡',
  macro: '美國經濟數據',
  breadth: '漲跌家數',
  sectors: '類股熱力圖',
  institutional: '三大法人',
  us: '美股與市場情緒',
  watchGroup: '自選清單',
  picks: '推薦／熱門股票',
  news: '今日財經新聞',
}

// 區塊裡的卡片（v19 階段 2）：沒設定（options.cards 是 undefined）時用這裡的預設；id 和後端回傳的資料對應
// 重點卡：加權、櫃買、台指期夜盤、那斯達克、費半、美元兌台幣（改版前的六張）；個股是 watch:<追蹤 id>
export const DEFAULT_HIGHLIGHTS = ['^TWII', 'TPEX', 'txf-night', '^IXIC', '^SOX', 'TWD=X']
export const HIGHLIGHT_MAX = 8
export const MACRO_KEYS = ['cpi', 'coreCpi', 'pce', 'corePce', 'nfp']
export const BREADTH_KEYS = ['tse', 'otc'] as const
// 類股熱力圖：只看漲跌幅（絕對值）最大的前幾個；null＝全部
export const SECTOR_TOP_OPTIONS = [null, 6, 12, 18] as const
// 有「卡片」可以挑的區塊（美股的預設是全部、照後端順序分三組，所以不列固定預設）
export const CARD_BLOCKS: DashboardBlockType[] = ['highlights', 'macro', 'breadth', 'us']

// 預設版面：改版前大盤概況的順序，重點卡後面接「推薦／熱門股票」與「自選清單」（使用者決定：推薦放在自選清單上面）。
// 今日財經新聞預設不顯示，在「客製化區塊」打開
export const DEFAULT_ORDER: DashboardBlockType[] = [
  'highlights',
  'picks',
  'watchGroup',
  'macro',
  'breadth',
  'sectors',
  'institutional',
  'us',
  'news',
]
const DEFAULT_HIDDEN: DashboardBlockType[] = ['news']
// 不看大盤資料、各自載入的區塊（大盤資料讀不到時照樣能畫）
export const PERSONAL_BLOCKS: DashboardBlockType[] = ['watchGroup', 'picks', 'news']

export function defaultBlocks(): DashboardBlock[] {
  return DEFAULT_ORDER.map((type) => ({ type, visible: !DEFAULT_HIDDEN.includes(type), options: {} }))
}

// 存起來的版面照使用者的順序；之後新增的區塊種類（存的時候還沒有）接在最後、照該區塊的預設顯示與否，不打亂排好的順序
// （例：階段 3 加的自選清單預設顯示，其他自己的資料預設不顯示）。
// 不認得的區塊（例如舊版前端遇到新版存的）略過
export function resolveBlocks(stored: MarketDashboard | null | undefined): DashboardBlock[] {
  if (!stored?.blocks?.length) return defaultBlocks()
  const known = stored.blocks.filter((block) => DEFAULT_ORDER.includes(block.type))
  const missing = DEFAULT_ORDER.filter((type) => !known.some((block) => block.type === type))
  // 卡片清單是空的（早期版本可以存 0 張）當成沒設定、用預設卡片：不然整塊消失回不來，後端也不再收 0 張
  const optionsOf = (block: DashboardBlock) => {
    const options = { ...block.options }
    if (Array.isArray(options.cards) && options.cards.length === 0) delete options.cards
    return options
  }
  const blocks = [
    ...known.map((block) => ({ type: block.type, visible: block.visible !== false, options: optionsOf(block) })),
    ...missing.map((type) => ({ type, visible: !DEFAULT_HIDDEN.includes(type), options: {} })),
  ]
  // 版本 1 的版面（2026-11-08 以前存的）：「推薦／熱門股票」移到自選清單正上方並打開（使用者決定的新預設）。
  // 之後存的是版本 2（後端 dashboard.js），不會再調整，使用者自己排的位置不會被蓋掉
  if ((stored.version ?? 1) < 2) {
    const picks = blocks.find((block) => block.type === 'picks')
    const rest = blocks.filter((block) => block.type !== 'picks')
    const at = rest.findIndex((block) => block.type === 'watchGroup')
    if (picks && at >= 0) {
      rest.splice(at, 0, { ...picks, visible: true })
      return rest
    }
  }
  return blocks
}

// 和預設一樣（順序、顯示都相同、沒有區塊設定）時存 null，之後預設改了也會跟著
export function isDefaultLayout(blocks: DashboardBlock[]) {
  return (
    blocks.length === DEFAULT_ORDER.length &&
    blocks.every(
      (block, index) =>
        block.type === DEFAULT_ORDER[index] && block.visible === !DEFAULT_HIDDEN.includes(block.type) && Object.keys(block.options).length === 0,
    )
  )
}
