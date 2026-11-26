// 市場資料：股市諮詢的行情與技術指標、歷史回測、機器學習預測

// ===== 市場資料（AI 解讀股市問題時由後端查詢）=====
// 數字都是後端算好的，前端只負責排版，不自行計算或下判斷
export interface MarketQuote {
  price: number
  prevClose: number | null
  change: number | null
  changePct: number | null
  open: number | null
  high: number | null
  low: number | null
  time: string | null
  // 這筆報價所屬的交易日（YYYY-MM-DD）
  date: string | null
  // 最新一根的成交量（股；台股畫面上換成張）；舊版後端沒有
  volume?: number | null
}

export interface MarketIndicators {
  ma5: number | null
  ma20: number | null
  ma60: number | null
  rsi14: number | null
  k: number | null
  d: number | null
  prevK: number | null
  prevD: number | null
  macdDif: number | null
  macdSignal: number | null
  macdHist: number | null
  macdPrevHist: number | null
  change5d: number | null
  change20d: number | null
  change60d: number | null
  high20: number | null
  low20: number | null
  high60: number | null
  low60: number | null
  volumeRatio: number | null
  // 以下是規則版本 4 的後端才有（舊版後端沒有，一律可選）
  // 近 14 日平均真實波幅（一天平均波動），出場點用
  atr14?: number | null
  // 半年線、年線、一年高低點
  ma120?: number | null
  ma240?: number | null
  high250?: number | null
  low250?: number | null
  // 支撐壓力的價位來源：成交密集區、未回補缺口、前波高低點（歷史太短時為 null）
  levels?: {
    volumeNodes: { price: number; weight: number }[]
    gaps: { side: 'support' | 'resistance'; price: number; date: string | null }[]
    swingHighs: number[]
    swingLows: number[]
  } | null
}

export interface MarketItem {
  symbol: string | null
  code: string | null
  // tse 上市、otc 上櫃；美股為 null（舊版後端沒有這個欄位）
  exchange?: string | null
  name: string
  market: 'tw' | 'us'
  kind: 'index' | 'stock'
  currency: string
  session: 'intraday' | 'closed'
  source: string
  quote: MarketQuote
  // 歷史資料不足 20 天時為 null（例如櫃買指數只有即時報價）
  indicators: MarketIndicators | null
  // 判讀標籤與支撐壓力；沒有指標時為 null（舊版後端沒有這個欄位）
  analysis?: MarketAnalysis | null
  // 歷史回測、策略比較、機器學習預測；歷史資料不足一年時為 null
  research?: MarketResearch | null
  // 價格走勢圖（最近約 120 個交易日）
  chart?: MarketChart | null
  // 操作建議（規則計算）；沒有技術指標時為 null
  advice?: MarketAdvice | null
  // 籌碼面（台股才有）
  chips?: MarketChips | null
  // 估值（台股個股才有）
  valuation?: MarketValuation | null
  // 歷年除權息（個股分析彈窗才有；股利歷史抓不到是 null，沒配過息是空陣列）
  dividendRecords?: MarketDividendRecord[] | null
  barCount: number
}

// 個股分析「除權息」分頁的一列：一次除權息（同一天的現金與配股合併），新到舊。
// cash：當年實際的每股現金股利；stock：台股配股換算成元（每股配 0.02 股＝0.2 元），美股一律 null；
// yieldPct：現金股利 ÷ 除息前一天的實際收盤價；fill：填息狀況（日 K 不夠是 null）
export interface MarketDividendRecord {
  year: number
  exDate: string
  cash: number | null
  stock: number | null
  preClose: number | null
  yieldPct: number | null
  fill: { filledOn: string | null; days: number | null; gapPct: number | null; daysSince: number | null } | null
}

export interface MarketChipsPart {
  name: string
  total: number
  // 正值連續買超天數、負值連續賣超天數
  streak: number
  // 淨買賣超佔同期成交量的 %（個股才有；舊版後端沒有）
  volumePct?: number | null
  text: string
}

export interface MarketChips {
  // 個股是「張」，大盤是「億元」
  unit: string
  scope: 'stock' | 'market'
  // 上櫃只有最新一日
  latestOnly?: boolean
  dates: string[]
  foreign: (number | null)[]
  trust: (number | null)[]
  dealer: (number | null)[]
  // 資料來源缺值時各欄位可能是 null
  margin: {
    balance: number | null
    change: number | null
    days: number | null
    shortBalance: number | null
    shortChange: number | null
  } | null
  summary: {
    foreign: MarketChipsPart
    trust: MarketChipsPart
    dealer: MarketChipsPart
    margin: { text: string; direction: number; changePct: number } | null
  } | null
}

