// 日夜模式（計畫書 doc/v18-day-mode-plan.md）：預設黑夜，不跟系統設定；手動選過就記在這台瀏覽器。
// 實際的顏色是 style.css 的語意色變數，這裡只切換 <html data-theme>。
// index.html 的 <head> 有一段同樣讀 STORAGE_KEY 的小腳本，畫面出來前就套好，避免先閃一下黑夜
import { ref } from 'vue'

export type Theme = 'night' | 'day'

const STORAGE_KEY = 'tarot.theme'

function loadTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'day' ? 'day' : 'night'
  } catch {
    return 'night'
  }
}

function apply(value: Theme) {
  const root = document.documentElement
  if (value === 'day') root.dataset.theme = 'day'
  else delete root.dataset.theme
}

export const theme = ref<Theme>(loadTheme())
apply(theme.value)

export function setTheme(value: Theme) {
  theme.value = value
  apply(value)
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // 私密模式等情況存不了，這次瀏覽仍然有效
  }
}
