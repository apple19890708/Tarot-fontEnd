// 像素風的牌背（計畫書 doc/v01-pixel-night-home-plan.md 2.7.4）。
// 牌面維持原圖：試過把原圖縮小再放大的像素化，效果太陽春，使用者決定不做。

// 20×30 格，深藍底、金框、菱格點、中間一彎月與四顆星。
// 程式自己畫的圖不會被跨網域限制，可以轉成網址；放進 CSS 變數，所有牌背共用一張
let cardBackUrl = ''

function drawCardBack() {
  const w = 20
  const h = 30
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const px = (x: number, y: number, color: string, cw = 1, ch = 1) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, cw, ch)
  }
  px(0, 0, '#0c0b20', w, h)
  px(1, 1, '#c9a24a', w - 2, h - 2)
  px(2, 2, '#1a1840', w - 4, h - 4)
  for (let y = 4; y < h - 4; y += 3) {
    for (let x = 4 + (y % 2); x < w - 4; x += 3) px(x, y, '#2b2860')
  }
  // 中間的彎月（亮面在左），和夜景的月亮同一種畫法
  const cx = 10
  const cy = 15
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const inMoon = Math.hypot(dx, dy) <= 3.6
      const inCut = Math.hypot(dx - 2, dy + 1) <= 3.4
      if (inMoon && !inCut) px(cx + dx, cy + dy, '#f3ecd2')
      else if (inMoon || Math.hypot(dx, dy) <= 4.4) px(cx + dx, cy + dy, '#1a1840')
    }
  }
  for (const [x, y] of [[5, 6], [14, 7], [5, 23], [14, 22]] as const) {
    px(x, y, '#e8c66a')
    px(x - 1, y, '#8a7438')
    px(x + 1, y, '#8a7438')
    px(x, y - 1, '#8a7438')
    px(x, y + 1, '#8a7438')
  }
  return canvas.toDataURL()
}

// ---- 我的紀錄的和紙菜單：48×48 格、可以重複鋪的和紙紋理（計畫書 2.8.4） ----
// 米白底，撒上纖維短線與一點雜質；只當菜單外圍的紙，內容放在裡面那塊深黑藍內頁上
let washiUrl = ''

function drawWashi() {
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#f1e7cf'
  ctx.fillRect(0, 0, size, size)
  // 固定的亂數，每次打開紋理都一樣
  let seed = 20261105
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let k = 0; k < 120; k += 1) {
    ctx.globalAlpha = 0.05 + rand() * 0.08
    ctx.fillStyle = rand() < 0.75 ? '#c9b48a' : '#ffffff'
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1)
  }
  // 纖維：幾道淡淡的短線，有橫有直
  ctx.globalAlpha = 0.08
  ctx.fillStyle = '#b8a07a'
  for (let k = 0; k < 10; k += 1) {
    const x = Math.floor(rand() * size)
    const y = Math.floor(rand() * size)
    const len = 3 + Math.floor(rand() * 6)
    if (rand() < 0.6) ctx.fillRect(x, y, len, 1)
    else ctx.fillRect(x, y, 1, len)
  }
  ctx.globalAlpha = 1
  return canvas.toDataURL()
}

// 我的紀錄 setup 時呼叫一次；菜單的 class 用 [background-image:var(--pixel-washi)]
export function installWashi() {
  if (!washiUrl) washiUrl = drawWashi()
  if (washiUrl) document.documentElement.style.setProperty('--pixel-washi', `url(${washiUrl})`)
}

// 首頁 setup 時呼叫一次；牌背的 class 用 [background-image:var(--pixel-card-back)]
export function installPixelCardBack() {
  if (!cardBackUrl) cardBackUrl = drawCardBack()
  if (cardBackUrl) document.documentElement.style.setProperty('--pixel-card-back', `url(${cardBackUrl})`)
}
