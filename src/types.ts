export interface SpreadPosition {
  key: string
  label: string
  prompt: string
}

export interface Spread {
  key: string
  name: string
  cardCount: number
  description: string
  positions: SpreadPosition[]
}

export interface HealthResponse {
  status: string
  database: {
    ready: boolean
    cardCount: number
    message: string
  }
}

export interface ReadingCard {
  position: SpreadPosition
  orientation: 'upright' | 'reversed'
  interpretation: string
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
}

export interface ApiError {
  message: string
}