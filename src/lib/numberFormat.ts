// 數字顯示（2026-11-26 從 marketChart.ts 搬出來）：marketChart 一開頭就載入 chart.js，
// 只用到格式化的地方（例如匯出紀錄）import 它，chart.js 就會被拉進首頁。marketChart 照樣轉出這兩個，舊的 import 不用改
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
