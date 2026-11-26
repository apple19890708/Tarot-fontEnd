// 雷諾曼（v27）
import type { DrawableCard, DrawMode, SpreadPosition, SpreadShape } from './tarot'

// ===== 雷諾曼（v27，後端 src/data/lenormand/、src/routes/lenormand.js）=====
// 和塔羅分開定義，不放寬塔羅的 ReadingCard／CardSummary：雷諾曼沒有正逆位、大小牌、花色元素，
// 多了撲克對應、朝向、宮位。新欄位一律可選，線上後端可能還是舊版

export type LenormandSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type LenormandTone = 'positive' | 'negative' | 'neutral'

// GET /api/lenormand/cards 的一張牌（牌號 1～52；1～36 是傳統牌）
export interface LenormandCard {
  id: number
  slug: string
  nameZh: string
  nameEn: string
  keywords: string[]
  tone: LenormandTone
  // 37～52 還沒核對實體牌前是 null
  playingCard: { suit: LenormandSuit; rank: string } | null
  // 牌義由後端提供，前端不自己寫：核心、感情、工作、金錢、健康、當作形容詞時
  meaning: { core: string; love: string; work: string; money: string; health: string; modifier: string }
  facing: 'left' | 'right' | null
  image: string
  traditional: boolean
}

// 撲克花色解說表（3-11），文字全部來自後端
export interface LenormandPlayingCardGuide {
  title: string
  disclaimer: string
  suits: {
    suit: LenormandSuit
    symbol: string
    name: string
    color: 'red' | 'black'
    tone: LenormandTone
    summary: string
    meaning: string
    readings?: { label: string; text: string }[]
  }[]
  colors: { color: 'red' | 'black'; name: string; tone: LenormandTone; meaning: string }[]
  colorNote: string
  ranks: { rank: string; name: string; meaning: string }[]
  rankNote: string
}

export interface LenormandCardsResponse {
  cards: LenormandCard[]
  playingCardGuide: LenormandPlayingCardGuide
}

// modifier：from 是被形容的牌（主詞），to 是形容它的牌；sequence：時間上的先後
export type LenormandRelationKind = 'modifier' | 'sequence'

export interface LenormandSpreadPosition extends SpreadPosition {
  // 大藍圖才有：宮位編號（和傳統牌號相同）與宮位主題
  house?: number
  houseTheme?: string
}

export interface LenormandSpread extends SpreadShape {
  positions: LenormandSpreadPosition[]
  relations?: { from: number; to: number; kind: LenormandRelationKind }[]
  // 要不要選代表牌（紳士 28／淑女 29）；只有大藍圖必填
  requiresSignificator?: boolean
  // 可用的抽牌方式；沒有這個欄位（舊版後端）時三種都給
  drawModes?: DrawMode[]
}

export interface LenormandHouse {
  house: number
  cardId: number
  theme: string
}

export interface LenormandSpreadsResponse {
  spreads: LenormandSpread[]
  houses: LenormandHouse[]
}

// 代表牌：28 紳士、29 淑女（D4：不和帳號性別綁定，由求問者自己選）
export type LenormandSignificator = 28 | 29

// 抽牌步驟用的雷諾曼牌：id 轉成字串才能和塔羅共用抽牌元件；number 是原本的牌號
export interface LenormandDrawCard extends DrawableCard {
  number: number
}

// 雷諾曼的問題類型（3-12）：不開放股市；多了健康、家庭（L8 主題牌：感情＝愛心、金錢＝魚、工作＝錨、健康＝樹木、家庭＝房屋）
export type LenormandDomain = 'love' | 'money' | 'work' | 'health' | 'family' | 'social' | 'study'

// ---- POST /api/lenormand/readings/draw、/manual 的回應（計畫書 3-12）----
// 文字（text.sections）由後端 formatter 產生，前端照順序顯示；結構化欄位只用來標示、上色、統計

export interface LenormandReadingCard {
  index: number
  position: LenormandSpreadPosition
  card: Omit<LenormandCard, 'meaning'>
}

