// 後端狀態（資料庫連線、牌數）。顯示在每一頁的 top bar，所以放在共用模組，不綁在占卜頁。
import { computed, ref } from 'vue'

import { fetchHealth } from './api'
import type { HealthResponse } from '../types'

const health = ref<HealthResponse | null>(null)
const healthError = ref(false)

export const healthLabel = computed(() => {
  if (healthError.value) {
    return '無法連線到後端'
  }
  if (!health.value) {
    return '正在檢查後端狀態'
  }
  return health.value.database.ready
    ? `MongoDB 已連線，已載入 ${health.value.database.cardCount} 張牌`
    : 'MongoDB 尚未連線，請先完成 seed'
})

// 同時被叫多次時只認最後一次的回應
let requestId = 0

export async function refreshHealth() {
  const current = (requestId += 1)
  try {
    const response = await fetchHealth()
    if (current === requestId) {
      health.value = response
      healthError.value = false
    }
  } catch {
    if (current === requestId) {
      healthError.value = true
    }
  }
}
