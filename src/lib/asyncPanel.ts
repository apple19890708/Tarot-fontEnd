// 需要時才載入的大元件（2026-11-26 前端優化 3、7）：股市圖表、股市追蹤的分頁、日記編輯器。
// 載入中顯示骨架。SkeletonBlock 本身沒有高度（尺寸由使用端的 class 決定），
// 直接當 loadingComponent 會是 0 高、看不到；這裡給一個預設大小，網路慢時看得出正在載入
import { defineAsyncComponent, defineComponent, h, type AsyncComponentLoader, type Component } from 'vue'

import SkeletonBlock from '../components/SkeletonBlock.vue'

export function asyncPanel<T extends Component>(loader: AsyncComponentLoader<T>, skeletonClass = 'h-64 w-full') {
  return defineAsyncComponent<T>({
    loader,
    loadingComponent: defineComponent(() => () => h(SkeletonBlock, { class: skeletonClass })),
  })
}
