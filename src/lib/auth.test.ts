import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// restore 只在 401 時登出（2026-11-26 前端優化 1）：網路錯誤保留 token、背景再試
class UnauthorizedError extends Error {}
const fetchMe = vi.fn()
vi.mock('./api', () => ({
  UnauthorizedError,
  fetchMe: () => fetchMe(),
  changePasswordRequest: vi.fn(),
  deleteAccountRequest: vi.fn(),
  googleLoginRequest: vi.fn(),
  loginRequest: vi.fn(),
  logoutAllRequest: vi.fn(),
  registerRequest: vi.fn(),
}))
vi.mock('./confirm', () => ({ confirmDialog: vi.fn() }))
vi.mock('./resultSnapshot', () => ({ clearResultSnapshot: vi.fn() }))

// node 沒有 localStorage：token 用一個變數代替
let token = ''
vi.mock('./session', async (importOriginal) => {
  const original = await importOriginal<typeof import('./session')>()
  return {
    ...original,
    getToken: () => token,
    clearToken: () => {
      token = ''
    },
    clearSession: () => {
      token = ''
      original.session.user = null
    },
  }
})

const { restore, session, RESTORE_RETRY_DELAYS } = await import('./auth')

const USER = { id: 'u1', email: 'a@b.c', displayName: 'A', role: 'member' as const }

beforeEach(() => {
  vi.useFakeTimers()
  fetchMe.mockReset()
  session.user = null
  session.ready = false
  token = 'tok'
})
afterEach(() => vi.useRealTimers())

describe('restore', () => {
  it('換回使用者成功：設好登入狀態', async () => {
    fetchMe.mockResolvedValueOnce({ user: USER })
    await restore()
    expect(session.user).toEqual(USER)
    expect(session.ready).toBe(true)
    expect(token).toBe('tok')
  })

  it('401（token 過期）：清掉 token、當成登出，不再重試', async () => {
    fetchMe.mockRejectedValueOnce(new UnauthorizedError('請先登入。'))
    await restore()
    expect(session.user).toBeNull()
    expect(token).toBe('')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMe).toHaveBeenCalledTimes(1)
  })

  it('網路錯誤：保留 token、畫面先出來，背景再試，成功就換回使用者', async () => {
    fetchMe.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ user: USER })
    await restore()
    expect(session.ready).toBe(true)
    expect(session.user).toBeNull()
    expect(token).toBe('tok')
    await vi.advanceTimersByTimeAsync(RESTORE_RETRY_DELAYS[0]!)
    expect(fetchMe).toHaveBeenCalledTimes(2)
    expect(session.user).toEqual(USER)
  })

  it('一直連不上：照間隔試完就停，token 還在', async () => {
    fetchMe.mockRejectedValue(new TypeError('Failed to fetch'))
    await restore()
    await vi.advanceTimersByTimeAsync(RESTORE_RETRY_DELAYS.reduce((sum, ms) => sum + ms, 0) + 60_000)
    expect(fetchMe).toHaveBeenCalledTimes(1 + RESTORE_RETRY_DELAYS.length)
    expect(token).toBe('tok')
  })
})
