// 街景前景：遠近兩層高樓、地面與路燈、右下的居酒屋、路人。天空由 sky.ts 畫。
// 也負責占卜流程的反應：抽牌時窗戶陸續暗下、出結果時亮回來、路人停一下（計畫書 2.7.5）。
import { MARGIN, dot, makeLayer, rngTools, shade, type Ctx, type Layer, type Size } from './core'

interface Win { x: number; y: number; w: number; h: number; lit: boolean; color: string; dim: string }
interface Beacon { x: number; y: number; phase: number }
type Skyline = Layer & { wins: Win[]; beacons: Beacon[] }
// walk：一般路人（會進居酒屋）；bike：騎腳踏車；dog：牽狗散步
export type WalkerKind = 'walk' | 'bike' | 'dog'
export interface Walker {
  kind: WalkerKind
  pet: string
  x: number
  dir: 1 | -1
  speed: number
  coat: string
  pants: string
  hair: string
  skin: string
  bag: boolean
  state: 'walk' | 'pause' | 'inside'
  timer: number
  frame: number
  frameTime: number
  visited: boolean
  // 出結果時大家停一下（秒）；跟 pause 分開，停完不會觸發走進居酒屋
  hold: number
}

const WARM = ['#f2c46a', '#f2c46a', '#fbe3a4', '#bcd6f2', '#e89a4b']
const COATS = ['#3d5a80', '#8a3b3b', '#4f6b4a', '#6b4f7a', '#a0703c', '#2f3a4f', '#b5546a']
const PANTS = ['#22252f', '#2f3442', '#3b3226', '#1d2430']
const HAIRS = ['#1b1512', '#3a2618', '#5a3a22', '#2a2a2a', '#7a5a3a']
const SKINS = ['#f0c8a0', '#d9a77a', '#c48a60', '#f5d5b5']
const DOGS = ['#c8a06a', '#f2efe8', '#3a2a20', '#8a6a4a']
const BIKES = ['#c0392b', '#2e86c1', '#d4ac0d', '#7d8c8d']
// 腳踏車和狗比人長，出畫面要多走一段才換人
const OFF = 14
// 地面圖層往上多畫 26 格，路燈才有地方立
const GROUND_TOP = 26
const pickAny = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)] as T

// 新的路人：門口近景也用同一批角色，只是放大畫
export function makeWalker(kind: WalkerKind, x: number, dir: 1 | -1): Walker {
  const r = Math.random
  return {
    kind,
    pet: kind === 'bike' ? pickAny(BIKES) : pickAny(DOGS),
    x,
    dir,
    speed: kind === 'bike' ? 20 + r() * 8 : kind === 'dog' ? 5 + r() * 3 : 7 + r() * 6,
    coat: pickAny(COATS),
    pants: pickAny(PANTS),
    hair: pickAny(HAIRS),
    skin: pickAny(SKINS),
    bag: r() < 0.35,
    state: 'walk',
    timer: 0,
    frame: Math.floor(r() * 4),
    frameTime: 0,
    visited: false,
    hold: 0,
  }
}

// ---- 路人的畫法（街景 k = 1；門口近景放大 k 倍，k ≥ 3 時補上眼睛等近看才看得到的細節）----
// 以面向右邊來寫：(c, r) 是以 x0 為左緣、width 格寬的格子，面向左邊時左右翻過來。
// x 是人物的中心，feetY 是腳底那一列的下緣
function painter(ctx: Ctx, p: Walker, x0: number, y0: number, width: number, k: number) {
  return (c: number, r: number, w: number, h: number, color: string, alpha = 1) => {
    const cc = p.dir === 1 ? c : width - 1 - c - (w - 1)
    dot(ctx, x0 + cc * k, y0 + r * k, w * k, h * k, color, alpha)
  }
}

// 近看的小細節：以格子為單位定位，再畫成 1 個原生像素
function detail(ctx: Ctx, p: Walker, x0: number, y0: number, width: number, k: number) {
  return (c: number, r: number, dx: number, dy: number, color: string) => {
    const cc = p.dir === 1 ? c : width - 1 - c
    const ddx = p.dir === 1 ? dx : k - 1 - dx
    dot(ctx, x0 + cc * k + ddx, y0 + r * k + dy, 1, 1, color)
  }
}

