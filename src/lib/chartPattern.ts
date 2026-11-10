// 圖表的斜線紋（v20）：「推估」「預估」這類不確定的數字用同一個顏色的斜線，不只靠深淺分辨（色弱、黑白列印也看得出來）。
// 每月股利預估圖與「預估準不準」共用。顏色由呼叫端從 CHART_COLORS 取（寫在 computed 裡，日夜模式切換會重畫）
export function stripePattern(color: string, background: string): CanvasPattern | string {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')
  if (!ctx) return background
  ctx.fillStyle = background
  ctx.fillRect(0, 0, 8, 8)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-2, 10)
  ctx.lineTo(10, -2)
  ctx.moveTo(-2, 2)
  ctx.lineTo(2, -2)
  ctx.moveTo(6, 10)
  ctx.lineTo(10, 6)
  ctx.stroke()
  return ctx.createPattern(canvas, 'repeat') ?? background
}
