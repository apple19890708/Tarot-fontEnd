// 股市追蹤：建議追蹤、價位提醒、重大訊息、選股、大盤概況、自訂股票追蹤、個股分析（v17）
import type { IncomeDismissed } from './income'
import type { MarketAdvice, MarketAnalysis, MarketChart, MarketChips, MarketItem, MarketLevel, MarketQuote, MarketSignal, MarketValuation } from './market'

// ===== 建議追蹤（自動對答案）=====
export interface MarketCallOutcome {
  days: number
  // false：還沒過這麼多個交易日
  ready: boolean
  return: number | null
  // 偏多上漲、偏空下跌為 true；觀望為 null
  hit: boolean | null
}

export interface MarketCallRecord {
  id: string
  symbol: string
  code: string | null
  name: string
  market: 'tw' | 'us'
  date: string
  price: number
  stance: MarketAdvice['stance']
  confidence: MarketAdvice['confidence']
  ruleVersion?: number
  stopLoss: number | null
  targets: number[]
  outcomes: MarketCallOutcome[]
  // 偏多建議 20 日內先碰到哪個：target 目標、stop 停損、open 都還沒
  path: 'target' | 'stop' | 'open' | null
}

export interface MarketStanceStats {
  count: number
  hitRate: number | null
  avgReturn: number | null
  avgMove: number | null
}

export interface MarketTrackHorizon {
  days: number
  evaluated: number
  hitRate: number | null
  // 對照組：同一批偏多／偏空的建議，每次都猜「會漲」的命中率（舊版後端沒有）
  alwaysUpRate?: number | null
  bullish: MarketStanceStats
  bearish: MarketStanceStats
  neutral: MarketStanceStats
  byConfidence: Record<'high' | 'medium' | 'low', { count: number; hitRate: number | null }>
}

export interface MarketTrackSummary {
  total: number
  pending: number
  // 目前的規則版本、這次是不是只統計目前版本、全部紀錄裡新舊版本各幾筆（舊版後端沒有）
  ruleVersion?: number | null
  onlyCurrent?: boolean
  versionCounts?: { current: number; older: number }
  horizons: MarketTrackHorizon[]
  targetFirstRate: number | null
  targetPathCount: number
  calls: MarketCallRecord[]
}

// ===== 價位提醒 =====
export interface MarketAlertTarget {
  symbol: string | null
  code: string | null
  exchange: string | null
  market: 'tw' | 'us'
  kind: 'index' | 'stock'
  name: string
}

// 提醒種類：price 價格、changePct 單日漲跌幅、ma 均線、kd、rsi、volume 量比
export type MarketAlertKind = 'price' | 'changePct' | 'ma' | 'kd' | 'rsi' | 'volume'

export interface MarketAlertParams {
  // changePct：up／down；ma、rsi：above／below；kd：golden／dead
  direction: string
  value: number | null
  // ma：20 或 60
  period: number | null
}

export interface MarketAlert {
  id: string
  target: MarketAlertTarget
  // 舊版後端沒有 kind，當成 price
  kind?: MarketAlertKind
  // price 種類才有
  condition: 'above' | 'below' | null
  price: number | null
  params?: MarketAlertParams | null
  // 條件的文字（後端產生），例如「跌破季線（MA60）」；舊版後端沒有
  description?: string
  // 觸發時的補充說明，例如「MA60 1,050」
  triggeredNote?: string
  note: string
  active: boolean
  triggeredAt: string | null
  triggeredPrice: number | null
  // 已經用 Discord 通知過的時間（舊版後端沒有這個欄位）
  notifiedAt?: string | null
  createdAt: string
}

// ===== 重大訊息（公開資訊觀測站）=====
// 說明全文是公司原文，畫面只當純文字顯示
export interface MarketNewsItem {
  id: string
  code: string
  exchange: 'tse' | 'otc'
  name: string
  // 發言日期 YYYY-MM-DD 與時間 HH:MM:SS
  date: string
  time: string
  title: string
  detail: string
  clause: string
  // 後端從說明挑出的重點欄位（去掉「不適用」與制式欄位、名稱改白話）；舊版後端沒有
  points?: { label: string; value: string }[]
  // 原文拆成的欄位表（看原文用）與沒有內容的欄位名稱；不是編號格式的公告 fields 是空的
  fields?: { label: string; value: string }[]
  emptyFields?: string[]
}