export interface MarketValuation {
  pe: number | null
  dividendYield: number | null
  pb: number | null
  // 在全體上市櫃公司裡的百分位（高於多少比例的公司）
  pePercentile: number | null
  yieldPercentile: number | null
  pbPercentile: number | null
  // 同產業的百分位（同產業至少 8 家才有；舊版後端沒有）。判讀（偏貴、偏便宜）以這組為準
  industry?: {
    code: string
    label: string
    count: number
    pePercentile: number | null
    yieldPercentile: number | null
    pbPercentile: number | null
  } | null
  summary: { notes: string[]; expensive: boolean; scope?: string } | null
}

export interface MarketAdviceEvidence {
  group: string
  label: string
  detail: string | null
  // 1 偏多、-1 偏空、0 中性
  direction: number
  // false：樣本不足或模型不可靠，沒有列入判斷
  counted: boolean
}

export interface MarketAdvice {
  // 產生這份建議的規則版本（後端 advice.js 的 RULE_VERSION）；舊版後端沒有
  ruleVersion?: number
  stance: 'bullish' | 'bearish' | 'neutral'
  stanceLabel: string
  confidence: 'high' | 'medium' | 'low'
  confidenceLabel: string
  score: number
  summary: string
  horizon: string
  evidence: MarketAdviceEvidence[]
  levels: {
    stopLoss: MarketLevel
    stopLossLabel: string
    targets: MarketLevel[]
    targetsLabel: string
    // 偏空時為 null（不建議買進，這個比例沒有意義）
    riskReward: number | null
  }
  forNew: string
  forHolders: string
  positionSize: string
  risks: string[]
  // 長期建議（半年以上，看年線、大盤、估值、營收）；歷史不到約一年、或舊版後端時沒有
  longTerm?: MarketLongTermAdvice | null
}

// 長期建議：和短中期同樣的結論與依據格式，價位只有一個關鍵價位（年線）
export interface MarketLongTermAdvice {
  stance: 'bullish' | 'bearish' | 'neutral'
  stanceLabel: string
  confidence: 'high' | 'medium' | 'low'
  confidenceLabel: string
  score: number
  summary: string
  horizon: string
  keyLevel: MarketLevel
  evidence: MarketAdviceEvidence[]
  forNew: string
  forHolders: string
  positionSize: string
  risks: string[]
}

export interface MarketChartSeries {
  dates: string[]
  // 開高低：畫 K 棒用，新版後端才有
  open?: (number | null)[] | null
  high?: (number | null)[] | null
  low?: (number | null)[] | null
  close: (number | null)[]
  ma5: (number | null)[]
  ma20: (number | null)[]
  ma60: (number | null)[]
  volume: (number | null)[]
}

// 最外層是日 K（約一年）；週 K（約三年）、月 K（五年）是新版後端才有，均線是 5／20／60 週（月）
export interface MarketChart extends MarketChartSeries {
  weekly?: MarketChartSeries | null
  monthly?: MarketChartSeries | null
}

// ---- 歷史回測（這檔標的自己的歷史）----
export interface MarketHorizonStats {
  days: number
  count: number
  wins?: number
  winRate: number | null
  avgReturn: number | null
  medianReturn: number | null
  worst: number | null
  best: number | null
}

export interface MarketSignalBacktest {
  key: string
  label: string
  value: string
  // 訊號「首次出現」的次數
  occurrences: number
  lastSeen: string | null
  // 樣本數達到 minSamples 才算數
  sufficient: boolean
  horizons: MarketHorizonStats[]
  // 分段驗證：前段與後段的 10 日勝率（和各段自己的基準比）
  periods?: {
    early: { count: number; winRate: number | null; baseline: number | null }
    late: { count: number; winRate: number | null; baseline: number | null }
    splitDate: string
  }
  // false：前後期方向相反；null：兩段樣本不夠，無法判斷
  consistent?: boolean | null
  // 後端算好的結論（10 日上漲比例的信賴區間 vs 基準）；舊版後端沒有，前端退回「差 5 個百分點」
  verdict?: MarketSignalVerdict
}

