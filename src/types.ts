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

// 管理頁的會員：多了登入、活動、停用狀態與登入方式（舊版後端沒有這些欄位，都設可選）
export interface AdminUser extends AuthUser {
  lastLoginAt?: string | null
  lastLoginMethod?: 'password' | 'google' | 'register' | null
  lastActiveAt?: string | null
  disabled?: boolean
  disabledAt?: string | null
  loginMethods?: { password: boolean; google: boolean }
}

export type AdminUserFilter = 'all' | 'admin' | 'ai' | 'stock' | 'inactive' | 'disabled'
export type AdminUserSort = 'created' | 'active' | 'login'

export interface AdminUserStats {
  total: number
  active7d: number
  newThisMonth: number
  aiMembers: number
  stockMembers: number
  disabled: number
}

export interface AdminUsersResponse {
  page: number
  pageSize: number
  // 符合目前搜尋、篩選的人數
  total: number
  users: AdminUser[]
  // 頁首統計（不受搜尋、篩選影響）；舊版後端沒有
  stats?: AdminUserStats
}

export interface AdminLogEntry {
  id: string
  action: 'aiAccess' | 'stockAccess' | 'disable' | 'enable' | 'logoutAll'
  // 權限類：開通 true、收回 false
  value: boolean | null
  createdAt: string
  // 帳號已刪除時是 null
  admin: { id: string; email: string; displayName: string } | null
  target?: { id: string; email: string; displayName: string } | null
}

export interface AdminUserDetail {
  user: AdminUser
  usage: {
    readings: { total: number | null; last30Days: number | null }
    ai: {
      stockToday: number | null
      newsToday: number | null
      // admin 不限次數時是 null
      stockLimit: number | null
      newsLimit: number | null
      stockAnalyses: number | null
      newsAnalyses: number | null
    }
    market: { watches: number | null; activeAlerts: number | null; pushDevices: number | null }
  }
  logs: AdminLogEntry[]
}

export interface AdminLogsResponse {
  page: number
  pageSize: number
  total: number
  logs: AdminLogEntry[]
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