export function paintWalker(ctx: Ctx, p: Walker, x: number, feetY: number, k = 1) {
  const y0 = feetY - 12 * k
  if (p.kind === 'bike') return paintBike(ctx, p, x, y0, k)
  const x0 = x - 3 * k
  const put = painter(ctx, p, x0, y0, 7, k)
  if (p.kind === 'dog') paintDog(ctx, p, x, y0, k)
  put(2, 0, 3, 1, p.hair)
  put(2, 1, 3, 2, p.skin)
  put(2, 1, 1, 2, p.hair)
  put(1, 3, 5, 1, p.coat)
  put(2, 4, 3, 4, p.coat)
  put(1, 4, 1, 3, shade(p.coat, 0.75))
  put(5, 4, 1, 3, shade(p.coat, 0.75))
  if (p.bag) put(5, 6, 1, 2, '#8a5a3a')
  if (p.state === 'walk' && p.hold <= 0 && p.frame % 2 === 0) {
    put(2, 8, 1, 3, p.pants)
    put(4, 8, 1, 3, shade(p.pants, 0.8))
    put(1, 11, 2, 1, '#111')
    put(4, 11, 2, 1, '#111')
  } else {
    put(2, 8, 1, 3, shade(p.pants, 0.8))
    put(3, 8, 1, 3, p.pants)
    put(2, 11, 3, 1, '#111')
  }
  if (k >= 3) {
    const d = detail(ctx, p, x0, y0, 7, k)
    const half = Math.floor(k / 2)
    // 眼睛、嘴角、領口、外套的扣子、手
    d(4, 1, half, half, '#1b1512')
    d(4, 2, half - 1, k - 2, shade(p.skin, 0.8))
    for (let dx = 0; dx < k; dx += 1) d(3, 3, dx, k - 1, shade(p.coat, 1.25))
    d(3, 5, half, half, shade(p.coat, 0.6))
    d(3, 6, half, half, shade(p.coat, 0.6))
    for (let dy = 0; dy < k; dy += 1) d(5, 7, 0, dy, p.skin)
  }
}

// 狗走在主人前面 8 格，牽繩從主人的手拉到狗的項圈
function paintDog(ctx: Ctx, p: Walker, x: number, y0: number, k: number) {
  const dogX = x + p.dir * 8 * k
  const put = painter(ctx, p, dogX - 3 * k, y0, 6, k)
  const stepping = p.frame % 2 === 0
  put(1, 9, 4, 2, p.pet)
  put(4, 8, 2, 2, p.pet)
  put(4, 7, 1, 1, shade(p.pet, 0.7))
  put(5, 9, 1, 1, '#111')
  put(0, stepping ? 8 : 9, 1, 1, p.pet)
  put(stepping ? 1 : 2, 11, 1, 1, shade(p.pet, 0.7))
  put(stepping ? 4 : 3, 11, 1, 1, shade(p.pet, 0.7))
  if (k >= 3) detail(ctx, p, dogX - 3 * k, y0, 6, k)(4, 8, k - 1, 1, '#111')
  const hx = x - 3 * k + (p.dir === 1 ? 5 : 1) * k + Math.floor(k / 2)
  const hy = y0 + 6 * k
  const cx = dogX - 3 * k + (p.dir === 1 ? 4 : 1) * k + Math.floor(k / 2)
  const cy = y0 + 9 * k
  const n = Math.max(Math.abs(cx - hx), Math.abs(cy - hy))
  for (let s = 1; s < n; s += 1) dot(ctx, Math.round(hx + ((cx - hx) * s) / n), Math.round(hy + ((cy - hy) * s) / n), 1, 1, '#d8d4cc', 0.8)
}

