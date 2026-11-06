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

export function smoothScrollTo(top: number) {
  if (typeof window === 'undefined') return
  cancelAnimationFrame(scrollFrame)
  stopScrollListeners?.()

  const maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const target = Math.min(Math.max(0, top), maxTop)
  const start = window.scrollY
  const distance = target - start
  if (prefersReducedMotion() || Math.abs(distance) < 2) {
    window.scrollTo(0, target)
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
    window.scrollTo(0, start + distance * ease(progress))
    if (progress < 1) scrollFrame = requestAnimationFrame(step)
    else stopScrollListeners?.()
  }
  scrollFrame = requestAnimationFrame(step)
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
