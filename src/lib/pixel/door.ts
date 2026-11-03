// 居酒屋門口近景（登入、註冊）：就是街景右下那間居酒屋，用整數倍放大重畫，再補上近看才有的細節
// （瓦片接縫、木紋、暖簾的家紋與摺痕、格窗裡的客人、燈籠的骨架與流蘇）。
// 配置照街景小圖（street.ts 的 buildIzakaya）的格子座標，過場時鏡頭才能精準推到同一間店。
// 路人也是街景同一批角色（paintWalker），放大 k 倍。天空由 sky.ts 畫。
// open（0～1）是「進店」過場用的：暖簾往兩側撥開、往上掀（計畫書 2.8.2）。
import { dot, glowSprite, makeLayer, rngTools, type Ctx, type Layer, type Size } from './core'
import { makeWalker, paintWalker, type Walker, type WalkerKind } from './street'

// 小圖的 0～71 欄、14～45 列（招牌那幾列已拿掉）
const COLS = 72
const ROWS = 32
const TOP = 14

export function createDoor() {
  let W = 320
  let H = 180
  let k = 4
  let fx = 0
  let fy = 0
  let groundY = 166
  let facade: Layer
  let glow: HTMLCanvasElement
  let t = 0
  let walkers: Walker[] = []
  let nextWalker = 2
  // 窗裡的客人偶爾舉杯
  let toast = 0

  // 以小圖的格子座標畫：一格 = k×k 原生像素
  const R = (ctx: Ctx, sx: number, sy: number, sw: number, sh: number, color: string, alpha = 1) =>
    dot(ctx, fx + sx * k, fy + (sy - TOP) * k, sw * k, sh * k, color, alpha)
  const X = (sx: number) => fx + sx * k
  const Y = (sy: number) => fy + (sy - TOP) * k

  function build(size: Size) {
    ;({ W, H } = size)
    k = Math.max(2, Math.min(Math.floor((W - 8) / COLS), Math.floor((H - 30) / ROWS)))
    groundY = H - 14
    fx = Math.round((W - COLS * k) / 2)
    fy = groundY - ROWS * k
    const { r, between } = rngTools(20261106)

    facade = makeLayer(W, H)
    const g = facade.ctx
    // 屋頂：上窄下寬，隔列深淺；每列加瓦片接縫與頂端的亮線
    for (let row = 0; row < 8; row += 1) {
      const inset = Math.max(0, 4 - row)
      const color = row % 2 ? '#3a3644' : '#2a2732'
      R(g, inset, TOP + row, COLS - inset * 2, 1, color)
      dot(g, X(inset), Y(TOP + row), (COLS - inset * 2) * k, 1, row % 2 ? '#4a4656' : '#34313d')
      for (let x = X(inset) + (row % 2 ? 0 : Math.floor(k * 1.5)); x < X(COLS - inset); x += k * 3) dot(g, x, Y(TOP + row) + 1, 1, k - 1, '#1f1d26')
    }
    R(g, 0, 21, COLS, 1, '#1d1b24')
    dot(g, X(4), Y(22), 64 * k, 1, '#120f16')
    // 木牆：直條木板，接縫一暗一亮，再撒一些木紋
    R(g, 4, 22, 64, 24, '#5b3b28')
    for (let x = 6; x < 68; x += 4) {
      dot(g, X(x), Y(22), 1, 24 * k, '#4a2f20')
      dot(g, X(x) + 1, Y(22), 1, 24 * k, '#6a4630')
    }
    for (let n = 0; n < 70; n += 1) dot(g, X(4) + between(0, 64 * k - 4), Y(22) + between(2, 24 * k - 2), between(2, 4), 1, '#523424', 0.8)
    // 門口：店裡的暖光，看得到吧檯的邊和一盞吊燈
    R(g, 8, 26, 20, 20, '#f5c26b')
    R(g, 12, 30, 12, 16, '#ffd98e')
    dot(g, X(8), Y(38), 20 * k, 2, '#8a5a34')
    dot(g, X(8), Y(38) + 2, 20 * k, Y(46) - Y(38) - 2, '#c98f4a', 0.5)
    // 門框
    R(g, 7, 25, 22, 1, '#3b2618')
    R(g, 7, 25, 1, 21, '#3b2618')
    R(g, 28, 25, 1, 21, '#3b2618')
    // 格窗：外框、暖光玻璃、木格
    R(g, 35, 26, 28, 15, '#3b2618')
    R(g, 36, 27, 26, 13, '#f3bd62')
    R(g, 37, 28, 24, 11, '#f7cc78')
    const bar = Math.max(1, Math.floor(k / 2))
    for (let x = 39; x < 62; x += 4) dot(g, X(x), Y(27), bar, 13 * k, '#3b2618')
    dot(g, X(36), Y(33), 26 * k, bar, '#3b2618')
    R(g, 34, 41, 30, 1, '#3b2618')
    dot(g, X(34), Y(41), 30 * k, 1, '#5b3b28')
    // 人行道
    dot(g, 0, groundY, W, 1, '#4a4558')
    dot(g, 0, groundY + 1, W, H - groundY - 1, '#34303f')
    for (let x = 4; x < W; x += k * 3) dot(g, x, groundY + 1, 1, H - groundY - 1, '#2c2836')
    glow = glowSprite(7 * k, '#ff6a3d', 0.05)
    walkers = []
    nextWalker = 1 + r() * 3
  }

  function step(dt: number) {
    t += dt
    toast = Math.max(0, toast - dt)
    if (toast === 0 && Math.random() < dt / 6) toast = 1.2
    // 路人：同時最多兩位，從畫面外走過門前；速度跟著放大倍數，看起來和街景一樣快
    nextWalker -= dt
    if (nextWalker <= 0 && walkers.length < 2) {
      const kinds: WalkerKind[] = ['walk', 'walk', 'dog', 'bike']
      const kind = kinds[Math.floor(Math.random() * kinds.length)] as WalkerKind
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
      walkers.push(makeWalker(kind, dir === 1 ? -14 * k : W + 14 * k, dir))
      nextWalker = 3 + Math.random() * 5
    }
    for (const p of walkers) {
      p.x += p.dir * p.speed * k * dt
      p.frameTime += dt
      if (p.frameTime > (p.kind === 'bike' ? 0.1 : 0.18)) (p.frameTime = 0), (p.frame = (p.frame + 1) % 4)
    }
    walkers = walkers.filter((p) => p.x > -16 * k && p.x < W + 16 * k)
  }

  function drawNoren(ctx: Ctx, open: number) {
    // 三片暖簾（8～13、15～20、22～27 欄），中間那片有白色家紋；開門時兩側往外撥、整片往上掀
    const h = Math.max(1.5, 8 - open * 6.5)
    ctx.save()
    ctx.beginPath()
    ctx.rect(X(8), Y(25), 20 * k, 9 * k)
    ctx.clip()
    dot(ctx, X(7), Y(26) - 2, 22 * k, 2, '#1a1410')
    ;[8, 15, 22].forEach((px, i) => {
      const shift = Math.round((i - 1) * open * 4 * k)
      const sway = Math.round(Math.sin(t * 1.3 + i * 0.9) * (k / 2))
      const left = X(px) + shift
      const bodyH = Math.round((h - 1) * k)
      dot(ctx, left, Y(26), 6 * k, bodyH, '#24365e')
      dot(ctx, left + sway, Y(26) + bodyH, 6 * k, k, '#24365e')
      dot(ctx, left + sway, Y(26) + bodyH + k - 1, 6 * k, 1, '#3b5285')
      dot(ctx, left + 3 * k, Y(26), 1, bodyH, '#1d2b4a')
      if (i === 1 && h > 5) {
        const cx = left + 3 * k
        const cy = Y(29) + k
        const rr = Math.max(2, Math.round(k * 1.3))
        for (let dy = -rr; dy <= rr; dy += 1) {
          for (let dx = -rr; dx <= rr; dx += 1) {
            const d = Math.hypot(dx, dy)
            if (d <= rr && d > rr - Math.max(1, k / 2)) dot(ctx, cx + dx, cy + dy, 1, 1, '#e8e4dc')
          }
        }
      }
    })
    ctx.restore()
  }

  function drawLantern(ctx: Ctx, sx: number, phase: number) {
    const sway = Math.round(Math.sin(t * 1.4 + phase) * (k / 2))
    const cx = X(sx) + Math.round(2.5 * k) + sway
    dot(ctx, X(sx) + Math.round(2.5 * k), Y(22), 1, k, '#1a1410')
    ctx.drawImage(glow, cx - 7 * k, Y(27) - 7 * k)
    dot(ctx, cx - Math.round(1.5 * k), Y(23), 3 * k, k, '#2a1a14')
    // 燈籠身：中間寬、上下窄，每 k 列一道骨架，左邊一條亮面
    for (let row = 0; row < 6 * k; row += 1) {
      const bulge = Math.sin((row / (6 * k)) * Math.PI)
      const w = Math.round(3 * k + bulge * 2 * k)
      const x = cx - Math.floor(w / 2)
      dot(ctx, x, Y(24) + row, w, 1, row % k === k - 1 ? '#a52a1e' : '#d23d2c')
      dot(ctx, x + 1, Y(24) + row, Math.max(1, Math.floor(k / 2)), 1, '#f0694c')
    }
    dot(ctx, cx - Math.round(1.5 * k), Y(30), 3 * k, k, '#2a1a14')
    dot(ctx, cx - 1, Y(31), 2, Math.round(1.5 * k), '#d6a33a')
  }

  function drawGuests(ctx: Ctx) {
    // 格窗裡的客人：暖色剪影，中間那位偶爾舉杯
    ;[40, 48, 56].forEach((sx, i) => {
      const x = X(sx)
      const nod = Math.round(Math.sin(t * 0.8 + i * 2) * (k / 3))
      dot(ctx, x, Y(31) + nod, 2 * k, 2 * k, '#7a4a22', 0.85)
      dot(ctx, x - k, Y(33) + nod, 4 * k, 4 * k, '#7a4a22', 0.85)
      if (i === 1 && toast > 0) dot(ctx, x + 2 * k, Y(30) + nod, k, Math.round(1.5 * k), '#f2efe8', 0.9)
    })
    // 木格畫在客人前面
    const bar = Math.max(1, Math.floor(k / 2))
    for (let x = 39; x < 62; x += 4) dot(ctx, X(x), Y(27), bar, 13 * k, '#3b2618')
    dot(ctx, X(36), Y(33), 26 * k, bar, '#3b2618')
  }

  function draw(ctx: Ctx, open = 0) {
    ctx.drawImage(facade.img, 0, 0)
    drawGuests(ctx)
    drawNoren(ctx, open)
    drawLantern(ctx, 1, 0)
    drawLantern(ctx, 65, 1.7)
    for (const p of walkers) paintWalker(ctx, p, Math.round(p.x), groundY + 3 * k, k)
  }

  // 過場要用的位置：店面在畫面上的位置與放大倍數、門口正中央
  const placement = () => ({ fx, fy, k, top: TOP })
  const entranceCenter = () => ({ x: X(18), y: Y(36) })

  return { build, step, draw, placement, entranceCenter }
}