export type LenormandLean = 'positive' | 'negative' | 'mixed' | 'neutral'

export interface LenormandPairItem {
  from: number
  to: number
  // modifier：from 被 to 形容；sequence：時間先後；stack：九宮格同一欄由上到下
  kind: 'modifier' | 'sequence' | 'stack'
  line: string | null
  cardIds: number[]
  tones: LenormandTone[]
  shift: 'improve' | 'worsen' | 'steady' | null
  effect: 'brightens' | 'darkens' | 'neutral' | null
}

export interface LenormandLineGroup {
  key: string
  label?: string
  indexes: number[]
  cardIds: number[]
  lean: LenormandLean
}

export interface LenormandAnalysis {
  questionType?: { kinds: string[]; topic: string | null; othersInvolved: boolean }
  domain: {
    key: LenormandDomain | null
    label: string | null
    source: 'selected' | 'keywords' | 'none'
    themeCardId: number | null
    themeIndex: number | null
  }
  tone: {
    // 算了哪些牌：小牌陣是全部（all）；大藍圖只算中心周圍的近距離牌（near，3～8 張，2026-11-25 使用者決定）。舊版後端沒有
    scope?: 'all' | 'near'
    counts: Record<LenormandTone, number>
    total: number
    lean: LenormandLean
    negativeIndexes: number[]
    cleansedIndexes: number[]
    clusters: { axis: 'row' | 'col'; key: string; label: string; indexes: number[]; count: number }[]
  }
  pairs: {
    items: LenormandPairItem[]
    theme: { index: number; cardId: number; modifierIndexes: number[]; effect: 'brightened' | 'darkened' | 'mixed' | 'neutral' } | null
  }
  combos: {
    id: string
    indexes: number[]
    cardIds: number[]
    tone: LenormandTone
    meaning: string
    condition?: 'faces'
    cleanses?: number
  }[]
  gaze: {
    looks: { index: number; cardId: number; facing: 'left' | 'right'; toward: number | null; away: number | null }[]
    mutual: { a: number; b: number; relation: 'faceToFace' | 'backToBack' }[]
    couple: {
      gentleman: number
      lady: number
      between: number[]
      relation: 'faceToFace' | 'facingApart' | 'backToBack' | 'sameDirection' | 'differentRows'
    } | null
    significator: { cardId: number; index: number | null; toward: number | null; away: number | null } | null
  }
  nineBox: {
    rows: LenormandLineGroup[]
    cols: LenormandLineGroup[]
    center: { index: number; cardId: number; tone: LenormandTone }
    diagonals: LenormandLineGroup[]
    corners: { indexes: number[]; cardIds: number[]; lean: LenormandLean }
    mirrors: { axis: 'leftRight' | 'topBottom'; a: number; b: number }[]
  } | null
  suits: {
    counted: number
    skipped: number
    counts: Record<LenormandSuit, number>
    dominant: LenormandSuit[]
    colors: { red: number; black: number }
    colorLean: 'red' | 'black' | 'even' | null
    faces: { index: number; cardId: number; rank: string; suit: LenormandSuit }[]
    aces: { index: number; cardId: number; rank: string; suit: LenormandSuit }[]
  }
  // 大藍圖才有（計畫書 3-12 的 analysis.tableau），其他牌陣是 null；舊版後端沒有
  tableau?: LenormandTableau | null
}

// ---- 大藍圖（v27 階段 5，計畫書 3-12）----
// 位置 index i 在第 i % 9 + 1 欄、第 floor(i / 9) + 1 列，也就是第 i + 1 宮。這裡只有索引與牌號，
// 牌名、宮位主題用 cards[i] 與牌陣定義的 positions 查
export type LenormandDistance = 'near' | 'middle' | 'far'
export type LenormandDirection = 'past' | 'future' | 'conscious' | 'subconscious'

export interface LenormandTableauMirror {
  from: 'center' | 'theme'
  origin: number
  // 第 5 欄（中間欄）左右鏡射到自己，leftRight 與 diagonal 是 null
  leftRight: number | null
  topBottom: number | null
  diagonal: number | null
}