// ===== 選股 =====
export type MarketScreenSort = 'dividendYield' | 'pe' | 'pb' | 'revenueYoy' | 'volume' | 'changePct' | 'foreignStreak'

// 篩選條件：沒填的不篩
export interface MarketScreenFilters {
  includeEtf?: boolean
  peMax?: number
  yieldMin?: number
  pbMax?: number
  revenueYoyMin?: number
  revenueCumYoyMin?: number
  foreignStreakMin?: number
  trustStreakMin?: number
  priceMin?: number
  priceMax?: number
  // 成交量（張）
  volumeMin?: number
  // 技術面（只對前 30 檔計算）
  aboveMa60?: boolean
  bullishMa?: boolean
  rsiMin?: number
  rsiMax?: number
  sort?: MarketScreenSort
}

export interface MarketScreenRow {
  code: string
  name: string
  exchange: 'tse' | 'otc'
  etf: boolean
  close: number | null
  changePct: number | null
  volume: number | null
  pe: number | null
  dividendYield: number | null
  pb: number | null
  revenueMonth: string | null
  revenueYoy: number | null
  revenueCumYoy: number | null
  // 正數連買、負數連賣（上櫃最多 1 日）
  foreignStreak: number | null
  trustStreak: number | null
}

export interface MarketScreenResult {
  asOf: string
  // 價量資料的日期（前一個交易日收盤）
  quoteDate: string | null
  // 上市籌碼連買用了幾個交易日
  chipDays: number
  universeSize: number
  // 技術面之前符合的檔數
  total: number
  technicalChecked: number
  // 最多 100 檔
  results: MarketScreenRow[]
  notes: string[]
}

// ===== 大盤概況 =====
export interface MarketIndexCard {
  name: string
  symbol: string | null
  price: number | null
  change: number | null
  changePct: number | null
  date: string | null
  session: 'intraday' | 'closed'
  // 最近約 60 個交易日的收盤（櫃買指數沒有歷史資料，只有一點）
  spark: number[]
  // 走勢彈窗用的代號：Yahoo 沒有的指數（櫃買指數）才有；舊版後端沒有，櫃買指數卡就不能點
  chartSymbol?: string
  // 以下是美股區塊才有（新版後端）：分組、白話說明、單位（殖利率是 %）、近 5／20 日漲跌
  group?: 'index' | 'tw' | 'mood'
  note?: string | null
  unit?: string | null
  changes?: { d5: number | null; d20: number | null } | null
}

// 漲跌家數：最新一個交易日收盤
export interface MarketBreadth {
  up: number
  down: number
  flat: number
  date: string | null
}

export interface MarketSector {
  name: string
  close: number | null
  changePct: number
  date: string | null
}

export interface MarketOverview {
  asOf: string
  tw: MarketIndexCard[]
  us: MarketIndexCard[]
  // 某一邊資料沒取到時是 null
  breadth: { tse: MarketBreadth | null; otc: MarketBreadth | null } | null
  // 類股指數漲跌（前一個交易日收盤），由高到低
  sectors: MarketSector[]
  // 上市三大法人買賣超（億元，最近 5 個交易日）
  institutional: MarketChips | null
  // 台指期夜盤近月合約（期交所）；舊版後端沒有、或夜盤沒有成交時是 null
  futures?: { night: MarketFuturesQuote | null }
  // 美國總經數據（FRED）；舊版後端沒有
  macro?: MarketMacroItem[]
  notes: string[]
}

// 台指期報價（大盤概況最上方的重點卡）：漲跌和參考價比，夜盤的參考價是當天日盤的結算價
export interface MarketFuturesQuote {
  session: 'day' | 'night'
  // 「臺指期116」：民國年＋月份
  contract: string | null
  price: number
  refPrice: number | null
  change: number | null
  changePct: number | null
  open: number | null
  high: number | null
  low: number | null
  volume: number | null
  date: string | null
  time: string | null
}

// 美國總經數據：通膨（CPI、PCE）看年增率；非農看當月新增就業人數（千人）。month 是數據所屬月份 YYYY-MM
export type MarketMacroItem =
  | { key: 'cpi' | 'coreCpi' | 'pce' | 'corePce'; name: string; kind: 'inflation'; month: string; yoy: number; prevYoy: number; mom: number }
  | { key: 'nfp'; name: string; kind: 'jobs'; month: string; change: number; prevChange: number }