// 腳踏車：11 格寬，前後輪各一個 5×5 的圈，輪軸那一點輪流換位置做出轉動感
function paintBike(ctx: Ctx, p: Walker, x: number, y0: number, k: number) {
  const x0 = x - 5 * k
  const put = painter(ctx, p, x0, y0, 11, k)
  const spin = p.frame % 2 === 0
  for (const c of [2, 8]) {
    put(c - 1, 7, 3, 1, '#1a1a1a')
    put(c - 1, 11, 3, 1, '#1a1a1a')
    put(c - 2, 8, 1, 3, '#1a1a1a')
    put(c + 2, 8, 1, 3, '#1a1a1a')
    if (spin) put(c, 8, 1, 3, '#555')
    else put(c - 1, 9, 3, 1, '#555')
  }
  put(3, 8, 5, 1, p.pet)
  put(4, 6, 1, 2, p.pet)
  put(7, 6, 1, 2, p.pet)
  put(3, 5, 3, 1, '#222')
  put(7, 5, 2, 1, '#222')
  put(4, 0, 3, 1, p.hair)
  put(4, 1, 3, 2, p.skin)
  put(4, 1, 1, 2, p.hair)
  put(4, 3, 3, 2, p.coat)
  put(7, 4, 1, 1, shade(p.coat, 0.75))
  if (spin) {
    put(5, 5, 1, 3, p.pants)
    put(5, 8, 2, 1, '#111')
  } else {
    put(4, 5, 1, 2, p.pants)
    put(5, 7, 1, 1, p.pants)
    put(4, 8, 2, 1, '#111')
  }
  if (k >= 3) detail(ctx, p, x0, y0, 11, k)(6, 1, Math.floor(k / 2), Math.floor(k / 2), '#1b1512')
}

