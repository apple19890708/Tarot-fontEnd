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
}

export interface MarketChart {
  dates: string[]
  close: (number | null)[]
  ma5: (number | null)[]
  ma20: (number | null)[]
  ma60: (number | null)[]
  volume: (number | null)[]
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

export interface MarketAlert {
  id: string
  target: MarketAlertTarget
  condition: 'above' | 'below'
  price: number
  note: string
  active: boolean
  triggeredAt: string | null
  triggeredPrice: number | null
  createdAt: string
}

export interface MarketSnapshot {
  asOf: string
  items: MarketItem[]
  notes: string[]
}

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
