// 浮動選單的「跳到段落」。
// 結果頁（StepResult）掛載時登記一個 provider，卸載時移除；選單打開時才向它要目前的段落清單，
// 所以 AI 解讀後來才出現、或某段因為沒資料而沒顯示，清單都會跟著畫面走。
import { shallowRef } from 'vue'

export type SectionNavItem = {
  label: string
  // 1：結果頁的大段落；2：判斷依據底下的小段落（縮排顯示）
  level: 1 | 2
  go: () => void
}

type Provider = { items: () => SectionNavItem[] }

export const sectionNav = shallowRef<Provider | null>(null)

// 回傳的函式用來取消登記；只取消自己登記的那一個，避免換頁時把新頁面的蓋掉
export function provideSectionNav(provider: Provider) {
  sectionNav.value = provider
  return () => {
    if (sectionNav.value === provider) sectionNav.value = null
  }
}
