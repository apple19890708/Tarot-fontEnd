// 排列圖的網格座標，col／row 由 1 起算；overlay 代表疊在同格的另一張牌上（橫跨）
export interface PositionLayout {
  col: number
  row: number
  overlay?: boolean
}

export interface SpreadPosition {
  key: string
  label: string
  prompt: string
  weight?: number
  layout?: PositionLayout
}

// 不指定牌陣時由使用者自己命名的位置
export interface CustomPosition {
  label: string
  prompt: string
}

export type RelationKind =
  | 'sequence'
  | 'crossing'
  | 'contrast'
  | 'depth'
  | 'remedy'
  | 'projection'
  | 'arc'

export interface SpreadRelation {
  from: number
  to: number
  kind: RelationKind
}

export interface Spread {
  key: string
  name: string
  cardCount: number
  description: string
  positions: SpreadPosition[]
  grid?: { cols: number; rows: number }
  relations?: SpreadRelation[]
}

export interface HealthResponse {
  status: string
  database: {
    ready: boolean
    cardCount: number
    message: string
  }
}

// 牌義依小標題分組（核心訊息、心理層面、現實狀況、行動建議…）
export interface MeaningGroup {
  heading: string
  lines: string[]
}

export interface ReadingCard {
  // 手動選牌沒有牌陣位置
  position: SpreadPosition | null
  orientation: 'upright' | 'reversed'
  interpretation: string
  // 完整牌義；舊版後端沒有此欄位，退回 highlights
  meaning?: MeaningGroup[]
  highlights: string[]
  card: {
    id: string
    nameZh: string
    nameEn: string
    suit: string | null
    arcanaType: 'major' | 'minor'
    number: number
    keywords: string[]
    source: string
    element?: Element | null
    kind?: 'major' | 'court' | 'pip'
    image?: string
  }
}

// GET /api/cards 的全牌清單，供手動選牌使用
export interface CardSummary {
  id: string
  nameZh: string
  nameEn: string
  suit: Suit | null
  arcanaType: 'major' | 'minor'
  number: number
  image: string
  // v13：牌的種類由後端判斷（宮廷牌靠牌名，編號在不同牌組不一致）。舊版後端沒有這兩個欄位
  kind?: 'major' | 'court' | 'pip'
  courtRank?: CourtRank | null
}

// 「輸入已抽到的牌」放在某個位置上的一張。位置是空的時候是 undefined，
// 所以這份清單的長度一直等於牌陣張數，index 就是位置順序
export interface InputCard extends CardSummary {
  orientation: 'upright' | 'reversed'
}

// 手動選牌送出的單張：牌 id 與正逆位
export interface ManualCardPick {
  id: string
  orientation: 'upright' | 'reversed'
}

// 牌陣位置格上顯示的牌。自動抽牌拿到的是 ReadingCard、手動抽牌是 DeckCard，
// 兩邊各自轉成這個形狀，位置格就能共用同一套外觀與量測方式
export interface SlotCard {
  id: string
  nameZh: string
  image: string
  orientation: 'upright' | 'reversed'
}

// 手動抽牌的牌堆。洗牌時就決定正逆位，否則「手動」只是換個介面的自動抽牌
export interface DeckCard extends CardSummary {
  orientation: 'upright' | 'reversed'
  picked: boolean
}

// 步驟 2 的三種抽牌方式：系統抽／從扇形牌背挑／輸入在別處抽到的牌
export type DrawMode = 'auto' | 'fan' | 'input'

// 手動抽牌扇形的階段。shuffling：循環洗牌，等使用者按「切牌」；splitting：切開的動畫；
// cutting：等使用者選一落；dealing：發牌展開；ready：可以選牌
export type FanPhase = 'shuffling' | 'splitting' | 'cutting' | 'dealing' | 'ready'

// idle：沒有可解讀的結果；ready：等使用者按按鈕才呼叫 AI（每次呼叫都有費用）
// loading：等第一段文字；streaming：文字陸續送達；stopped：使用者中途停止
export type NarrationStatus = 'idle' | 'ready' | 'loading' | 'streaming' | 'done' | 'stopped' | 'error'

export type Element = 'fire' | 'water' | 'air' | 'earth'
export type Suit = 'wands' | 'cups' | 'swords' | 'pentacles'
export type CourtRank = 'page' | 'knight' | 'queen' | 'king'
export type PairRelation = 'enhance' | 'weaken' | 'cause' | 'neutral'