export interface LenormandTableau {
  // L6 中心：代表牌有出現就是它的位置；沒出現改用代表牌的宮位那一格
  center: {
    mode: 'significator' | 'house'
    cardId: number
    present: boolean
    index: number
    house: number
    col: number
    row: number
  }
  distances: Record<LenormandDistance, number[]>
  directions: Record<LenormandDirection, number[]>
  surroundings: number[]
  // L7 宮位
  houses: {
    center: { index: number; house: number }
    theme: { index: number; house: number } | null
    own: { index: number; cardId: number }[]
  }
  // L8 主題牌（畫面上叫關鍵牌）；沒有問題類型時是 null
  themeCard: {
    cardId: number
    present: boolean
    index: number
    house: number
    distance: LenormandDistance
    steps: number
    direction: { horizontal: 'past' | 'future' | 'same'; vertical: 'conscious' | 'subconscious' | 'same' }
    surroundings: number[]
  } | null
  // L10 騎士跳：從中心、主題牌走 L 形
  knighting: { from: 'center' | 'theme'; origin: number; targets: number[] }[]
  // L11 鏡射
  mirrors: LenormandTableauMirror[]
}

export interface LenormandTextSection {
  key: string
  title: string
  lines: string[]
}

export interface LenormandReadingResponse {
  deck: 'lenormand'
  mode: 'draw' | 'manual'
  question: string
  spread: { key: string; name: string; description: string; cardCount: number; grid?: { cols: number; rows: number } }
  significator: LenormandSignificator | null
  overview: string
  guidance: string
  cards: LenormandReadingCard[]
  analysis: LenormandAnalysis
  // 舊版後端可能沒有
  text?: { sections: LenormandTextSection[] }
}

export interface LenormandReadingRequest {
  question: string
  spreadKey: string
  domain?: LenormandDomain
  significator?: LenormandSignificator
}

// ---- 雷諾曼紀錄（v27 階段 6，計畫書 3-13）----
// 保存只存輸入（牌號、問題、牌陣、代表牌），分析每次讀取都依牌號重算
export interface LenormandSaveRequest extends LenormandReadingRequest {
  cards: number[]
  // 這次是自動抽還是自己選（扇形、輸入實體牌）
  mode?: 'draw' | 'manual'
  narration?: { text: string; model?: string }
}

export interface LenormandSaveResponse {
  id: string
  createdAt: string
}

// 列表的一筆：cards 只有前 5 張（大藍圖也只列 5 張）
export interface LenormandReadingSummary {
  id: string
  question: string
  domain: LenormandDomain | null
  spreadKey: string
  spreadName: string
  significator: LenormandSignificator | null
  cardCount: number
  cards: { id: number; nameZh: string }[]
  hasNarration: boolean
  createdAt: string
}

export interface LenormandReadingsResponse {
  page: number
  pageSize: number
  total: number
  readings: LenormandReadingSummary[]
}

// 詳情：和抽牌回應同一個形狀（依存下來的牌號重算），另外多了紀錄的 id、時間與 AI 解讀
export interface LenormandReadingDetail extends LenormandReadingResponse {
  id: string
  createdAt: string
  narration: { text: string; model?: string; createdAt?: string; checks?: LenormandNarrationCheck[] } | null
}

// ---- 雷諾曼 AI 解讀（v27 階段 7，計畫書 3-14）----
// 寫完的程式檢查（只給前端參考）：寫了正逆位、用了塔羅的詞、大藍圖沒提到代表牌
export type LenormandNarrationCheck = 'orientation' | 'tarotTerms' | 'noSignificator'

export interface LenormandNarrateRequest extends LenormandReadingRequest {
  cards: number[]
  // 已保存的紀錄：完整產生後後端把解讀存回那一筆
  readingId?: string
}

// NDJSON 串流的事件（ping 由 ndjsonEvents 吃掉）
export type LenormandNarrationEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; model: string; saved?: boolean | null; checks?: LenormandNarrationCheck[] }
  | { type: 'error'; message: string }
