// 星夜：漸層天空、星星、彎月、雲、流星。街景、門口都畫在它上面，管理頁只有它。
import { SKY, dot, makeLayer, rngTools, type Ctx, type Layer, type Size } from './core'

interface Star { x: number; y: number; twinkle: boolean; big: boolean; level: number; phase: number; speed: number }
interface Cloud { img: HTMLCanvasElement; x: number; y: number; speed: number }
interface Meteor { x: number; y: number; life: number }

const STAR_LEVELS = ['#4b4f78', '#8d92bb', '#d6d8f0', '#fbf9ff']
const MOON_Y = 30

export function createSky() {
  let W = 320
  let H = 180
  let groundY = 164
  let grad: Layer
  let moon: Layer
  let moonX = 0
  let stars: Star[] = []
  let clouds: Cloud[] = []
  let meteors: Meteor[] = []
  // 逆位：一朵雲移到月亮前面停 2 秒再離開
  let cover: { cloud: Cloud; phase: 'in' | 'hold'; timer: number } | null = null
  let t = 0

  function buildCloud(w: number, h: number) {
    const layer = makeLayer(w, h)
    const blobs = [
      [w * 0.25, h * 0.62, h * 0.42],
      [w * 0.5, h * 0.42, h * 0.55],
      [w * 0.75, h * 0.6, h * 0.4],
      [w * 0.38, h * 0.7, h * 0.35],
    ] as const
    const inside = (x: number, y: number) => y < h && blobs.some(([bx, by, br]) => Math.hypot(x - bx, (y - by) * 1.4) <= br)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!inside(x, y)) continue
        dot(layer.ctx, x, y, 1, 1, !inside(x, y - 1) ? '#423c66' : !inside(x, y + 1) ? '#1f1c36' : '#2c2948')
      }
    }
    return layer.img
  }

  function build(size: Size) {
    ;({ W, H, groundY } = size)
    const { r, between } = rngTools(20261102)
    grad = makeLayer(W, H)
    const band = groundY / SKY.length
    for (let y = 0; y < H; y += 1) {
      const i = Math.min(SKY.length - 1, Math.floor(y / band))
      dot(grad.ctx, 0, y, W, 1, SKY[i] as string)
      // 色帶交界做兩列棋盤格，像素畫的漸層
      if (i < SKY.length - 1 && y - i * band > band - 3) {
        for (let x = y % 2; x < W; x += 2) dot(grad.ctx, x, y, 1, 1, SKY[i + 1] as string)
      }
    }
    stars = Array.from({ length: Math.round(W * 0.16) }, () => ({
      x: between(0, W - 1),
      y: between(2, Math.max(4, Math.round(groundY * 0.55))),
      twinkle: r() < 0.25,
      big: r() < 0.08,
      level: between(0, 2),
      phase: r() * Math.PI * 2,
      speed: 0.8 + r() * 1.6,
    }))

    // 彎月（亮面在左）：整顆圓扣掉一顆往右上偏的圓
    const mr = 8
    const c = mr + 3
    const cut = (dx: number, dy: number) => Math.hypot(dx - 4, dy + 1) <= mr
    moon = makeLayer(c * 2 + 1, c * 2 + 1)
    for (let dy = -c; dy <= c; dy += 1) {
      for (let dx = -c; dx <= c; dx += 1) {
        const d = Math.hypot(dx, dy)
        if (d <= mr + 0.5) dot(moon.ctx, c + dx, c + dy, 1, 1, cut(dx, dy) ? '#1f2240' : cut(dx + 1, dy) ? '#d8d0b0' : '#f3ecd2')
        else if (d <= mr + 1.5 && !cut(dx, dy)) dot(moon.ctx, c + dx, c + dy, 1, 1, '#f3ecd2', 0.2)
        else if (d <= mr + 3 && !cut(dx, dy)) dot(moon.ctx, c + dx, c + dy, 1, 1, '#f3ecd2', 0.07)
      }
    }
    moonX = Math.round(W * 0.2)

    clouds = [
      [34, 10],
      [44, 12],
      [26, 9],
    ].map(([w, h], k) => ({
      img: buildCloud(w as number, h as number),
      x: Math.round(W * (0.15 + k * 0.33)),
      y: between(14, Math.max(16, Math.round(groundY * 0.35))),
      speed: 0.6 + r() * 0.7,
    }))
    meteors = []
    cover = null
  }

  function launchMeteor() {
    meteors.push({ x: W * (0.6 + Math.random() * 0.35), y: 6 + Math.random() * groundY * 0.25, life: 0 })
  }

  function coverMoon() {
    const cloud = clouds[0]
    if (cloud) cover = { cloud, phase: 'in', timer: 2 }
  }

  // ambient：管理頁的星夜沒有占卜事件，自己偶爾放一顆流星
  function step(dt: number, ambient = false) {
    t += dt
    for (const c of clouds) {
      if (cover?.cloud === c) continue
      c.x -= c.speed * dt
      if (c.x + c.img.width < -8) c.x = W + Math.random() * 40
    }
    if (cover) {
      const { cloud } = cover
      if (cover.phase === 'in') {
        cloud.y += Math.sign(MOON_Y - Math.round(cloud.img.height / 2) - cloud.y)
        const dx = moonX - Math.round(cloud.img.width / 2) - cloud.x
        cloud.x += Math.sign(dx) * Math.min(Math.abs(dx), 40 * dt)
        if (Math.abs(dx) < 1) cover.phase = 'hold'
      } else {
        cover.timer -= dt
        if (cover.timer <= 0) cover = null
      }
    }
    for (const m of meteors) m.life += dt
    meteors = meteors.filter((m) => m.life < 1)
    if (ambient && Math.random() < dt / 9) launchMeteor()
  }

  // offY：鏡頭往上搖時，星空跟著往下移一點；par：滑鼠視差（-1～1）
  function draw(ctx: Ctx, offY = 0, par = 0) {
    const o = (f: number) => Math.round(par * f)
    ctx.drawImage(grad.img, 0, 0)
    for (const s of stars) {
      const level = s.twinkle ? Math.max(0, Math.min(3, Math.round(1.5 + Math.sin(t * s.speed + s.phase) * 1.6))) : s.level
      const color = STAR_LEVELS[level] as string
      const sx = s.x + o(0.5)
      const sy = s.y + offY
      dot(ctx, sx, sy, 1, 1, color)
      if (s.big && level >= 2) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) dot(ctx, sx + dx, sy + dy, 1, 1, color, 0.5)
      }
    }
    for (const m of meteors) {
      const hx = Math.round(m.x - m.life * 90)
      const hy = Math.round(m.y + m.life * 45) + offY
      const fade = m.life < 0.8 ? 1 : (1 - m.life) * 5
      for (let k = 0; k < 7; k += 1) dot(ctx, hx + k * 2, hy - k, 2, 1, k === 0 ? '#ffffff' : '#cfd6ff', fade * (1 - k / 7))
    }
    const mc = Math.floor(moon.img.width / 2)
    ctx.drawImage(moon.img, moonX - mc + o(1), MOON_Y - mc + offY)
    ctx.globalAlpha = 0.92
    for (const c of clouds) ctx.drawImage(c.img, Math.round(c.x) + o(1.5), c.y + offY)
    ctx.globalAlpha = 1
  }

  return { build, step, draw, launchMeteor, coverMoon }
}
