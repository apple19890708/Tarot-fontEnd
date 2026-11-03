<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { SCENE_CHAIN, clamp01, dot, lerp, makeLayer, type Ctx, type Layer, type SceneKey } from '../lib/pixel/core'
import { createDoor } from '../lib/pixel/door'
import { createInterior } from '../lib/pixel/interior'
import { createSky } from '../lib/pixel/sky'
import { createStreet } from '../lib/pixel/street'
import { sceneBus } from '../lib/sceneBus'

// 全站的像素世界（計畫書 doc/v01-pixel-night-home-plan.md 2.8）。常駐在 App 層，換頁不會被拆掉，
// 才能用「鏡頭移動」接起兩個場景。場景由路由的 meta.scene 決定，App 傳進來。
//
// 用很小的畫布畫（高約 180 格），再整數倍放大；每秒 12 格。分頁切走就停，
// 開了「減少動態」不播過場、只畫靜態圖。
// dim：背景要壓暗多少（0～1）。要讀資料的頁面壓暗，背景只當畫框；由路由的 meta.sceneDim 決定
const props = defineProps<{ scene: SceneKey | null; dim: number }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

const BASE_H = 180
const FPS = 12
// 一次過場的總長（秒）；跨好幾個場景時平均分給每一段（使用者要 0.8～1 秒）
const TOTAL = 0.9

const sky = createSky()
const street = createStreet()
const door = createDoor()
const interior = createInterior()

let W = 320
let H = BASE_H
let scale = 1
const buffers = {} as Record<SceneKey, Layer>
// 中間最暗、往外漸亮的分段暗區：內容卡片後面更乾淨，兩側的裝飾仍看得到
let spotlight: Layer
let dimNow = 0

// 目前停在哪個場景；過場時是一串相鄰場景之間的「段」
let current: SceneKey | null = null
interface Segment { from: SceneKey; to: SceneKey; dur: number }
let segments: Segment[] = []
let segT = 0

let t = 0
let parallax = 0
let parallaxTarget = 0

function rebuild() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // 整數倍放大才會方正；手機太窄時降到 2 倍，畫面才不會只剩一間居酒屋
  scale = Math.max(2, Math.min(Math.round(vh / BASE_H), Math.floor(vw / 160)))
  W = Math.ceil(vw / scale)
  H = Math.ceil(vh / scale)
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width = W
  canvas.height = H
  canvas.style.width = `${W * scale}px`
  canvas.style.height = `${H * scale}px`

  const size = { W, H, groundY: H - 16 }
  sky.build(size)
  street.build(size, sceneBus.step === 2)
  door.build(size)
  interior.build(size)
  for (const key of SCENE_CHAIN) buffers[key] = makeLayer(W, H)

  spotlight = makeLayer(W, H)
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const d = Math.hypot((x - W / 2) / (W / 2), (y - H * 0.45) / (H * 0.6))
      const level = Math.max(0, Math.min(4, Math.floor((1 - d) * 5)))
      if (level > 0) dot(spotlight.ctx, x, y, 1, 1, '#05060f', level / 4)
    }
  }
}

// 從 from 走到 to 要經過哪幾段（場景排成一條線：星夜 — 街景 — 門口 — 店內）
function plan(from: SceneKey, to: SceneKey): Segment[] {
  const i = SCENE_CHAIN.indexOf(from)
  const j = SCENE_CHAIN.indexOf(to)
  const dir = j > i ? 1 : -1
  const list: Segment[] = []
  for (let k = i; k !== j; k += dir) list.push({ from: SCENE_CHAIN[k] as SceneKey, to: SCENE_CHAIN[k + dir] as SceneKey, dur: 0 })
  for (const s of list) s.dur = TOTAL / list.length
  return list
}

// 把一個場景完整畫進指定的畫布；door 可以帶開門程度；par 是街景的視差（過場對位時要關掉）
function renderScene(key: SceneKey, ctx: Ctx, open = 0, par = parallax) {
  if (key === 'interior') return interior.draw(ctx)
  sky.draw(ctx, 0, key === 'city' ? par : 0)
  if (key === 'city') street.draw(ctx, 0, par)
  else if (key === 'sky') street.draw(ctx, street.skySink(), 0)
  else if (key === 'door') door.draw(ctx, open)
}

