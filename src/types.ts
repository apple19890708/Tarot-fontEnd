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
  // v7 新增：元素與數字的分布，獨立成段放在「走到哪個階段」下方。舊版後端沒有
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
  sequence?: { index: number; number: number; stage: string }[]
  shape?: NumberStageShape
  skipped?: number[]
  text: string
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
export type QuantDirection = 'strongPositive' | 'positive' | 'neutral' | 'negative' | 'strongNegative'
export type QuestionDomain = 'work' | 'money' | 'love' | 'social' | 'study' | 'general'

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
  | { type: 'delta'; text: string }
  | { type: 'done'; model: string }
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
  createdAt: string
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