export interface AnalysisTheme {
  focusIndex: number
  // v8：elevated＝比例高於牌堆本身（22/78）但還沒到主導
  dominance: 'fate' | 'elevated' | 'personal'
  emphasizedNumbers: { number: number; count: number; theme: string | null }[]
  emphasizedCourtRanks: { rank: CourtRank; count: number }[]
  dominantSuits: { suit: Suit; count: number }[]
  missingSuits: Suit[]
  dominantElements: Element[]
  text: string
  // v7 新增：元素（與缺少的花色）的說明；v11 起不再含數字。欄位名稱沿用。舊版後端沒有
  elementNumberText?: string
}

export interface AnalysisPair {
  from: number
  to: number
  relation: PairRelation
  relationLabel: string
  // 關係型態（順承／橫跨／對照／表裡／對策／投射／整體）。v6 之後才有，舊版後端沒有
  kindLabel?: string
  elementRelation: 'same' | 'friendly' | 'opposed' | 'neutral' | null
  tags: string[]
  text: string
}

export interface AnalysisCourt {
  index: number
  rank: CourtRank
  suit: Suit
  role: 'person' | 'trait'
  text: string
}

export interface AnalysisNote {
  type: string
  text: string
}

// 組合分析第二版（規則 7～10），舊版後端沒有這些欄位
export interface AnalysisQuestion {
  domains: string[]
  expectedSuits: Suit[]
  alignment: 'aligned' | 'partial' | 'mismatch' | 'noMinor'
  topSuits: Suit[]
  evidence: number[]
  text: string
}

export interface AnalysisPositionFinding {
  type: string
  value?: string
  evidence: number[]
  text: string
}

export type NumberStageShape = 'flat' | 'rising' | 'falling' | 'peak' | 'dip' | 'zigzag'

export interface AnalysisNumberStage {
  stages: Record<string, number>
  dominant: string | null
  trend: 'forward' | 'backward' | 'same' | null
  evidence: number[]
  // v7 新增：依牌陣順序的階段路徑與整條路徑的形狀；舊版後端沒有
  // v11：宮廷牌也納入，沒有數字時 number 是 null；時間線少於兩格時 shape 是 null
  sequence?: {
    index: number
    number: number | null
    stage: string
    // v11：牌的種類；大牌另附化簡前的編號（只有大牌才有這個鍵）
    kind?: 'pip' | 'major' | 'court'
    majorNumber?: number
    themeLabel?: string | null
  }[]
  shape?: NumberStageShape | null
  skipped?: number[]
  // v11：時間線上的牌（index，依時間先後）。只有過去／現在／未來／結果這類位置算時間線
  timeline?: number[]
  // v11：每張牌的記號與階段，給前端畫時間軸
  steps?: NumberStageStep[]
  // v11：只有結論的文字；畫了時間軸時用它，避免路徑講兩次
  summary?: string
  text: string
}

export interface NumberStageStep {
  index: number
  label: string | null
  name: string
  // 「4」「13→4」或宮廷階級「侍者」
  mark: string
  theme: string | null
  stage: string
  // 口語的階段名稱（剛起步、面對考驗…）
  stageLabel: string
}

export interface AnalysisWeights {
  total: number
  average: number
  intensity: 'major' | 'medium' | 'daily'
  intensityLabel: string
  centerIndex: number
  trend: 'rising' | 'falling' | 'steady' | null
  weightedElements: Partial<Record<Element, number>>
  weightedDominant: Element | null
  majorShiftsElement: boolean
  reversedWeightRatio: number
  resistance: 'high' | 'some' | 'low'
  resistanceLabel: string
  majorWeightShare: number
  text: string
}

// 規則 11：量化指標
export type QuantDimension = 'action' | 'emotion' | 'logic' | 'material'

export type QuantLevel = 1 | 2 | 3

export type QuantLevels = {
  momentum: QuantLevel
  resistance: QuantLevel
  confidence: QuantLevel
  focus: QuantLevel
}
export type QuantDirection = 'strongPositive' | 'positive' | 'neutral' | 'negative' | 'strongNegative'
// stock（股市諮詢）只有 admin 與開通「金融股市」的會員能選；後端也會擋
export type QuestionDomain = 'work' | 'money' | 'love' | 'social' | 'study' | 'stock' | 'general'

