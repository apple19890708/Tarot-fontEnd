// 首頁把占卜流程的狀態放在這裡，App 層常駐的像素世界（PixelWorld）讀它來做反應（計畫書 2.7.5）。
// 只有首頁會寫；離開首頁時要重設，免得別頁的背景還停在「抽牌中」的暗窗。
import { reactive } from 'vue'

export const sceneBus = reactive({
  step: 1 as 1 | 2 | 3,
  // 已抽到的牌的正逆位，依抽的順序；長度變長就代表剛抽了一張
  drawn: [] as ('upright' | 'reversed')[],
  // 反方向：PixelWorld 寫、App 讀。場景過場播放中為 true，App 等它結束才淡入頁面內容
  transitioning: false,
})

export function resetSceneBus() {
  sceneBus.step = 1
  sceneBus.drawn = []
}