// 鏡頭放大：把 src 畫布以 (cx, cy) 為中心放大 z 倍貼到主畫布
function zoomDraw(ctx: Ctx, src: HTMLCanvasElement, z: number, cx: number, cy: number) {
  const sw = W / z
  const sh = H / z
  ctx.drawImage(src, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, W, H)
}

// 相鄰兩個場景之間的過場；q 是 0 時完全是鏈上前面那個，1 時完全是後面那個
function renderPair(ctx: Ctx, low: SceneKey, q: number) {
  if (low === 'sky') {
    // 街景 ↔ 星夜：街景整片往下沉，鏡頭像往上搖；星夜停在底下還露出一排樓頂的位置
    sky.draw(ctx, Math.round((1 - q) * 6), parallax * q)
    street.draw(ctx, Math.round((1 - q) * street.skySink()), parallax * q)
  } else if (low === 'city') {
    // 街景 ↔ 門口：放大街景直到那間居酒屋和門口近景的店面完全重疊，後半段再淡入近景。
    // 門口近景把小圖每一格畫成 k×k，所以終點的放大倍數就是 k，中心點要讓小圖的左上角落在近景店面的左上角
    renderScene('city', buffers.city.ctx, 0, 0)
    const iz = street.izakayaOrigin()
    const pl = door.placement()
    const endX = iz.x + (W / 2 - pl.fx) / pl.k
    const endY = iz.y + pl.top + (H / 2 - pl.fy) / pl.k
    zoomDraw(ctx, buffers.city.img, Math.pow(pl.k, q), lerp(W / 2, endX, q), lerp(H / 2, endY, q))
    const a = clamp01((q - 0.55) / 0.45)
    if (a > 0) {
      renderScene('door', buffers.door.ctx)
      ctx.globalAlpha = a
      ctx.drawImage(buffers.door.img, 0, 0)
      ctx.globalAlpha = 1
    }
  } else {
    // 門口 ↔ 店內：拉門滑開、暖簾掀起，接著鏡頭推進門裡，店內淡入
    const open = clamp01(q / 0.5)
    renderScene('door', buffers.door.ctx, open)
    const zq = clamp01((q - 0.35) / 0.65)
    const c = door.entranceCenter()
    zoomDraw(ctx, buffers.door.img, 1 + zq * 2.5, lerp(W / 2, c.x, zq), lerp(H / 2, c.y, zq))
    const a = clamp01((q - 0.5) / 0.5)
    if (a > 0) {
      renderScene('interior', buffers.interior.ctx)
      ctx.globalAlpha = a
      ctx.drawImage(buffers.interior.img, 0, 0)
      ctx.globalAlpha = 1
    }
  }
}

function draw() {
  const ctx = canvasRef.value?.getContext('2d')
  if (!ctx || !current) return
  ctx.imageSmoothingEnabled = false
  // 每格先塗滿底色：場景哪裡漏畫，也不會殘留上一格的內容（例如走過的客人）
  ctx.fillStyle = '#0a0c22'
  ctx.fillRect(0, 0, W, H)
  const seg = segments[0]
  if (seg) {
    const p = clamp01(segT / seg.dur)
    // 前後慢、中間快，每秒 12 格本身就是逐格
    const eased = p * p * (3 - 2 * p)
    const forward = SCENE_CHAIN.indexOf(seg.to) > SCENE_CHAIN.indexOf(seg.from)
    const low = forward ? seg.from : seg.to
    renderPair(ctx, low, forward ? eased : 1 - eased)
  } else {
    renderScene(current, ctx)
  }
  if (dimNow > 0.01) {
    ctx.globalAlpha = dimNow
    ctx.fillStyle = '#05060f'
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = Math.min(1, dimNow * 0.8)
    ctx.drawImage(spotlight.img, 0, 0)
    ctx.globalAlpha = 1
  }
}

