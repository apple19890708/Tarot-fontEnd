// 按鈕冷卻：按下後 N 秒內不能再按，避免使用者一直按「更新」重複打 API（後端也有快取與次數限制，這裡是第一道防線）。
// 用法：const cooldown = useCooldown(30)；按鈕 :disabled="loading || cooldown.active.value"，
// 文字可以顯示剩餘秒數 cooldown.remaining.value；請求結束後呼叫 cooldown.start()
import { computed, onBeforeUnmount, ref } from 'vue'

export function useCooldown(seconds: number) {
  const remaining = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    remaining.value = 0
  }

  function start() {
    stop()
    remaining.value = seconds
    timer = setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0) stop()
    }, 1000)
  }

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

  onBeforeUnmount(stop)

  return { remaining, active: computed(() => remaining.value > 0), start, run }
}
