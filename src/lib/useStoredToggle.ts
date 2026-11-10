import { ref, watch } from 'vue'

// 可以收合的區塊記住開或關（每個區塊一個 key，存在 localStorage；讀寫失敗就用預設值）
const STORE_PREFIX = 'toggle:'

export function useStoredToggle(key: string, defaultOpen = true) {
  let initial = defaultOpen
  try {
    const saved = localStorage.getItem(STORE_PREFIX + key)
    if (saved === '1' || saved === '0') initial = saved === '1'
  } catch {
    // 私密瀏覽或被封鎖：用預設值
  }
  const open = ref(initial)
  watch(open, (value) => {
    try {
      localStorage.setItem(STORE_PREFIX + key, value ? '1' : '0')
    } catch {
      // 存不了就只在這次有效
    }
  })
  return open
}
