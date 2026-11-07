// 財經新聞的語氣標籤（後端用漲跌用詞統計，不是預測）。清單卡片與新聞重點彈窗共用；台股慣例：偏多紅、偏空綠
export const NEWS_TONES = {
  positive: { label: '語氣偏多', class: 'border-up-hue/40 bg-up-hue/10 text-up-ink' },
  negative: { label: '語氣偏空', class: 'border-down-hue/40 bg-down-hue/10 text-down-ink' },
  neutral: { label: '語氣中性', class: 'border-tint/15 bg-tint/5 text-ink-muted' },
} as const

export type NewsTone = keyof typeof NEWS_TONES