// 大盤概況重點卡點開的走勢彈窗（像 Google 財經）：range 是時間範圍，baseline 是範圍起點（1 天是上次收盤價）
export type IndexChartRange = '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y'
export interface IndexChart {
  symbol: string
  name: string
  range: IndexChartRange
  currency: string | null
  // 交易所的時區（例如 Asia/Taipei、America/New_York），橫軸時間用它顯示
  timezone: string | null
  time: string | null
  price: number | null
  dayChange: number | null
  dayChangePct: number | null
  baseline: number | null
  rangeChange: number | null
  rangeChangePct: number | null
  stats: { open: number | null; high: number | null; low: number | null; prevClose: number | null; high52: number | null; low52: number | null }
  // 這個代號能選的範圍（櫃買指數只有日線：1 個月～1 年）；沒有就是全部都能選
  ranges?: IndexChartRange[]
  // 資料來源說明（櫃買指數：櫃買中心每日收盤）；沒有就顯示代號
  source?: string
  points: { t: string; close: number }[]
}

// ===== 自訂股票追蹤 =====
// 輸入框下拉候選：和提醒的標的同一個形狀（美股沒有 code／exchange）
export type MarketSearchResult = Omit<MarketAlertTarget, 'code' | 'exchange'> & {
  code?: string | null
  exchange?: string | null
}

// 一筆買賣：台股 quantity 單位是「張」（1 張 = 1000 股，可有小數代表零股），美股是「股」；date 是成交日期（選填）
export interface MarketTrade {
  // stockDividend：配股（v20 後端）。成交價為 0、一定有除權日；舊版後端不會出現
  side: 'buy' | 'sell' | 'stockDividend'
  quantity: number
  price: number
  date: string | null
}

// 現金股利入帳（實際收到的總額）
export interface MarketDividend {
  amount: number
  date: string | null
  // 從應收股利帶入的那一次除息日（v20 後端，可選）。編輯持股時要原樣送回，否則同一次股利會被要求再帶入
  exDate?: string | null
}

// 股市總覽的版面（v19）：使用者排的區塊與卡片，存在帳號裡。新版後端才有，舊版後端沒有時前端用預設版面
export type DashboardBlockType =
  | 'highlights'
  | 'macro'
  | 'breadth'
  | 'sectors'
  | 'institutional'
  | 'us'
  // 第二批（使用者自己的資料）：自選清單（沒有清單時改顯示推薦）、推薦／熱門股票、今日財經新聞
  // （持股總覽、價位提醒 2026-11-08 使用者決定拿掉；存過的版面讀取時略過）
  | 'watchGroup'
  | 'picks'
  | 'news'
export interface DashboardBlock {
  type: DashboardBlockType
  visible: boolean
  // cards：區塊裡的卡片與順序（階段 2）；top：熱力圖只看前幾個；group：自選清單區塊要看的清單（沒有＝第一個）
  // pickType：推薦類型（自選清單沒有清單時、當日推薦區塊用）；view：卡片或表格（推薦／熱門、自選清單）
  options: { cards?: string[]; top?: number; group?: string; pickType?: DailyPickType; view?: 'card' | 'table' }
}
// 推薦類型：法人連買成長股、高殖利率存股、營收爆發股、低本益比價值股、熱門股（漲幅最大）
export type DailyPickType = 'growth' | 'dividend' | 'revenue' | 'value' | 'hot'

// 當日推薦個股（後端用固定規則挑的，不是投資建議）：reasons 是白話的入選理由，rule 是挑選規則的說明
export interface DailyPick {
  code: string
  name: string
  exchange: 'tse' | 'otc'
  close: number | null
  changePct: number | null
  // 漲跌、開高低與成交量（張）；舊版後端沒有
  change?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  volume?: number | null
  reasons: string[]
}
export interface DailyPicks {
  asOf: string
  quoteDate: string | null
  items: DailyPick[]
  rule: string
  notes: string[]
  // 這次的類型與名稱、可以選的類型（舊版後端沒有，只有一種）
  type?: DailyPickType
  label?: string
  types?: { type: DailyPickType; label: string }[]
}

