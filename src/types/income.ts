// 股利獲利與預測（v20）、存股試算
import type { MarketAlertTarget, MarketDividend, MarketFees, MarketPosition, MarketTrade, MarketWatchGroup } from './marketTrack'

// ---- 股利獲利與預測（v20）：GET /api/market/income。舊版後端沒有這支，前端顯示錯誤 ----
// 年化報酬（XIRR，%）。算不出來時 pct 是 null：missingDates 買賣或股利沒填日期、noQuote 報價取不到、
// tooShort 持有不到 90 天、noSolution 解不出來、noTrades 沒有買賣、partial 合計裡有幾檔（blocked）算不出來、noFx 匯率取不到
export interface IncomeAnnualized {
  pct: number | null
  reason: 'missingDates' | 'noQuote' | 'tooShort' | 'noSolution' | 'noTrades' | 'partial' | 'noFx' | null
  blocked?: number
}
export interface IncomeSettings {
  nhi: boolean
  // 小數：2.11% 是 0.0211
  nhiRate: number
  nhiThreshold: number
  usWithholding: number
}
// 已公告（證交所預告、公司公告的除息交易日，或 Yahoo 先列出）／本月已除息（實際）／推估（最近一次配息）／
// 董事會已決議（金額確定、除息日還沒訂；2026-11-11 起，舊版後端沒有）
export type IncomeSource = 'announced' | 'exDone' | 'estimated' | 'decided'
export interface IncomeMonthCash {
  perShare: number
  source: IncomeSource
  exDate: string | null
  // 推估的月曆日期（去年同一次加一年、避開週末）；推不出來或不是推估時沒有
  estimatedDate?: string | null
  // 董事會決議日（source 'decided' 才有）
  decidedAt?: string
  gross: number | null
  deduction: number | null
  net: number | null
}
export interface IncomeMonthStock {
  exDate: string
  // 每股配幾股
  ratio: number
  addShares: number
  addQuantity: number
}
export interface IncomeMonth {
  month: string
  cash: IncomeMonthCash | null
  stock: IncomeMonthStock | null
}
export type IncomeFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual' | 'none'
export interface IncomeProjection {
  months: IncomeMonth[]
  frequency: IncomeFrequency
  annualPerShare: number
  // 每持有 1 張（台股）／1 股（美股）一年約領多少（未扣款）
  annualPerUnit: number | null
  annualGross: number | null
  annualNet: number | null
  hasEstimate: boolean
  // 推估怎麼算（latest：最近一次配息）、這一檔過去用同樣方法估準不準（近 3 年，誤差在 10% 內幾次）；舊版後端沒有
  estimateMethod?: 'latest'
  estimateCheck?: { tested: number; within10: number } | null
}
export interface IncomeEntitlementEvent {
  type: 'cash' | 'stock'
  exDate: string
  perShare?: number
  ratio?: number
  shares: number | null
  gross?: number | null
  deduction?: number | null
  net?: number | null
  addShares?: number
  addQuantity?: number
  recorded: 'yes' | 'maybe' | 'no'
  // recorded 是 maybe 時：可能是 dividends 的第幾筆（「是同一筆」按鈕用）
  matchIndex?: number | null
  // 使用者刪掉了（不想帶入）：不列在還沒記錄，但過去的實際應收照樣算（舊版後端沒有）
  dismissed?: boolean
}
// 刪掉的應收股利：哪一種、哪一次除息
export interface IncomeDismissed {
  type: 'cash' | 'stock'
  exDate: string
}
export interface IncomeEntitlement {
  available: boolean
  reason?: 'noTrades' | 'missingDates' | 'noData'
  events: IncomeEntitlementEvent[]
  splitWarning?: { date: string; ratio: number } | null
  unrecordedCash?: number | null
  unrecordedShares?: number
}
export interface IncomeItem {
  id: string
  target: MarketAlertTarget
  groups?: string[]
  price: number | null
  quantity: number
  position: MarketPosition | null
  // 原始買賣與股利紀錄（頁內編輯持股用）；第 3 階段前的後端沒有
  trades?: MarketTrade[]
  dividends?: MarketDividend[]
  dismissedEntitlements?: IncomeDismissed[]
  // ok：有歷史股利；noticeOnly：只有證交所預告；failed：股利資料抓不到；notStock：指數
  dividendStatus: 'ok' | 'noticeOnly' | 'failed' | 'notStock'
  entitlement: IncomeEntitlement | null
  projection: IncomeProjection | null
  // %（未扣款）
  yieldOnCost: number | null
  currentYield: number | null
  // 第 5 階段前的後端沒有
  annualized?: IncomeAnnualized | null
  // 近 2 年實際的除息（當年的每股金額）與配股，每月股利往前看用；舊版後端沒有
  pastEvents?: { type: 'cash' | 'stock'; date: string; perShare?: number; ratio?: number }[]
  // 填息追蹤（v20 階段 7）：近 2 年每次除息後幾個交易日填息；沒有日 K 或股利資料時是 null，舊版後端沒有
  fills?: IncomeFills | null
  // 報酬拆解（v20 階段 8）；報價取不到時是 null，舊版後端沒有
  breakdown?: IncomeBreakdown | null
  // 多年平均股利（v20 2.9.9，存股試算的殖利率基準）；股利紀錄不滿 12 個月是 null，舊版後端沒有
  dividendAverage?: IncomeDividendAverage | null
}

