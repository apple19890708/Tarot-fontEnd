// 動畫共用設定。使用者開了「減少動態效果」時，動畫一律直接跳到結束狀態。
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
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