// 任何一檔台股的卡片資料（推薦／熱門股票）：報價摘要＋日 K 與判讀
export interface StockCardData {
  target: MarketAlertTarget
  summary: MarketWatchSummary | null
  chart: MarketChart | null
  analysis: MarketAnalysis | null
}

// 個股分析的對象：追蹤項目，或任何一檔台股的代號（v19）
export type StockSubject = { watchId: string } | { code: string }

export interface MarketDashboard {
  version: number
  blocks: DashboardBlock[]
}

// 交易成本設定：台股手續費折扣（1 = 不打折、0.28 = 2.8 折）、最低手續費；美股每筆手續費
export interface MarketFees {
  twDiscount: number
  twMinFee: number
  usFee: number
}

// 還沒賣掉的那部分（先進先出後剩下的買進）
export interface MarketOpenLot {
  quantity: number
  price: number
  date: string | null
  // 含買進手續費
  cost: number
  value: number | null
  // 已扣掉預估賣出成本
  pnl: number | null
  pnlPct: number | null
  // 配股來的那一批（成本 0，v20 後端）
  stockDividend?: boolean
}

// 持股損益（後端依買賣、股利、交易成本與目前報價計算）。報價取不到時市值相關欄位為 null
export interface MarketPosition {
  quantity: number
  // 平均成本（每股，含買進手續費）
  avgCost: number | null
  costBasis: number
  marketValue: number | null
  // 現在全部賣出要付的手續費與稅（預估）
  sellCost: number | null
  // 未實現損益：已扣掉預估賣出成本
  unrealized: number | null
  unrealizedPct: number | null
  realized: number
  dividends: number
  // 未實現 + 已實現 + 股利
  totalReturn: number | null
  today: number | null
  feesPaid: number
  taxPaid: number
  // 和 trades 一一對應：每筆的手續費、稅、賣出的已實現損益
  trades: { fee: number; tax: number; realized: number | null }[]
  openLots: MarketOpenLot[]
}

// 資產走勢（每日快照）：value／cost 是台幣合併後的總額；returnPct 是時間加權累積報酬率（%）
export interface MarketAssetPoint {
  date: string
  value: number
  cost: number
  realized: number
  dividends: number
  usdTwd: number | null
  returnPct: number
}

// 大盤同期累積漲跌（%），日期和快照對齊
export interface MarketBenchmark {
  key: string
  label: string
  points: { date: string; returnPct: number | null }[]
}

export interface MarketAssetHistory {
  points: MarketAssetPoint[]
  benchmarks: MarketBenchmark[]
}

// 已開啟瀏覽器推播的裝置。endpoint 用來判斷「是不是這台裝置」
export interface MarketPushDevice {
  id: string
  label: string
  endpoint: string
  createdAt: string
}

// 推播狀態：瀏覽器推播給所有人；Discord 只有 admin 才有（其他人是 null）。
// webhook 網址不會回傳，hint 是遮罩後的提示（例如 discord.com/api/webhooks/1234…5678/••••）
export interface MarketNotifyStatus {
  push: {
    // 伺服器有沒有設定 VAPID 金鑰
    available: boolean
    publicKey: string | null
    devices: MarketPushDevice[]
  }
  discord: { linked: boolean; linkedAt: string | null; hint: string | null } | null
}

// 清單的一列摘要（輕量版，不含回測與預測）；判讀文字來自後端
export interface MarketWatchSummary {
  name: string
  currency: string
  session: 'intraday' | 'closed'
  source: string
  quote: MarketQuote
  // 歷史資料不足時為 null
  changes: { d5: number | null; d20: number | null; d60: number | null } | null
  volumeRatio: number | null
  // 52 週高低；position 0 = 在低點、100 = 在高點；fromHigh 是距離高點的 %
  range52w: { high: number; low: number; position: number | null; fromHigh: number } | null
  // 最近約 60 個交易日的收盤價，由舊到新
  spark: number[]
  signals: MarketSignal[]
  supports: MarketLevel[]
  resistances: MarketLevel[]
  // 籌碼小標記，例如「外資連 3 買」（台股個股、資料有取到才有；舊版後端沒有這個欄位）
  chipsTag?: { text: string; tone: 'bull' | 'bear' } | null
  // 台股個股的除權息（今天以後最近一次）與最新月營收；舊版後端或非台股沒有
  events?: MarketCorporateEvents | null
}

