// 會員與權限（v12）、信箱驗證、帳號設定、管理者頁
import type { AccountInfo, AdminLogsResponse, AdminUser, AdminUserDetail, AdminUserFilter, AdminUserSort, AdminUsersResponse, AuthResponse, AuthUser } from '../../types'

import { request } from './client'

// ===== 會員與權限（v12）=====

// verificationSent：註冊後有沒有寄出驗證信（v24 3-1，舊版後端沒有）
export function registerRequest(payload: { email: string; password: string; displayName?: string }) {
  return request<AuthResponse & { verificationSent?: boolean }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function loginRequest(payload: { email: string; password: string }) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Google 登入／註冊（v17 規格 I）：credential 是 Google 給的 ID token，後端驗證後回和一般登入一樣的 token＋user。
// passwordCleared：這次綁 Google 時，信箱沒驗證過的舊密碼被停用了（v24 1-1，舊版後端沒有這個欄位）
export function googleLoginRequest(credential: string) {
  return request<AuthResponse & { created?: boolean; passwordCleared?: boolean }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  })
}

// 忘記密碼：信箱沒註冊時後端回 404（訊息直接顯示），有註冊才寄信
export function forgotPasswordRequest(email: string) {
  return request<{ sent: true; email: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

// 重設頁打開時確認連結還能不能用；email 是遮罩過的（a***@gmail.com）
export function checkResetToken(token: string) {
  return request<{ valid: boolean; email?: string }>(`/api/auth/reset-password/${encodeURIComponent(token)}`)
}

export function resetPasswordRequest(token: string, password: string) {
  return request<{ ok: true }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export function fetchMe() {
  return request<{ user: AuthUser }>('/api/auth/me')
}

// 登出所有裝置：後端把帳號的憑證版本號加 1，所有已登入的裝置（含這一台）都要重新登入
export function logoutAllRequest() {
  return request<{ ok: true }>('/api/auth/logout-all', { method: 'POST' })
}

// ---- 信箱驗證（v24 3-1）----
// 點驗證信的連結：不需要登入
export function verifyEmailRequest(token: string) {
  return request<{ ok: true; email: string }>('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

// 重寄驗證信（帳號設定頁）
export function resendVerificationRequest() {
  return request<{ sent: boolean; verified?: boolean; email?: string }>('/api/auth/resend-verification', { method: 'POST' })
}

// ---- 帳號設定頁（v24 階段 2）----
export function fetchAccount() {
  return request<{ account: AccountInfo }>('/api/auth/account')
}

// 改密碼：成功後其他裝置登出，回一個新的 token 給這台繼續用。舊密碼錯回 400（不是 401，不會被當成登出）
export function changePasswordRequest(payload: { currentPassword: string; newPassword: string }) {
  return request<{ token: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// 刪除帳號：有密碼的帳號帶 password；只有 Google 的帳號帶重新登入拿到的 credential
export function deleteAccountRequest(payload: { password?: string; credential?: string }) {
  return request<{ ok: true }>('/api/auth/me', {
    method: 'DELETE',
    body: JSON.stringify(payload),
  })
}

// 開通／收回某個會員的 AI 解析權限（admin 專用）
export function setUserAiAccess(userId: string, allowed: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/ai-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}

// 開通／收回某個會員的金融股市權限（admin 專用）
export function setUserStockAccess(userId: string, allowed: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/stock-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}

// 開通／收回某個會員的雷諾曼權限（admin 專用，v27）
export function setUserLenormandAccess(userId: string, allowed: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/lenormand-access`, {
    method: 'PATCH',
    body: JSON.stringify({ allowed }),
  })
}


export function fetchAdminUsers(
  params: { page?: number; pageSize?: number; q?: string; filter?: AdminUserFilter; sort?: AdminUserSort } = {},
) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.q?.trim()) query.set('q', params.q.trim())
  if (params.filter && params.filter !== 'all') query.set('filter', params.filter)
  if (params.sort && params.sort !== 'created') query.set('sort', params.sort)
  const suffix = query.toString() ? `?${query}` : ''
  return request<AdminUsersResponse>(`/api/admin/users${suffix}`)
}

// 單一會員的詳細：使用量與最近的管理操作（admin 專用）
export function fetchAdminUser(userId: string) {
  return request<AdminUserDetail>(`/api/admin/users/${userId}`)
}

// 停用或恢復帳號；停用時該會員所有裝置立刻登出（admin 專用）
export function setUserDisabled(userId: string, disabled: boolean) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/disabled`, {
    method: 'PATCH',
    body: JSON.stringify({ disabled }),
  })
}

// 強制登出某個會員的所有裝置（admin 專用）
export function forceLogoutUser(userId: string) {
  return request<{ user: AdminUser }>(`/api/admin/users/${userId}/logout-all`, { method: 'POST' })
}

// 管理操作紀錄（全部會員，新到舊）
export function fetchAdminLogs(page = 1) {
  return request<AdminLogsResponse>(`/api/admin/logs?page=${page}`)
}
