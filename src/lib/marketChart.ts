// 股市諮詢的圖表共用設定：註冊 chart.js 元件、軸線與文字。顏色在 chartPalette.ts（黑夜／白天兩套）
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

import { CHART_COLORS } from './chartPalette'

export { CHART_COLORS }

export function axis(extra: Record<string, unknown> = {}) {
  return {
    grid: { color: CHART_COLORS.grid },
    ticks: { color: CHART_COLORS.text, font: { size: 11 } },
    border: { color: CHART_COLORS.grid },
    ...extra,
  }
}

// 圖例：寫成函式，在 computed 裡呼叫才會跟著日夜模式換字色
export function legendOptions() {
  return {
    position: 'bottom' as const,
    labels: { color: CHART_COLORS.text, boxWidth: 12, boxHeight: 2, font: { size: 11 } },
  }
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
