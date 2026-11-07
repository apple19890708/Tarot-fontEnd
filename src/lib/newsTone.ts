// 財經新聞的語氣標籤（後端用漲跌用詞統計，不是預測）。清單卡片與新聞重點彈窗共用；台股慣例：偏多紅、偏空綠
export const NEWS_TONES = {
  positive: { label: '語氣偏多', class: 'border-rose-300/40 bg-rose-300/10 text-rose-100' },
  negative: { label: '語氣偏空', class: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100' },
  neutral: { label: '語氣中性', class: 'border-white/15 bg-white/5 text-stone-300' },
} as const

export type NewsTone = keyof typeof NEWS_TONES
