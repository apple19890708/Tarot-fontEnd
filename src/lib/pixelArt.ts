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

// ---- 雷諾曼的牌背（v27 3-3）：花園與藤蔓 ----
// 和塔羅牌背同樣 20×30 格。深苔綠底、淡金框，藤蔓沿著左右兩側往上爬、交錯長出葉子，
// 四角與中間開白色小花，中間一朵五瓣花配淡紫花心，和原創牌面（米白、淡金、灰綠、淡紫）同一組顏色
let lenormandBackUrl = ''

function drawLenormandCardBack() {
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
  const FRAME = '#d8c48a'
  const GROUND = '#1f3326'
  const GROUND_DOT = '#2a4532'
  const VINE = '#6f9a6a'
  const LEAF = '#9cc08a'
  const PETAL = '#f4efe0'
  const HEART = '#b9a2d4'

  px(0, 0, '#142219', w, h)
  px(1, 1, FRAME, w - 2, h - 2)
  px(2, 2, GROUND, w - 4, h - 4)
  // 底紋：稀疏的小點，像草地
  for (let y = 5; y < h - 5; y += 4) {
    for (let x = 6 + (y % 3); x < w - 6; x += 4) px(x, y, GROUND_DOT)
  }
  // 藤蔓：左右兩側各一條，左右擺動往上爬，每隔幾格長一片葉子（左右交錯）
  for (let y = 3; y < h - 3; y += 1) {
    const sway = Math.round(Math.sin(y / 2.2))
    const left = 4 + sway
    const right = w - 5 - sway
    px(left, y, VINE)
    px(right, y, VINE)
    if (y % 4 === 1) {
      px(left + (y % 8 === 1 ? 1 : -1), y, LEAF)
      px(right + (y % 8 === 1 ? -1 : 1), y, LEAF)
    }
  }
  // 小花：白色花瓣、淡紫花心
  const flower = (cx: number, cy: number) => {
    px(cx, cy - 1, PETAL)
    px(cx - 1, cy, PETAL)
    px(cx + 1, cy, PETAL)
    px(cx, cy + 1, PETAL)
    px(cx, cy, HEART)
  }
  for (const [x, y] of [[4, 4], [15, 4], [4, 25], [15, 25]] as const) flower(x, y)
  // 中間的大花：五瓣（上、左上、右上、左下、右下）＋花心，下面一段莖與兩片葉
  const cx = 10
  const cy = 13
  px(cx - 1, cy - 3, PETAL, 2, 2)
  px(cx - 3, cy - 1, PETAL, 2, 2)
  px(cx + 1, cy - 1, PETAL, 2, 2)
  px(cx - 2, cy + 1, PETAL, 2, 2)
  px(cx, cy + 1, PETAL, 2, 2)
  px(cx - 1, cy - 1, HEART, 2, 2)
  px(cx, cy + 3, VINE, 1, 6)
  px(cx - 2, cy + 5, LEAF, 2, 1)
  px(cx + 1, cy + 7, LEAF, 2, 1)
  return canvas.toDataURL()
}

// 雷諾曼頁進來時換成花園牌背；離開時呼叫 installPixelCardBack() 換回塔羅的，
// 其他頁（月曆的每日一牌）才不會留著雷諾曼的牌背。FanDeck、StepDraw、FlyingCard 都吃這個 CSS 變數，不用改
export function installLenormandCardBack() {
  if (!lenormandBackUrl) lenormandBackUrl = drawLenormandCardBack()
  if (lenormandBackUrl) document.documentElement.style.setProperty('--pixel-card-back', `url(${lenormandBackUrl})`)
}