export interface MarketSignalVerdict {
  // 1 之後偏漲、-1 偏跌、0 沒有優勢
  direction: 1 | 0 | -1
  // false：不列入判斷（次數太少、前後期相反）
  counted: boolean
  reason: 'few' | 'inconsistent' | 'edge' | 'noEdge' | 'horizonConflict'
  // 10 日上漲比例的合理範圍（%）
  interval: { low: number; high: number } | null
}

export interface MarketBacktest {
  horizons: number[]
  // 基準：任意一天買進
  baseline: { days: number; winRate: number | null; avgReturn: number | null; count: number }[]
  signals: MarketSignalBacktest[]
  minSamples: number
}

export interface MarketStrategyResult {
  key: string
  label: string
  description: string
  // 白話說明（給沒學過技術指標的人看）；舊版後端沒有
  plain?: string
  totalReturn: number | null
  annualReturn: number | null
  maxDrawdown: number | null
  trades: number
  tradeWinRate: number | null
  exposure: number | null
  holdingNow: boolean
  // 被停損出場的次數（只有停損版本會大於 0）
  stops?: number
  // 資金曲線，起點為 100
  curve: { date: string; value: number }[]
  // 加上停損的版本（買進持有為 null）
  withStop?: MarketStrategySummary | null
  // 分段驗證：前段與後段各自的報酬，以及同期間的買進持有
  periods?: {
    early: MarketStrategySummary & { buyHold: number | null }
    late: MarketStrategySummary & { buyHold: number | null }
  }
  // 前後兩段都贏過買進持有（買進持有為 null）
  robust?: boolean | null
}

export interface MarketStrategySummary {
  totalReturn: number | null
  maxDrawdown: number | null
  trades: number
  tradeWinRate: number | null
  stops: number
}

export interface MarketStrategies {
  from: string
  to: string
  // 分段驗證的切點
  splitDate?: string
  // 舊版後端：固定 % 停損
  stopLossPct?: number
  // 新版後端：停損 = 進場價 − ATR(stopAtrPeriod) × stopAtrMultiple；stopNowPct 是以今天算，停損距離約股價的幾 %
  stopAtrMultiple?: number
  stopAtrPeriod?: number
  stopNowPct?: number
  years: number
  roundTripCost: number
  strategies: MarketStrategyResult[]
}

// ---- 機器學習預測 ----
export interface MarketPredictionFactor {
  key: string
  label: string
  // 白話名稱（新版後端才有）
  plain?: string
  // 標準化後的權重：正值代表這個特徵越大越偏向上漲
  weight: number
  // 今天這個特徵把機率往哪邊推
  contribution: number | null
}

export interface MarketPrediction {
  model: string
  horizon: number
  probabilityUp: number | null
  testAccuracy: number
  baselineAccuracy: number
  edge: number
  testUpRate: number
  trainSamples: number
  testSamples: number
  testFrom: string
  testTo: string
  // 樣本外準確率有明顯贏過基準才是 true
  reliable: boolean
  // 獨立的測試樣本數（測試筆數 ÷ 預測天數）與準確率的合理範圍（%）；舊版後端沒有
  effectiveSamples?: number
  accuracyInterval?: { low: number; high: number } | null
  // 有加入大盤特徵時：大盤名稱與「不加大盤」的準確率
  marketContext?: { label: string; accuracyWithoutMarket: number } | null
  factors: MarketPredictionFactor[]
}

export interface MarketResearch {
  backtest: MarketBacktest | null
  strategies: MarketStrategies | null
  prediction: MarketPrediction | null
}

// 技術指標的判讀（文字由後端產生）。tone 只用來上色：bull 偏多、bear 偏空、warn 留意、neutral 中性
export interface MarketSignal {
  key: string
  label: string
  value: string
  tone: 'bull' | 'bear' | 'warn' | 'neutral'
}

export interface MarketLevel {
  price: number
  // 這個價位來自哪裡，例如「MA20」「成交密集區」「近 20 日低點」
  label: string
  // 支撐的強弱（規則版本 4，舊版後端沒有）：strong 過去比較守得住、weak 常直接跌破；壓力一律 normal
  strength?: 'strong' | 'normal' | 'weak'
  // 強弱的白話說明（後端產生）；一般的為 null
  note?: string | null
}

export interface MarketAnalysis {
  signals: MarketSignal[]
  supports: MarketLevel[]
  resistances: MarketLevel[]
}

export type MarketStatus = 'idle' | 'loading' | 'ready' | 'error'