// 除權息預告：cashDividend 是每股現金股利（元），stockRatio 是配股比例
export interface MarketExDividend {
  date: string
  type: string
  cashDividend: number | null
  stockRatio: number | null
}

// 最新月營收：revenue 單位千元；mom 月增、yoy 年增、cumYoy 累計年增（%）
export interface MarketRevenue {
  month: string
  revenue: number | null
  mom: number | null
  yoy: number | null
  cumYoy: number | null
  note: string
}

export interface MarketCorporateEvents {
  exDividend: MarketExDividend | null
  revenue: MarketRevenue | null
}

// 展開卡片的詳情：價格走勢圖、籌碼與估值（台股才有）
export interface MarketWatchDetail {
  chart: MarketChart | null
  analysis: MarketAnalysis | null
  chips: MarketChips | null
  valuation: MarketValuation | null
  notes: string[]
}

// 自選清單（一檔股票只屬於一個清單；沒有清單的是「未分類」）
export interface MarketWatchGroup {
  id: string
  name: string
  order: number
}

export interface MarketWatchItem {
  id: string
  target: MarketAlertTarget
  // 所屬清單的 id，null 是未分類；order 是自訂順序（舊版後端沒有這兩欄）
  // 所在的清單（一檔可以放進好幾個，空陣列＝未分類）；舊版後端沒有，改看 group
  groups?: string[]
  group?: string | null
  order?: number
  // 買賣紀錄（依順序先進先出）與股利；空陣列代表沒有
  trades: MarketTrade[]
  dividends: MarketDividend[]
  // 應收股利裡刪掉、不想帶入的那幾次（舊版後端沒有）
  dismissedEntitlements?: IncomeDismissed[]
  // 沒有任何買賣與股利時為 null
  position: MarketPosition | null
  createdAt: string
  // 報價暫時取不到時為 null
  summary: MarketWatchSummary | null
}

export interface MarketSnapshot {
  asOf: string
  items: MarketItem[]
  notes: string[]
}

// ===== 個股分析（v17 規格 F）=====
// 持股摘要：交給 AI 與存進紀錄的那一份（數字由後端算好）
export interface StockHolding {
  market: 'tw' | 'us'
  currency: string
  quantity: number
  avgCost: number | null
  costBasis: number | null
  marketValue: number | null
  unrealized: number | null
  unrealizedPct: number | null
  realized: number | null
  dividends: number | null
  totalReturn: number | null
}

// AI 深度分析的額度：dailyLimit 為 null 代表不限（admin）；retryAt 是這一檔下次可以再跑的時間
export interface StockAnalysisQuota {
  dailyLimit: number | null
  usedToday: number
  retryAt: string | null
}

// 「我的紀錄」股票分析的列表摘要
export interface StockAnalysisSummary {
  id: string
  watch: string | null
  // 股票日記的鍵（tw:0050；v26 計畫 2-2），後端算好；舊版後端沒有，前端用 stockKeyOf 補
  stockKey?: string | null
  target: MarketAlertTarget
  // 分析當時的股價
  quote: { price: number | null; change: number | null; changePct: number | null; date: string | null }
  model: string
  createdAt: string
}

export interface StockAnalysisRecord extends StockAnalysisSummary {
  text: string
  // 當時交給 AI 的單檔快照與持股
  snapshot: StockAnalysisSnapshot | null
  holding: StockHolding | null
}

export interface StockAnalysisSnapshot extends MarketSnapshot {
  events?: MarketCorporateEvents | null
}

// 個股分析彈窗的資料
export interface StockAnalysisView {
  asOf: string
  // 報價取不到時為 null，原因在 notes
  item: MarketItem | null
  notes: string[]
  events: MarketCorporateEvents | null
  news: MarketNewsItem[]
  holding: StockHolding | null
  // 有在追蹤時是追蹤項目的 id（用代號打開、其實有追蹤的也會帶）；舊版後端沒有
  watchId?: string | null
  quota: StockAnalysisQuota
  // 這檔最近一次的 AI 分析
  latest: (StockAnalysisSummary & { text: string }) | null
}
