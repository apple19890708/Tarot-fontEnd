// 像素世界的共用工具（計畫書 doc/v01-pixel-night-home-plan.md 2.8）
// 所有場景都畫在同一張低解析度畫布上（高約 180 格，整數倍放大），格子大小因此一致。

export type Ctx = CanvasRenderingContext2D
export interface Layer {
  img: HTMLCanvasElement
  ctx: Ctx
}
export interface Size {
  W: number
  H: number
  // 街景的地面高度；星夜用它分配天空色帶，門口和店內各自另算
  groundY: number
}

// 場景排成一條線，過場就是沿著這條線一段一段走：星夜 — 街景 — 門口 — 店內
export type SceneKey = 'sky' | 'city' | 'door' | 'interior'
export const SCENE_CHAIN: SceneKey[] = ['sky', 'city', 'door', 'interior']

// 視差最多移 6 格，街景圖層左右各多畫 8 格，移動時才不會露出邊
export const MARGIN = 8

export const SKY = ['#0a0c22', '#0f1230', '#15183b', '#1d1d47', '#272352', '#33295a']

// 固定種子：每次打開，窗戶怎麼亮、星星在哪裡都一樣
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngTools(seed: number) {
  const r = seeded(seed)
  return {
    r,
    between: (a: number, b: number) => a + Math.floor(r() * (b - a + 1)),
    pick: <T>(list: readonly T[], rr: () => number = r) => list[Math.floor(rr() * list.length)] as T,
  }
}

export function makeLayer(w: number, h: number): Layer {
  const img = document.createElement('canvas')
  img.width = Math.max(1, w)
  img.height = Math.max(1, h)
  return { img, ctx: img.getContext('2d') as Ctx }
}

export function dot(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  ctx.globalAlpha = 1
}

// 顏色加深，用來做暗面
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`
}

// 圓形光暈預先畫成一張小圖，每格貼上去就好
export function glowSprite(radius: number, color: string, alpha: number) {
  const layer = makeLayer(radius * 2 + 1, radius * 2 + 1)
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const d = Math.hypot(dx, dy)
      if (d <= radius) dot(layer.ctx, radius + dx, radius + dy, 1, 1, color, alpha * (d <= radius * 0.5 ? 1.6 : 1))
    }
  }
  return layer.img
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const lerp = (a: number, b: number, q: number) => a + (b - a) * q
