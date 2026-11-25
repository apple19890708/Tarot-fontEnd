// 占卜頁把流程的狀態放在這裡，App 層常駐的像素世界（PixelWorld）讀它來做反應（計畫書 2.7.5）。
// 只有占卜頁（塔羅首頁、雷諾曼，v27）會寫，用下面的 useSceneSync；離開時要重設，免得別頁的背景還停在「抽牌中」的暗窗。
import { onBeforeUnmount, watchEffect, type Ref } from 'vue'
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

// 占卜頁的背景（v27：塔羅首頁與雷諾曼共用，2026-11-25 使用者要求「雷諾曼的占卜背景要跟塔羅占卜一樣」）：
// 夜晚的像素城市、不壓暗。兩個路由的 meta 都展開這一份，不各寫一次
export const DIVINATION_SCENE = { scene: 'city', sceneDim: 0 } as const

// 占卜頁把目前的步驟與抽到的牌交給像素世界（步驟 2 窗戶變暗、每抽一張劃一顆流星、逆位雲遮月）；離開頁面就重設
export function useSceneSync(step: Readonly<Ref<1 | 2 | 3>>, drawn: Readonly<Ref<('upright' | 'reversed')[]>>) {
  watchEffect(() => {
    sceneBus.step = step.value
    sceneBus.drawn = drawn.value
  })
  onBeforeUnmount(resetSceneBus)
}
