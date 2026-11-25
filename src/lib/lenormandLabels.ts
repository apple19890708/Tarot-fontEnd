// 雷諾曼結果頁的標籤文字（v27）：只把後端的結構化欄位（tone、lean、domain key）換成短標籤，用來上色與標示。
// 解讀的句子一律來自後端（text.sections、牌義），這裡不組句子
import type { LenormandDomain, LenormandLean, LenormandTone } from '../types'

export const TONE_LABELS: Record<LenormandTone, string> = { positive: '吉', negative: '凶', neutral: '中性' }

export const LEAN_LABELS: Record<LenormandLean, string> = {
  positive: '偏吉',
  negative: '偏凶',
  mixed: '吉凶混合',
  neutral: '中性',
}

// 標籤的顏色：吉用綠、凶用紅、中性用中性色（語意色，日夜模式會跟著換）
export function toneClass(tone: LenormandTone | LenormandLean) {
  if (tone === 'positive') return 'border-ok-hue/40 bg-ok-hue/10 text-ok'
  if (tone === 'negative') return 'border-danger-hue/40 bg-danger-hue/10 text-danger'
  if (tone === 'mixed') return 'border-warn/40 bg-warn/10 text-warn'
  return 'border-tint/15 bg-tint/5 text-ink-soft'
}

// 問題步驟的問題類型（不含股市，3-12）；標籤和後端 LENORMAND_DOMAINS 的 label 一致
export const LENORMAND_DOMAIN_OPTIONS: { value: LenormandDomain | ''; label: string }[] = [
  { value: '', label: '自動判斷' },
  { value: 'love', label: '感情' },
  { value: 'money', label: '財務' },
  { value: 'work', label: '工作' },
  { value: 'health', label: '健康' },
  { value: 'family', label: '家庭' },
  { value: 'social', label: '人際' },
  { value: 'study', label: '學業' },
]

// 牌義裡有對應段落的問題類型（家庭、人際、學業只有核心牌義）
export const MEANING_BY_DOMAIN: Partial<Record<LenormandDomain, { key: 'love' | 'work' | 'money' | 'health'; label: string }>> = {
  love: { key: 'love', label: '感情' },
  work: { key: 'work', label: '工作' },
  money: { key: 'money', label: '金錢' },
  health: { key: 'health', label: '健康' },
}

export const SIGNIFICATOR_OPTIONS = [
  { value: '', label: '不指定' },
  { value: '28', label: '28 紳士' },
  { value: '29', label: '29 淑女' },
]

// ---- 大藍圖（v27 階段 5）----
// 距離分組與方位的短標籤（分組本身由後端算，這裡只換成字）
export const DISTANCE_LABELS = { near: '近', middle: '中', far: '遠' } as const
// 同一列左邊是過去、右邊是未來；同一欄上方是意識、下方是潛意識（計畫書 3-5 L6）
export const DIRECTION_LABELS = {
  past: '過去（左）',
  future: '未來（右）',
  conscious: '意識（上）',
  subconscious: '潛意識（下）',
} as const
export const MIRROR_LABELS = { leftRight: '左右鏡射', topBottom: '上下鏡射', diagonal: '對角鏡射' } as const