function step(dt: number) {
  t += dt
  parallax += (parallaxTarget - parallax) * 0.15
  // 壓暗程度跟著換頁慢慢變，不要突然跳
  dimNow += (props.dim - dimNow) * 0.2
  if (segments.length) {
    segT += dt
    const seg = segments[0] as Segment
    if (segT >= seg.dur) {
      segments.shift()
      segT = 0
      current = seg.to
      if (!segments.length) sceneBus.transitioning = false
    }
  }
  // 只推進看得到的場景
  const visible = new Set<SceneKey>(current ? [current] : [])
  for (const s of segments.slice(0, 1)) visible.add(s.from), visible.add(s.to)
  if (visible.has('sky') || visible.has('city') || visible.has('door')) sky.step(dt, current === 'sky' && !segments.length)
  // 星夜底下也露著樓頂，樓頂的航警燈要繼續閃
  if (visible.has('city') || visible.has('sky')) street.step(dt)
  if (visible.has('door')) door.step(dt)
  if (visible.has('interior')) interior.step(dt)
}

// ---- 迴圈與生命週期 ----
let raf = 0
let last = 0
let resizeTimer = 0
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const finePointer = window.matchMedia('(pointer: fine)')

function loop(now: number) {
  raf = requestAnimationFrame(loop)
  if (now - last < 1000 / FPS) return
  const dt = Math.min(0.25, (now - last) / 1000)
  last = now
  step(dt)
  draw()
}

function start() {
  if (raf || reduceMotion.matches || document.hidden) return
  last = performance.now()
  raf = requestAnimationFrame(loop)
}

function stop() {
  cancelAnimationFrame(raf)
  raf = 0
}

function onVisibility() {
  if (document.hidden) stop()
  else start()
}

function onResize() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    rebuild()
    draw()
  }, 150)
}

// 滑鼠視差：只在有滑鼠的裝置、且沒開減少動態時才做（只有街景用）
function onPointer(e: PointerEvent) {
  if (!finePointer.matches || reduceMotion.matches) return
  parallaxTarget = (e.clientX / window.innerWidth) * 2 - 1
}

function onMotionChange() {
  if (reduceMotion.matches) {
    stop()
    parallax = parallaxTarget = 0
    if (segments.length) current = (segments[segments.length - 1] as Segment).to
    segments = []
    sceneBus.transitioning = false
    draw()
  } else start()
}

// 換場景：第一次直接到位；過場中又換頁，就先跳到上一個過場的終點再開始新的
watch(
  () => props.scene,
  (next) => {
    if (!next) return
    if (!current || reduceMotion.matches) {
      current = next
      segments = []
      sceneBus.transitioning = false
      draw()
      return
    }
    if (segments.length) current = (segments[segments.length - 1] as Segment).to
    segments = current === next ? [] : plan(current, next)
    segT = 0
    sceneBus.transitioning = segments.length > 0
  },
  { immediate: true },
)

// 減少動態時沒有迴圈，壓暗程度直接到位再重畫
watch(
  () => props.dim,
  (next) => {
    if (!reduceMotion.matches) return
    dimNow = next
    draw()
  },
  { immediate: true },
)

// 占卜流程的反應：抽牌時窗戶陸續暗下、每抽一張劃一顆流星、逆位雲遮月、出結果窗戶亮回且路人停一下
watch(
  () => sceneBus.step,
  (next, prev) => {
    const instant = reduceMotion.matches
    if (next === 2) street.dim(instant)
    else street.restore(instant)
    if (next === 3 && prev !== 3) street.holdWalkers()
    if (instant) draw()
  },
)

watch(
  () => sceneBus.drawn.length,
  (n, o) => {
    if (n <= o || reduceMotion.matches) return
    sky.launchMeteor()
    if (sceneBus.drawn[n - 1] === 'reversed') sky.coverMoon()
  },
)

onMounted(() => {
  rebuild()
  draw()
  start()
  window.addEventListener('resize', onResize)
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  reduceMotion.addEventListener('change', onMotionChange)
})

onBeforeUnmount(() => {
  stop()
  window.clearTimeout(resizeTimer)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('pointermove', onPointer)
  document.removeEventListener('visibilitychange', onVisibility)
  reduceMotion.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <!-- 固定在所有內容後面；App 外層不上底色，這層才看得到 -->
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#0a0c22]" aria-hidden="true">
    <canvas ref="canvasRef" class="block [image-rendering:pixelated]" />
  </div>
</template>
