import { onBeforeUnmount, onMounted } from 'vue'

// 彈窗開著時鎖住背後頁面的捲動，關閉（元件卸載）時還原。
// 用計數處理多個彈窗同時開著的情況；補上捲軸寬度的 padding，避免鎖住時版面左右跳動
let locks = 0
let saved: { overflow: string; paddingRight: string } | null = null

function lock() {
  if (locks === 0) {
    const root = document.documentElement
    const scrollbar = window.innerWidth - root.clientWidth
    saved = { overflow: root.style.overflow, paddingRight: document.body.style.paddingRight }
    root.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
  }
  locks += 1
}

function unlock() {
  locks = Math.max(0, locks - 1)
  if (locks === 0 && saved) {
    document.documentElement.style.overflow = saved.overflow
    document.body.style.paddingRight = saved.paddingRight
    saved = null
  }
}

// 在彈窗元件的 setup 裡呼叫：掛載時鎖、卸載時解鎖
export function useScrollLock() {
  onMounted(lock)
  onBeforeUnmount(unlock)
}
