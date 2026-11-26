// 會員與權限（v12）、帳號設定、管理者頁

// ===== 會員與權限（v12）=====
// 後端 /api/auth/* 回傳；Render 上的舊版後端沒有這些 API，前端要容忍 404
export type UserRole = 'member' | 'admin'

export interface AuthUser {
  id: string
  email: string
  displayName: string
  role: UserRole
  // AI 解析權限：admin 一律 true，member 要由管理者開通；舊版後端沒有這個欄位
  aiAccess?: boolean
  // 金融股市權限（股市諮詢、股市追蹤）：admin 一律 true，member 要由管理者開通；舊版後端沒有這個欄位
  stockAccess?: boolean
  // 雷諾曼權限（v27 3-1）：admin 一律 true，member 要由管理者開通；和 AI 權限分開，可以只開雷諾曼。舊版後端沒有這個欄位
  lenormandAccess?: boolean
  // 信箱驗證過沒有（v24 3-1）；舊版後端沒有這個欄位
  emailVerified?: boolean
  createdAt?: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

// 帳號設定頁（v24 階段 2）：登入方式決定要顯示「改密碼」還是「用忘記密碼設定一組」，刪帳號要輸入密碼還是重新 Google 登入
export interface AccountInfo extends AuthUser {
  emailVerified: boolean
  loginMethods: { password: boolean; google: boolean }
}

// 管理頁的會員：多了登入、活動、停用狀態與登入方式（舊版後端沒有這些欄位，都設可選）
export interface AdminUser extends AuthUser {
  lastLoginAt?: string | null
  lastLoginMethod?: 'password' | 'google' | 'register' | null
  lastActiveAt?: string | null
  disabled?: boolean
  disabledAt?: string | null
  loginMethods?: { password: boolean; google: boolean }
}

export type AdminUserFilter = 'all' | 'admin' | 'ai' | 'stock' | 'lenormand' | 'inactive' | 'disabled'
export type AdminUserSort = 'created' | 'active' | 'login'

export interface AdminUserStats {
  total: number
  active7d: number
  newThisMonth: number
  aiMembers: number
  stockMembers: number
  // 雷諾曼已開通的會員（v27）；舊版後端沒有
  lenormandMembers?: number
  disabled: number
}

export interface AdminUsersResponse {
  page: number
  pageSize: number
  // 符合目前搜尋、篩選的人數
  total: number
  users: AdminUser[]
  // 頁首統計（不受搜尋、篩選影響）；舊版後端沒有
  stats?: AdminUserStats
}

export interface AdminLogEntry {
  id: string
  action: 'aiAccess' | 'stockAccess' | 'lenormandAccess' | 'disable' | 'enable' | 'logoutAll'
  // 權限類：開通 true、收回 false
  value: boolean | null
  createdAt: string
  // 帳號已刪除時是 null
  admin: { id: string; email: string; displayName: string } | null
  target?: { id: string; email: string; displayName: string } | null
}

export interface AdminUserDetail {
  user: AdminUser
  usage: {
    readings: { total: number | null; last30Days: number | null }
    ai: {
      stockToday: number | null
      newsToday: number | null
      // admin 不限次數時是 null
      stockLimit: number | null
      newsLimit: number | null
      // 塔羅 AI 解讀與追問（v24，舊版後端沒有）
      tarotToday?: number | null
      followUpToday?: number | null
      tarotLimit?: number | null
      followUpLimit?: number | null
      // 雷諾曼 AI 解讀（v27 3-14，每天 30 次、和塔羅分開計；admin 的上限是 null）；舊版後端沒有
      lenormandToday?: number | null
      lenormandLimit?: number | null
      stockAnalyses: number | null
      newsAnalyses: number | null
    }
    market: { watches: number | null; activeAlerts: number | null; pushDevices: number | null }
  }
  logs: AdminLogEntry[]
}

export interface AdminLogsResponse {
  page: number
  pageSize: number
  total: number
  logs: AdminLogEntry[]
}
