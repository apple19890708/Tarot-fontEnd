// 呼叫後端的共用部分：API 網址、Authorization、401 當成登出、一般請求的逾時、AI 的 NDJSON 串流
import type { HealthResponse } from '../../types'
import { getToken, notifyUnauthorized } from '../session'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// 牌卡圖片放在後端的 /cards；正式環境需加上後端網址，開發時走 Vite proxy（base 為空）
export function imageUrl(image?: string) {
  return image ? `${API_BASE_URL}${image}` : ''
}

// 登入後的請求一律帶 Authorization；沒登入就不帶，後端的公開路由照樣能用
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// token 過期或被撤銷時後端回 401：清掉本機狀態，不要停在半登入的畫面
export class UnauthorizedError extends Error {}

// AI 串流（NDJSON）太久沒收到任何資料：連線多半已經斷了（伺服器重啟、Render 重新部署、手機切到背景、網路切換）
export class StreamStalledError extends Error {}

// 新版後端串流途中每 15 秒送一次 {"type":"ping"}：收過 ping 之後 45 秒沒資料就當成斷線。
// 舊版後端沒有心跳，AI 推理時可能一兩分鐘沒有文字，放寬到 150 秒，避免誤判
const STREAM_IDLE_MS = 45_000
const STREAM_IDLE_LEGACY_MS = 150_000

// 逐行讀 NDJSON 事件（不含 ping）；連線結束、太久沒資料都丟錯誤，呼叫端在收到 done 時 return 結束。
// 匯出給單元測試用（api.test.ts）
export async function* ndjsonEvents<T>(body: ReadableStream<Uint8Array>, label: string): AsyncGenerator<T> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawPing = false
  try {
    for (;;) {
      const idleMs = sawPing ? STREAM_IDLE_MS : STREAM_IDLE_LEGACY_MS
      let timer: ReturnType<typeof setTimeout> | undefined
      const stalled = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new StreamStalledError(`${label}的連線中斷了（超過 ${idleMs / 1000} 秒沒有收到資料），請再試一次。`)),
          idleMs,
        )
      })
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await Promise.race([reader.read(), stalled])
      } finally {
        clearTimeout(timer)
      }
      const { done, value } = chunk
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as { type: string }
        if (event.type === 'ping') {
          sawPing = true
          continue
        }
        yield event as T
      }
      if (done) throw new Error(`${label}連線意外中斷，請再試一次。`)
    }
  } finally {
    // 正常結束、丟錯誤或呼叫端提早 return 都把連線關掉（卡住時也不會一直佔著）
    reader.cancel().catch(() => {})
  }
}

// AI 串流共用的請求（2026-11-26 前端優化 5，原本 4 支串流函式各寫一份）：
// - 不走 request()（不能有逾時，AI 可能寫好幾分鐘），Authorization 自己帶
// - 開始前的錯誤：401 當成登出；其他（403 沒開通、429 次數用完…）丟出後端的訊息
// - 讀 NDJSON 事件：done 回傳給呼叫端、error 丟出錯誤，其他事件（delta、start、market）交給 onEvent
// - 沒收到 done 就斷線：丟出「{label}連線意外中斷」
export async function postStream<E extends { type: string }>(
  path: string,
  body: unknown,
  options: {
    signal: AbortSignal
    // 錯誤訊息用的名稱，例如「AI 解讀」
    label: string
    unauthorizedMessage: string
    onEvent: (event: Exclude<E, { type: 'done' } | { type: 'error' }>) => void
  },
): Promise<Extract<E, { type: 'done' }>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options.signal,
  })

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      notifyUnauthorized()
      throw new UnauthorizedError(payload?.message || options.unauthorizedMessage)
    }
    throw new Error(payload?.message || `${options.label}暫時無法使用`)
  }

  for await (const event of ndjsonEvents<E>(response.body, options.label)) {
    if (event.type === 'done') return event as Extract<E, { type: 'done' }>
    if (event.type === 'error') throw new Error((event as unknown as { message: string }).message)
    options.onEvent(event as Exclude<E, { type: 'done' } | { type: 'error' }>)
  }
  throw new Error(`${options.label}連線意外中斷，請再試一次。`)
}

// 一般請求的逾時（2026-11-26 前端優化 1）：後端卡住時不要讓頁面一直停在載入中。
// 串流（AI 解讀）不走 request()，不受這個限制；呼叫端自己給 signal 時以呼叫端的為準
export const REQUEST_TIMEOUT_MS = 20_000

export class RequestTimeoutError extends Error {}

function timeoutSignal(ms: number) {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), ms)
  return controller.signal
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options?.headers || {}),
      },
      signal: options?.signal ?? timeoutSignal(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new RequestTimeoutError('連線逾時，伺服器暫時沒有回應，請稍後再試。')
    }
    throw error
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    if (response.status === 401) {
      notifyUnauthorized()
      throw new UnauthorizedError(payload?.message || '請先登入。')
    }
    throw new Error(payload?.message || 'API request failed')
  }

  return (await response.json()) as T
}

export function fetchHealth() {
  return request<HealthResponse>('/api/health')
}
