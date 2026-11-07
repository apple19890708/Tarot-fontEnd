// 圖表顏色分黑夜／白天兩套（計畫書 v18）。股市圖表（marketChart.ts 轉出）與塔羅量化雷達圖共用；
// 獨立成一個檔，塔羅頁不用載入股市圖表的 chart.js 註冊。
// CHART_COLORS 是 reactive，切換日夜模式時整組換掉，用到它的 computed（data、options）會重算、圖表跟著重畫。
// 所以圖表的顏色一律寫在 computed 或函式裡，不要存成模組層級的常數
import { reactive, watch } from 'vue'

import { theme, type Theme } from './theme'

type ChartPalette = {
  text: string
  grid: string
  price: string
  ma5: string
  ma20: string
  ma60: string
  volume: string
  up: string
  down: string
  // 半透明的漲跌：成交量柱（K 棒用實色）
  upFaded: string
  downFaded: string
  // 線圖底下的淡色填滿
  upFill: string
  downFill: string
  baseline: string
  // 和其他顏色並列時的「中性」色塊：自營商、持股成本
  neutral: string
  neutralSoft: string
  // 塔羅量化的雷達圖（金色）
  radar: string
  radarFill: string
  radarPointBorder: string
  // 面板底色（圓餅圖的間隔線）、實心價格標上的字
  surface: string
  onMark: string
  horizons: string[]
  strategies: Record<string, string>
}

const NIGHT: ChartPalette = {
  text: 'rgba(214,211,209,0.75)',
  grid: 'rgba(255,255,255,0.08)',
  price: '#f5f5f4',
  ma5: '#fcd34d',
  ma20: '#fda4af',
  ma60: '#93c5fd',
  volume: 'rgba(255,255,255,0.12)',
  // 台灣習慣：漲紅跌綠；壓力在上方用紅、支撐在下方用綠
  up: '#fda4af',
  down: '#6ee7b7',
  upFaded: 'rgba(253,164,175,0.4)',
  downFaded: 'rgba(110,231,183,0.4)',
  upFill: 'rgba(253,164,175,0.12)',
  downFill: 'rgba(110,231,183,0.12)',
  baseline: 'rgba(214,211,209,0.45)',
  neutral: 'rgba(214,211,209,0.45)',
  neutralSoft: 'rgba(214,211,209,0.35)',
  radar: 'rgba(252,211,77,0.8)',
  radarFill: 'rgba(252,211,77,0.18)',
  radarPointBorder: 'rgba(15,23,42,1)',
  surface: '#0f1526',
  onMark: '#0f1526',
  horizons: ['#fcd34d', '#fda4af', '#93c5fd'],
  strategies: {
    buyHold: '#e7e5e4',
    maCross: '#fcd34d',
    kd: '#fda4af',
    rsi: '#6ee7b7',
    macd: '#7dd3fc',
  },
}

// 白天：和紙底上用深一階的色；漲跌和 style.css 的 --c-up／--c-down 一致
const DAY: ChartPalette = {
  text: 'rgba(42,26,20,0.75)',
  grid: 'rgba(59,38,24,0.12)',
  price: '#2a1a14',
  ma5: '#b7791f',
  ma20: '#be185d',
  ma60: '#2f5d86',
  volume: 'rgba(59,38,24,0.18)',
  up: '#b42318',
  down: '#1f6b45',
  upFaded: 'rgba(180,35,24,0.4)',
  downFaded: 'rgba(31,107,69,0.4)',
  upFill: 'rgba(180,35,24,0.1)',
  downFill: 'rgba(31,107,69,0.1)',
  baseline: 'rgba(42,26,20,0.45)',
  neutral: 'rgba(92,74,61,0.45)',
  neutralSoft: 'rgba(92,74,61,0.3)',
  radar: 'rgba(183,121,31,0.9)',
  radarFill: 'rgba(183,121,31,0.18)',
  radarPointBorder: '#fbf6ea',
  surface: '#fbf6ea',
  onMark: '#ffffff',
  horizons: ['#b7791f', '#be185d', '#2f5d86'],
  strategies: {
    buyHold: '#44342a',
    maCross: '#b7791f',
    kd: '#be185d',
    rsi: '#1f6b45',
    macd: '#0369a1',
  },
}

const PALETTES: Record<Theme, ChartPalette> = { night: NIGHT, day: DAY }

export const CHART_COLORS = reactive<ChartPalette>({ ...PALETTES[theme.value] })
watch(theme, (value) => Object.assign(CHART_COLORS, PALETTES[value]))