export interface AnalysisQuant {
  domain: QuestionDomain
  domainLabel: string
  domainResolvedFrom: 'user' | 'keyword' | 'none'
  domainWeights: Record<QuantDimension, number>
  // DI 僅用於儀表指針位置，不顯示數字給使用者
  di: number
  direction: QuantDirection
  directionLabel: string
  energy: Record<QuantDimension, number>
  momentum: number
  resistance: number
  // 力氣集中在少數面向的程度；舊版後端沒有
  focus?: number
  confidence: number
  confidenceLow: boolean
  // 傾向條的三格分級（1～3），門檻由後端依實際分布決定；舊版後端沒有
  levels?: QuantLevels
  contributions: { index: number; v: number; weight: number; share: number }[]
  text: string
}

export interface ReadingAnalysis {
  theme: AnalysisTheme
  pairs: AnalysisPair[]
  courts: AnalysisCourt[]
  // v7 新增：宮廷牌整區的開場；沒有宮廷牌時也會有一句。舊版後端沒有
  courtSummary?: string
  conflicts: AnalysisNote[]
  uncertainties: AnalysisNote[]
  quant?: AnalysisQuant | null
  question?: AnalysisQuestion | null
  positions?: AnalysisPositionFinding[]
  numberStage?: AnalysisNumberStage | null
  weights?: AnalysisWeights
  stats: {
    total: number
    majorCount: number
    courtCount: number
    pipCount: number
    reversedCount: number
    suitCounts: Partial<Record<Suit, number>>
    numberCounts: Record<string, number>
    courtRankCounts: Partial<Record<CourtRank, number>>
    elementCounts: Partial<Record<Element, number>>
  }
}

export interface ReadingResponse {
  question: string
  overview: string
  guidance: string
  spread: {
    key: string
    name: string
    description: string
    cardCount: number
  }
  cards: ReadingCard[]
  // 舊版後端沒有此欄位
  analysis?: ReadingAnalysis
}

// /api/readings/narrate 以 NDJSON 串流回傳，每行一個事件
export type NarrationStreamEvent =
  // 股市問題才有，排在第一個：AI 解讀時查到的報價與技術指標（舊版後端沒有這個事件）
  | { type: 'market'; snapshot: MarketSnapshot }
  | { type: 'delta'; text: string }
  // saved：有指定紀錄時是否已存回那筆（null＝沒有指定紀錄；舊版後端沒有這個欄位）
  | { type: 'done'; model: string; saved?: boolean | null }
  | { type: 'error'; message: string }

export interface ApiError {
  message: string
}

// ===== 會員與權限（v12）=====
// 後端 /api/auth/* 回傳；Render 上的舊版後端沒有這些 API，前端要容忍 404
export type UserRole = 'member' | 'admin'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  // AI 解析權限：admin 一律 true，member 要由管理者開通；舊版後端沒有這個欄位
  aiAccess?: boolean
  // 金融股市權限（股市諮詢、股市追蹤）：admin 一律 true，member 要由管理者開通；舊版後端沒有這個欄位
  stockAccess?: boolean
  createdAt?: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface AdminUsersResponse {
  page: number
  pageSize: number
  total: number
  users: AuthUser[]
}

// ===== 占卜紀錄（v13）=====
// 後端只存牌與正逆位，分析在讀取時重算；AI 解讀則原樣保存

export interface ReadingHistoryCard {
  id: string
  nameZh: string
  orientation: 'upright' | 'reversed'
}

// 列表用的摘要，不含分析與 AI 文字
export interface ReadingSummary {
  id: string
  question: string
  domain: QuestionDomain | null
  spreadKey: string | null
  spreadName: string
  cardCount: number
  cards: ReadingHistoryCard[]
  hasNarration: boolean
  createdAt: string
}

export interface ReadingHistoryResponse {
  page: number
  pageSize: number
  total: number
  readings: ReadingSummary[]
}

export interface SavedNarration {
  text: string
  model: string
  // 解讀當下查到的市場資料；不是股市問題、或舊紀錄時沒有
  market?: MarketSnapshot | null
  createdAt: string
}

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
  barCount: number
}

export interface MarketChipsPart {
  name: string
  total: number
  // 正值連續買超天數、負值連續賣超天數
  streak: number
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
  summary: { notes: string[]; expensive: boolean } | null
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
  stopLossPct?: number
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
  // 這個價位來自哪裡，例如「MA20」「近 20 日低點」
  label: string
}

export interface MarketAnalysis {
  signals: MarketSignal[]
  supports: MarketLevel[]
  resistances: MarketLevel[]
}

export type MarketStatus = 'idle' | 'loading' | 'ready' | 'error'

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
  bullish: MarketStanceStats
  bearish: MarketStanceStats
  neutral: MarketStanceStats
  byConfidence: Record<'high' | 'medium' | 'low', { count: number; hitRate: number | null }>
}

