// 動畫共用設定。使用者開了「減少動態效果」時，動畫一律直接跳到結束狀態。
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 整頁平滑捲動到 top（回到頂端、跳到段落都用這個）。
// 不用瀏覽器原生的 behavior: 'smooth'：它的時間不固定（Chrome 在長頁面幾乎瞬間就到），
// 頁面有大面積像素背景、畫面一重就會跳過中間的幀，看起來像直接跳過去。
// 這裡固定時間（依距離 350～900ms）＋緩入緩出；使用者自己滾輪、觸控、按鍵就停下來讓給使用者；
// 減少動態效果時直接跳到位置
let scrollFrame = 0
let stopScrollListeners: (() => void) | null = null

// container：在某個捲動區裡捲（例如日記頁的左欄）；不給就是整頁
export function smoothScrollTo(top: number, container?: HTMLElement | null) {
  if (typeof window === 'undefined') return
  cancelAnimationFrame(scrollFrame)
  stopScrollListeners?.()

  const viewHeight = container ? container.clientHeight : window.innerHeight
  const fullHeight = container ? container.scrollHeight : document.documentElement.scrollHeight
  const current = () => (container ? container.scrollTop : window.scrollY)
  const jump = (y: number) => (container ? (container.scrollTop = y) : window.scrollTo(0, y))
  const maxTop = Math.max(0, fullHeight - viewHeight)
  const target = Math.min(Math.max(0, top), maxTop)
  const start = current()
  const distance = target - start
  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    jump(target)
    return
  }

  const duration = Math.min(900, 350 + Math.abs(distance) * 0.08)
  const startedAt = performance.now()
  // 緩入緩出（easeInOutCubic）
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

  const cancel = () => {
    cancelAnimationFrame(scrollFrame)
    stopScrollListeners?.()
  }
  const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
  for (const name of events) window.addEventListener(name, cancel, { passive: true, once: true })
  stopScrollListeners = () => {
    for (const name of events) window.removeEventListener(name, cancel)
    stopScrollListeners = null
  }

  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration)
    jump(start + distance * ease(progress))
    if (progress < 1) scrollFrame = requestAnimationFrame(step)
    else stopScrollListeners?.()
  }
  scrollFrame = requestAnimationFrame(step)
}

// 元素所在的捲動區（往上找第一個真的捲得動的）；沒有就是整頁
export function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

// 把元素捲到它所在捲動區的上方（留 offset 的呼吸空間）。
// 跳到段落、捲回 AI 解讀開頭都用這個：結果頁放在日記頁的左欄時，捲的是那一欄而不是整頁（2026-11-20）
export function smoothScrollToElement(el: HTMLElement, offset = 16) {
  const parent = scrollParentOf(el)
  if (!parent) {
    smoothScrollTo(el.getBoundingClientRect().top + window.scrollY - offset)
    return
  }
  smoothScrollTo(el.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop - offset, parent)
}

// 依偏好換算動畫秒數；減少動態效果時回傳 0，GSAP 會直接套用結束狀態
export function motionDuration(seconds: number) {
  return prefersReducedMotion() ? 0 : seconds
}

// 牌在畫面上的姿態：中心點、未旋轉時的尺寸、旋轉角度。飛牌動畫的起點與終點都用這個描述
export interface CardPose {
  cx: number
  cy: number
  width: number
  height: number
  rotation: number
}
