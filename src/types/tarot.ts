// 塔羅：牌、牌陣、排列圖、抽牌步驟、占卜結果與組合分析、AI 解讀的串流事件
import type { MarketSnapshot } from './marketTrack'

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
  | 'group'

export interface SpreadRelation {
  from: number
  to: number
  kind: RelationKind
}

// 畫排列圖、選牌陣需要的共同欄位（v27）：塔羅的 Spread 與雷諾曼的 LenormandSpread 都符合，
// 排列圖、問題步驟只依賴這幾個欄位，兩套牌共用元件時不用放寬任何一邊的型別
export interface SpreadShape {
  key: string
  name: string
  cardCount: number
  description: string
  positions: SpreadPosition[]
  grid?: { cols: number; rows: number }
}

export interface Spread extends SpreadShape {
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

export type Orientation = 'upright' | 'reversed'

// 抽牌步驟（牌堆、輸入選牌器、位置格）需要的共同欄位（v27）：塔羅的 CardSummary 與雷諾曼的 LenormandDrawCard 都符合
export interface DrawableCard {
  id: string
  nameZh: string
  nameEn: string
  image: string
}

// 牌堆裡的一張：洗牌時就決定正逆位（沒有正逆位的牌組一律 upright，畫面不顯示）
export type DeckOf<C extends DrawableCard> = C & { orientation: Orientation; picked: boolean }
// 輸入模式放在某個位置上的一張
export type InputOf<C extends DrawableCard> = C & { orientation: Orientation }

// 自動抽牌的結果裡，發牌動畫需要的部分：塔羅的 ReadingResponse 與雷諾曼的抽牌結果都符合
export interface AutoDealResult {
  cards: { card: { id: string | number; nameZh: string; image?: string }; orientation?: Orientation }[]
}

// 輸入選牌器的分組：每組有標題，組裡可以再分幾排（例如塔羅的數字牌一排、宮廷牌另一排）。
// cols 是 Tailwind class（要寫成完整字串才會被產生）
export interface CardPickerGroup<C extends DrawableCard> {
  key: string
  label: string
  rows: { key: string; cols: string; cards: C[] }[]
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
  // 沒有正逆位的牌組（雷諾曼）可以不給；不給就不轉、不顯示正逆位
  orientation?: Orientation
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

// 是非題（會不會、是否、能不能、有沒有…）的答案。文字與答案都由後端算，前端只用 verdict 決定顏色
export interface AnalysisYesNo {
  // 「會」在這題指的是：事情變動、維持、不好的事發生、好的事發生
  yesMeans: 'advice' | 'change' | 'stay' | 'unfavorable' | 'favorable'
  verdict: 'yes' | 'leanYes' | 'unclear' | 'leanNo' | 'no'
  verdictLabel: string
  text: string
  // 每張牌把答案往「會」（正）或「不會」（負）拉多少
  contributions: { index: number; value: number; share: number }[]
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
  // 規則 12：是非題的答案；不是是非題時為 null。舊版後端沒有
  yesNo?: AnalysisYesNo | null
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
  // 追問的延伸回答才有，排在 delta 前面：保留了前幾次追問已經寫好的回答（舊版後端沒有這個事件）
  | { type: 'start'; kept: number }
  // saved：有指定紀錄時是否已存回那筆（null＝沒有指定紀錄；舊版後端沒有這個欄位）
  | { type: 'done'; model: string; saved?: boolean | null }
  | { type: 'error'; message: string }