export function createStreet() {
  let W = 320
  let H = 180
  let groundY = 164
  let izX = 0
  let doorX = 0
  let far: Skyline
  let near: Skyline
  let ground: Layer
  let izakaya: Layer
  let walkers: Walker[] = []
  let guestsInside = 0
  // 近景大樓最高的樓頂（y 越小越高）；星夜場景靠它算要沉多少，底下才剛好露出一排樓頂
  let highestRoof = 0
  let t = 0
  // 窗戶明暗：dim 時把亮著的窗記下來、每格關掉一批；restore 時照記下的清單每格開回一批，約 2 秒做完
  let dimMode: 'none' | 'dim' | 'restore' = 'none'
  let dimSaved: { layer: Skyline; win: Win }[] = []

  const drawWin = (ctx: Ctx, win: Win) => dot(ctx, win.x, win.y, win.w, win.h, win.lit ? win.color : win.dim)

  function buildSkyline(kind: 'far' | 'near', rng: ReturnType<typeof rngTools>): Skyline {
    const { r, between, pick } = rng
    const lw = W + MARGIN * 2
    const layer = makeLayer(lw, groundY)
    const wins: Win[] = []
    const beacons: Beacon[] = []
    const isNear = kind === 'near'
    const minH = Math.round(groundY * (isNear ? 0.25 : 0.18))
    const maxH = Math.round(groundY * (isNear ? 0.62 : 0.4))
    let x = isNear ? between(0, 6) : 0
    while (x < lw) {
      const bw = isNear ? between(16, 32) : between(12, 24)
      const bh = between(minH, maxH)
      const top = groundY - bh
      if (isNear) highestRoof = Math.min(highestRoof, top)
      dot(layer.ctx, x, top, bw, bh, isNear ? pick(['#1b1e33', '#20223a', '#191b2e']) : '#14162a')
      // 月亮在左邊：左緣、頂端亮一條
      dot(layer.ctx, x, top, 1, bh, isNear ? '#2b3050' : '#1b1e35')
      dot(layer.ctx, x, top, bw, 1, isNear ? '#2b3050' : '#1b1e35')
      const ww = isNear ? pick([2, 2, 1]) : 1
      const wh = isNear ? pick([2, 3, 2]) : 1
      const stepX = isNear ? ww + 2 : 3
      const stepY = isNear ? wh + 3 : 3
      const litRate = isNear ? 0.45 + r() * 0.4 : 0.3
      for (let wy = top + 3; wy + wh <= groundY - 3; wy += stepY) {
        for (let wx = x + 2; wx + ww <= x + bw - 2; wx += stepX) {
          const win: Win = {
            x: wx,
            y: wy,
            w: ww,
            h: wh,
            lit: r() < litRate,
            color: isNear ? pick(WARM) : pick(['#8a6e3c', '#c39a52', '#6d5a3a']),
            dim: isNear ? '#262a42' : '#1a1c30',
          }
          wins.push(win)
          drawWin(layer.ctx, win)
        }
      }
      if (isNear && bh > maxH * 0.7) {
        const ax = x + Math.floor(bw / 2)
        dot(layer.ctx, ax, top - 4, 1, 4, '#2b3050')
        beacons.push({ x: ax, y: top - 5, phase: r() * Math.PI * 2 })
      } else if (!isNear && r() < 0.3) {
        dot(layer.ctx, x + 3, top - 3, 1, 3, '#1b1e35')
      }
      x += bw + (isNear ? between(0, 3) : 0)
    }
    return { ...layer, wins, beacons }
  }

  function buildGround() {
    const lw = W + MARGIN * 2
    const gh = H - groundY + GROUND_TOP
    ground = makeLayer(lw, gh)
    const g = ground.ctx
    const y0 = GROUND_TOP
    dot(g, 0, y0, lw, 1, '#4a4558')
    dot(g, 0, y0 + 1, lw, 5, '#34303f')
    for (let x = 4; x < lw; x += 8) dot(g, x, y0 + 1, 1, 5, '#2c2836')
    dot(g, 0, y0 + 6, lw, 1, '#1c1a25')
    dot(g, 0, y0 + 7, lw, gh - y0 - 7, '#16141e')
    if (gh - y0 > 12) for (let x = 2; x < lw; x += 14) dot(g, x, gh - 5, 6, 1, '#3a3546')
    // 路燈：避開居酒屋，燈下打一圈光
    for (let x = 24; x < lw; x += 88) {
      if (x > izX + MARGIN - 6) break
      for (let dy = -18; dy <= 5; dy += 1) {
        const half = Math.round((dy + 19) * 0.32)
        dot(g, x + 4 - half, y0 + dy, half * 2 + 1, 1, '#ffd98a', dy > 0 ? 0.16 : 0.05)
      }
      dot(g, x, y0 - 20, 1, 23, '#2e2c3a')
      dot(g, x, y0 - 20, 4, 1, '#2e2c3a')
      dot(g, x + 3, y0 - 19, 3, 1, '#ffeab0')
    }
  }

  // 右下角的居酒屋：瓦屋頂、木牆、暖簾、格窗（不放招牌字）。燈籠和店裡的客人是動態的，另外畫
  function buildIzakaya() {
    izakaya = makeLayer(72, 46)
    const z = izakaya.ctx
    for (let r = 0; r < 8; r += 1) {
      const inset = Math.max(0, 4 - r)
      dot(z, inset, 14 + r, 72 - inset * 2, 1, r % 2 ? '#3a3644' : '#2a2732')
    }
    dot(z, 0, 21, 72, 1, '#1d1b24')
    dot(z, 4, 22, 64, 24, '#5b3b28')
    for (let x = 6; x < 68; x += 4) dot(z, x, 22, 1, 24, '#4a2f20')
    dot(z, 8, 26, 20, 20, '#f5c26b')
    dot(z, 12, 30, 12, 16, '#ffd98e')
    dot(z, 8, 26, 20, 8, '#24365e')
    dot(z, 14, 26, 1, 8, '#f5c26b')
    dot(z, 21, 26, 1, 8, '#f5c26b')
    dot(z, 17, 29, 2, 2, '#e8e4dc')
    dot(z, 7, 25, 22, 1, '#3b2618')
    dot(z, 35, 26, 28, 15, '#3b2618')
    dot(z, 36, 27, 26, 13, '#f3bd62')
    for (let x = 39; x < 62; x += 4) dot(z, x, 27, 1, 13, '#3b2618')
    dot(z, 36, 33, 26, 1, '#3b2618')
    dot(z, 34, 41, 30, 1, '#3b2618')
  }

  function newWalker(kind: WalkerKind, spread: boolean): Walker {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const offscreen = dir === 1 ? -MARGIN - OFF - Math.random() * 40 : W + MARGIN + OFF + Math.random() * 40
    return makeWalker(kind, spread ? Math.random() * W : offscreen, dir)
  }

  function build(size: Size, dimmed: boolean) {
    ;({ W, H, groundY } = size)
    izX = W - 76
    doorX = izX + 18
    const rng = rngTools(20261103)
    highestRoof = groundY
    far = buildSkyline('far', rng)
    near = buildSkyline('near', rng)
    buildGround()
    buildIzakaya()
    guestsInside = 0
    dimSaved = []
    dimMode = 'none'
    if (dimmed) dim(true)
    const kinds: WalkerKind[] = W < 240 ? ['walk', 'bike', 'dog'] : ['walk', 'walk', 'walk', 'bike', 'dog']
    walkers = kinds.map((k) => newWalker(k, true))
  }

  // ---- 占卜流程的反應 ----
  function litWindows() {
    const list: { layer: Skyline; win: Win }[] = []
    for (const layer of [near, far]) for (const win of layer.wins) if (win.lit) list.push({ layer, win })
    return list
  }

  function dim(instant: boolean) {
    if (dimMode === 'dim') return
    if (dimMode === 'none') dimSaved = litWindows()
    dimMode = 'dim'
    if (instant) for (const { layer, win } of dimSaved) (win.lit = false), drawWin(layer.ctx, win)
  }

  function restore(instant: boolean) {
    if (dimMode === 'none') return
    dimMode = 'restore'
    if (instant) {
      for (const { layer, win } of dimSaved) (win.lit = true), drawWin(layer.ctx, win)
      dimSaved = []
      dimMode = 'none'
    }
  }

  function holdWalkers() {
    for (const p of walkers) p.hold = 1
  }

  // 每格處理一批，約 2 秒（24 格）做完；順序打亂才會是「陸續」
  function stepDim() {
    if (dimMode === 'none') return
    const batch = Math.max(1, Math.ceil(dimSaved.length / 24))
    const targetLit = dimMode === 'restore'
    const pending = dimSaved.filter(({ win }) => win.lit !== targetLit)
    for (let k = 0; k < batch && pending.length; k += 1) {
      const [item] = pending.splice(Math.floor(Math.random() * pending.length), 1)
      if (!item) break
      item.win.lit = targetLit
      drawWin(item.layer.ctx, item.win)
    }
    if (dimMode === 'restore' && pending.length === 0) {
      dimMode = 'none'
      dimSaved = []
    }
  }

  function stepWalker(p: Walker, dt: number) {
    if (p.hold > 0) {
      p.hold -= dt
      return
    }
    if (p.state === 'walk') {
      p.x += p.dir * p.speed * dt
      p.frameTime += dt
      if (p.frameTime > (p.kind === 'bike' ? 0.1 : 0.18)) {
        p.frameTime = 0
        p.frame = (p.frame + 1) % 4
      }
      // 只有一般路人會停在居酒屋門口、走進去
      if (p.kind === 'walk' && !p.visited && Math.abs(p.x - doorX) < 1.5) {
        p.visited = true
        if (Math.random() < 0.45) {
          p.state = 'pause'
          p.timer = 1 + Math.random() * 1.5
        }
      }
      if ((p.dir === 1 && p.x > W + MARGIN + OFF) || (p.dir === -1 && p.x < -MARGIN - OFF)) Object.assign(p, newWalker(p.kind, false))
    } else if (p.state === 'pause') {
      p.timer -= dt
      if (p.timer <= 0) {
        if (Math.random() < 0.55) {
          p.state = 'inside'
          p.timer = 4 + Math.random() * 6
          guestsInside += 1
        } else {
          p.state = 'walk'
        }
      }
    } else {
      p.timer -= dt
      if (p.timer <= 0) {
        p.state = 'walk'
        p.x = doorX
        p.dir = Math.random() < 0.5 ? 1 : -1
        guestsInside = Math.max(0, guestsInside - 1)
      }
    }
  }

  function step(dt: number) {
    t += dt
    stepDim()
    // 窗戶隨機明滅；抽牌時（暗下、亮回來的途中）不做，免得把剛關的又打開
    if (dimMode === 'none') {
      if (Math.random() < 0.4 && near.wins.length) {
        const w = near.wins[Math.floor(Math.random() * near.wins.length)] as Win
        if (!w.lit || Math.random() < 0.4) (w.lit = !w.lit), drawWin(near.ctx, w)
      }
      if (Math.random() < 0.15 && far.wins.length) {
        const w = far.wins[Math.floor(Math.random() * far.wins.length)] as Win
        ;(w.lit = !w.lit), drawWin(far.ctx, w)
      }
    }
    for (const p of walkers) stepWalker(p, dt)
  }

  function drawWalker(ctx: Ctx, p: Walker, ox: number, oy: number) {
    if (p.state === 'inside') return
    paintWalker(ctx, p, Math.round(p.x) + ox, groundY + 4 + oy, 1)
  }

  function drawIzakaya(ctx: Ctx, ox: number, oy: number) {
    const x = izX + ox
    const y = groundY - 45 + oy
    ctx.drawImage(izakaya.img, x, y)
    // 店裡的客人：走進去幾個人，窗上就多幾個剪影
    for (let k = 0; k < Math.min(guestsInside, 4); k += 1) {
      const sx = x + 38 + k * 6
      dot(ctx, sx, y + 31, 2, 2, '#7a4a22')
      dot(ctx, sx - 1, y + 33, 4, 3, '#7a4a22')
    }
    for (const [lx, phase] of [[1, 0], [65, 1.7]] as const) {
      const sway = Math.round(Math.sin(t * 1.6 + phase) * 0.8)
      const bx = x + lx + sway
      for (let dy = -6; dy <= 6; dy += 1) {
        for (let dx = -6; dx <= 6; dx += 1) if (Math.hypot(dx, dy) <= 6) dot(ctx, bx + 2 + dx, y + 27 + dy, 1, 1, '#ff6a3d', 0.07)
      }
      dot(ctx, x + lx + 2, y + 22, 1, 2, '#2a1a14')
      dot(ctx, bx + 1, y + 23, 3, 1, '#2a1a14')
      dot(ctx, bx, y + 24, 5, 6, '#d23d2c')
      dot(ctx, bx + 1, y + 25, 1, 4, '#f0694c')
      dot(ctx, bx + 1, y + 30, 3, 1, '#2a1a14')
    }
  }

  // offY：鏡頭往上搖時整片往下沉；par：滑鼠視差（-1～1）
  function draw(ctx: Ctx, offY = 0, par = 0) {
    const o = (f: number) => Math.round(par * f)
    ctx.drawImage(far.img, -MARGIN + o(2.5), offY)
    const nx = -MARGIN + o(4)
    ctx.drawImage(near.img, nx, offY)
    for (const b of near.beacons) {
      if (Math.sin(t * 2.4 + b.phase) > 0.2) {
        dot(ctx, nx + b.x - 1, b.y - 1 + offY, 3, 3, '#ff3b3b', 0.18)
        dot(ctx, nx + b.x, b.y + offY, 1, 1, '#ff4d4d')
      }
    }
    const go = o(6)
    ctx.drawImage(ground.img, -MARGIN + go, groundY - GROUND_TOP + offY)
    drawIzakaya(ctx, go, offY)
    for (const p of walkers) drawWalker(ctx, p, go, offY)
  }

  // 居酒屋小圖在街景裡的左上角（不含視差）；門口近景照它放大，過場才對得準
  const izakayaOrigin = () => ({ x: izX, y: groundY - 45 })

  // 星夜（管理頁）時街景往下沉多少：最高的樓頂落在畫面高度 70% 的地方（84% 使用者覺得露太少），底下露出一排樓頂
  const skySink = () => Math.max(0, Math.round(H * 0.7 - highestRoof))

  return { build, step, draw, dim, restore, holdWalkers, izakayaOrigin, skySink }
}