export interface MarketTrackSummary {
  total: number
  pending: number
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
  side: 'buy' | 'sell'
  quantity: number
  price: number
  date: string | null
}

// 現金股利入帳（實際收到的總額）
export interface MarketDividend {
  amount: number
  date: string | null
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
  group?: string | null
  order?: number
  // 買賣紀錄（依順序先進先出）與股利；空陣列代表沒有
  trades: MarketTrade[]
  dividends: MarketDividend[]
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
  quota: StockAnalysisQuota
  // 這檔最近一次的 AI 分析
  latest: (StockAnalysisSummary & { text: string }) | null
}

export type StockAnalysisStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; model: string; analysis: StockAnalysisSummary | null }
  | { type: 'error'; message: string }

// 單筆回顧：reading 由後端重算，narration 是當初存下來的 AI 解讀
export interface ReadingDetail {
  id: string
  createdAt: string
  domain: QuestionDomain | null
  reading: ReadingResponse
  narration: SavedNarration | null
}

// 結果頁「保存紀錄」的狀態
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ===== 財經新聞（v17 規格 G）=====
export type FinanceNewsRegion = 'tw' | 'intl'
export type FinanceNewsScopeRegion = 'all' | FinanceNewsRegion

export interface FinanceNewsItem {
  id: string
  source: string
  sourceLabel: string
  region: FinanceNewsRegion
  lang: 'zh' | 'en'
  title: string
  // 來源給的摘要（純文字，最多 300 字），可能是空字串
  summary: string
  url: string
  publishedAt: string
  // 主題 key（對應 FinanceNewsView.themes）
  themes: string[]
  // 標題裡提到的台股代號
  codes: string[]
  // 其中在我追蹤清單裡的代號
  watched?: string[]
  // 語氣（漲跌用詞統計）：打開過新聞重點的用全文算，其他用標題＋摘要；舊版後端沒有
  tone?: 'positive' | 'negative' | 'neutral'
  // 同一件事的報導有相同的值（群裡最新那則的 id）；舊版後端沒有，就當成各自一則
  clusterId?: string
}

export interface FinanceNewsTheme {
  key: string
  label: string
}

export interface FinanceNewsSourceStatus {
  key: string
  label: string
  region: FinanceNewsRegion
  // null：這次啟動後還沒抓過
  ok: boolean | null
  count: number
}

export interface FinanceNewsAnalysisSummary {
  id: string
  region: FinanceNewsScopeRegion
  theme: string | null
  // 範圍的中文說明（「國內新聞，主題「AI／資料中心」」）；舊版後端沒有
  scopeLabel?: string
  newsCount: number
  model: string
  createdAt: string
}

export interface FinanceNewsAnalysisRef {
  title: string
  sourceLabel: string
  region: string
  url: string
  publishedAt: string | null
}

export interface FinanceNewsAnalysisDetail extends FinanceNewsAnalysisSummary {
  text: string
  // 當時交給 AI 的新聞，順序就是 AI 引用的 [n]
  news: FinanceNewsAnalysisRef[]
}

export interface FinanceNewsView {
  news: FinanceNewsItem[]
  themes: FinanceNewsTheme[]
  status: { syncedAt: string | null; sources: FinanceNewsSourceStatus[] }
  quota: StockAnalysisQuota
  latest: FinanceNewsAnalysisDetail | null
}

// 新聞重點彈窗（不呼叫 AI）：後端節錄的重點句與規則標籤
export interface FinanceNewsDigestStock {
  market: 'tw' | 'us'
  code: string | null
  symbol: string
  name: string
  // 在我的追蹤清單裡
  watched?: boolean
}

export interface FinanceNewsDigestGroup {
  theme: string
  label: string
  tw: string[]
  us: string[]
}

export interface FinanceNewsDigest {
  // article：從原文全文節錄；summary：原文讀不到，只用來源摘要
  basis: 'article' | 'summary'
  // 原文有讀到（basis 是 summary 時：true 代表原文只有表格、挑不出句子；false 代表原站不開放讀取）。舊版後端沒有這個欄位
  articleRead?: boolean
  // 原文句子節錄（不是改寫），照原文順序
  points: string[]
  // 標題與重點句的漲跌用詞統計
  tone: 'positive' | 'negative' | 'neutral'
  stocks: FinanceNewsDigestStock[]
  groups: FinanceNewsDigestGroup[]
  createdAt: string
}
