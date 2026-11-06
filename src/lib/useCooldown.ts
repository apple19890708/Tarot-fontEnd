// 按鈕冷卻：按下後 N 秒內不能再按，避免使用者一直按「更新」重複打 API（後端也有快取與次數限制，這裡是第一道防線）。
// 用法：const cooldown = useCooldown(30, 'market-overview')；按鈕 :disabled="loading || cooldown.active.value"，
// 文字可以顯示剩餘秒數 cooldown.remaining.value；請求結束後呼叫 cooldown.start()（或用 run() 包起來）
//
// key：冷卻結束時間記在 localStorage，重新整理頁面、開新分頁都會接著倒數（同一個 key 在不同分頁也同步）。
// 不給 key 就只記在記憶體。localStorage 不能用時（無痕、被封鎖）一樣只記在記憶體
import { computed, onBeforeUnmount, ref } from 'vue'

const STORAGE_PREFIX = 'cooldown:'

function readEndsAt(key: string | undefined): number {
  if (!key) return 0
  try {
    const value = Number(localStorage.getItem(STORAGE_PREFIX + key))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function writeEndsAt(key: string | undefined, endsAt: number) {
  if (!key) return
  try {
    if (endsAt > Date.now()) localStorage.setItem(STORAGE_PREFIX + key, String(endsAt))
    else localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // 存不了就只記在記憶體
  }
}

export function useCooldown(seconds: number, key?: string) {
  const remaining = ref(0)
  let endsAt = 0
  let timer: ReturnType<typeof setInterval> | null = null

  function tick() {
    remaining.value = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    if (remaining.value <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // 依 endsAt 開始倒數（用時間戳計算，分頁在背景被節流也不會倒數變慢）
  function follow(next: number) {
    endsAt = next
    if (timer) clearInterval(timer)
    timer = null
    tick()
    if (remaining.value > 0) timer = setInterval(tick, 1000)
  }

  function start() {
    const next = Date.now() + seconds * 1000
    writeEndsAt(key, next)
    follow(next)
  }

  // 其他分頁開始冷卻時，這一頁也跟著
  function onStorage(event: StorageEvent) {
    if (key && event.key === STORAGE_PREFIX + key) follow(readEndsAt(key))
  }
  if (key && typeof window !== 'undefined') window.addEventListener('storage', onStorage)

  // 重新整理前還在冷卻：接著倒數
  follow(readEndsAt(key))

  // 執行 task，結束後（成功或失敗）開始冷卻；冷卻中或還在執行時直接略過
  let running = false
  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (running || remaining.value > 0) return undefined
    running = true
    try {
      return await task()
    } finally {
      running = false
      start()
    }
  }

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    timer = null
    if (key && typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  })

  return { remaining, active: computed(() => remaining.value > 0), start, run }
}
