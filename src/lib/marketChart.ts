// 股市諮詢的圖表共用設定：註冊 chart.js 元件、深色主題的軸線與文字、各條線的顏色。
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
)

export const CHART_COLORS = {
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
  baseline: 'rgba(214,211,209,0.45)',
  horizons: ['#fcd34d', '#fda4af', '#93c5fd'],
  strategies: {
    buyHold: '#e7e5e4',
    maCross: '#fcd34d',
    kd: '#fda4af',
    rsi: '#6ee7b7',
    macd: '#7dd3fc',
  } as Record<string, string>,
}

export function axis(extra: Record<string, unknown> = {}) {
  return {
    grid: { color: CHART_COLORS.grid },
    ticks: { color: CHART_COLORS.text, font: { size: 11 } },
    border: { color: CHART_COLORS.grid },
    ...extra,
  }
}

export const legendOptions = {
  position: 'bottom' as const,
  labels: { color: CHART_COLORS.text, boxWidth: 12, boxHeight: 2, font: { size: 11 } },
}

// 日期標籤只顯示月／日
export function shortDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5).replace('-', '/') : date
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) {
    return '—'
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function formatSigned(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined) {
    return '—'
  }
  return `${value > 0 ? '+' : ''}${formatNumber(value)}${suffix}`
}