// 存股試算自選一檔（GET /api/market/dividend-profile）：不用先追蹤；和股利頁清單同一套算法。
// price 美股是美元；usdTwd 只有美股才給（取不到是 null）
export interface DividendProfile {
  target: MarketAlertTarget
  price: number | null
  usdTwd: number | null
  dividendStatus: IncomeItem['dividendStatus']
  frequency: IncomeFrequency
  currentYield: number | null
  dividendAverage: IncomeDividendAverage | null
}

// 多年平均股利：近 months 個月（36，上市不久退成 24／12）的現金股利 ÷ 年數；yieldPct 是 ÷ 現價（未扣款，%）
export interface IncomeDividendAverage {
  months: number
  perShare: number
  yieldPct: number | null
}
export interface IncomeTotals {
  count: number
  cost: number
  value: number
  unrealized: number
  unrealizedPct: number | null
  realized: number
  dividends: number
  totalReturn: number
  annualNet: number
  unrecordedCash: number
  monthly: number[]
  monthlyEstimated?: number[]
  // 過去 24 個月（pastMonths）的實際應收與當時的預估（沒有紀錄是 null）；舊版後端沒有
  pastActual?: number[]
  pastEstimate?: (number | null)[]
  // 有持股但報價取不到的檔數（市值相關合計不完整）
  missingQuote: number
  annualized?: IncomeAnnualized
  breakdown?: IncomeBreakdown
}
export interface IncomeTotalsTwd {
  usIncluded: boolean
  cost: number
  value: number
  unrealized: number
  unrealizedPct: number | null
  realized: number
  dividends: number
  totalReturn: number
  annualNet: number
  monthly: number[]
  monthlyEstimated?: number[]
  pastActual?: number[]
  pastEstimate?: (number | null)[]
  annualized?: IncomeAnnualized
  breakdown?: IncomeBreakdown
}
export interface IncomeReport {
  asOf: string
  group: string | null
  groups: MarketWatchGroup[]
  fees: MarketFees
  noticesAvailable: boolean
  today: string
  months: string[]
  // 本月之前的 24 個月（圖表往前看）；舊版後端沒有
  pastMonths?: string[]
  settings: IncomeSettings
  usdTwd: number | null
  items: IncomeItem[]
  totals: { tw: IncomeTotals; us: IncomeTotals; twd: IncomeTotalsTwd }
  // 預估 vs 實際（近 24 個月）；後端沒啟用或舊版是 null／沒有
  forecastChecks?: IncomeForecastCheck[] | null
  // 集中度提醒（v20 2.9.8）；舊版後端沒有
  concentration?: IncomeConcentration
}

// 集中度：百分比都是佔持股市值（台幣）的 %；warnings 的 text 由後端產生，直接顯示
export interface ConcentrationThresholds {
  holding: number
  industry: number
}
export interface IncomeConcentration {
  thresholds: ConcentrationThresholds
  total: number
  count: number
  // 取不到匯率、沒算進來的美股檔數
  excludedUs: number
  holdings: { id: string; name: string; code: string; pct: number }[]
  industries: { code: string; label: string; pct: number; names: string[] }[]
  // 沒有產業別的（ETF、美股、查不到）佔多少；沒有持股是 null
  unclassifiedPct: number | null
  warnings: { type: 'holding' | 'industry'; key: string; pct: number; text: string }[]
}

// 某個月的一檔除息（前端排版用，不是後端格式）：lib/incomeMonthEntries 算出來，每月小卡與點開的 IncomeMonthDialog 共用
export interface IncomeCalendarEntry {
  item: IncomeItem
  cash: IncomeMonthCash | null
  stock: IncomeMonthStock | null
  date: string | null
  // 推估的金額（虛線）
  estimated: boolean
  // 日期是推的（推估，或董事會已決議但除息日還沒訂）
  dateGuessed: boolean
  // 已經過去的除息（實際紀錄）；held 是「當時有沒有持股」，heldKnown 為 false 時算不出來（買賣沒填日期）
  past: boolean
  heldKnown: boolean
  held: boolean
}

// 填息追蹤（v20 階段 7）。events 新到舊；filledOn 是 null＝還沒填（gap 是還差幾元、daysSince 是除息後過了幾個交易日）
export interface IncomeFillEvent {
  exDate: string
  perShare: number
  // 除息前一個交易日的實際收盤價（已還原配股調整）
  preClose: number
  filledOn: string | null
  days: number | null
  gap: number | null
  gapPct: number | null
  daysSince: number | null
}
export interface IncomeFills {
  events: IncomeFillEvent[]
  total: number
  filledCount: number
  avgDays: number | null
}

// 報酬拆解（v20 階段 8）：總報酬 ＝ price ＋ dividends − fees − tax − sellCost（費用類是正數）
export interface IncomeBreakdown {
  // 價差（未扣費用）
  price: number
  dividends: number
  fees: number
  tax: number
  // 現在全部賣出還要付的手續費與稅（預估）
  sellCost: number
}

// 股利預估 vs 實際（v20，正式公布後驗證準不準）：estimate 用公布前最後一次推估；errorPct 正的＝高估
export interface IncomeForecastCheck {
  symbol: string
  code: string | null
  name: string
  market: 'tw' | 'us'
  month: string
  estimate: number
  firstEstimate: number | null
  actual: number
  errorPct: number | null
  estimateDate: string | null
  actualDate: string | null
}
