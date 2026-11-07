import { createRouter, createWebHistory } from 'vue-router'

import { canUseStock, isLoggedIn, onSessionExpired, restore, session } from '../lib/auth'

const HomeView = () => import('../pages/HomeView.vue')
const RoutesAdmin = () => import('../pages/RoutesAdmin.vue')
const LoginView = () => import('../pages/LoginView.vue')
const RegisterView = () => import('../pages/RegisterView.vue')
const AdminUsers = () => import('../pages/AdminUsers.vue')
const HistoryView = () => import('../pages/HistoryView.vue')
const MarketTrackView = () => import('../pages/MarketTrackView.vue')
const ForgotPasswordView = () => import('../pages/ForgotPasswordView.vue')
const ResetPasswordView = () => import('../pages/ResetPasswordView.vue')
const PrivacyView = () => import('../pages/PrivacyView.vue')

// meta.auth：要登入；meta.role：要指定角色；meta.guest：已登入就不該再看到（登入／註冊頁）
// meta.wide：資料多的頁面，桌機的內容區放寬到 1600px（一般頁面 1280px）
// meta.hidden：不列在導覽列（重設密碼頁：從信裡的連結進來，已登入的人也要能打開，所以不能用 guest）
// meta.stock：要有金融股市權限（admin 或被開通的會員），例如股市追蹤
// meta.scene：像素世界的場景（city 街景、door 居酒屋門口、interior 店內）；沒寫就是 sky 星夜
// meta.sceneDim：背景壓暗多少（0～1）；沒寫是 0.15（要讀資料的頁面，背景只當畫框）
const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '占卜', scene: 'city', sceneDim: 0 } },
  { path: '/history', name: 'history', component: HistoryView, meta: { auth: true, title: '我的紀錄', scene: 'interior' } },
  { path: '/market', name: 'market', component: MarketTrackView, meta: { auth: true, stock: true, title: '股市追蹤', scene: 'interior', wide: true } },
  { path: '/login', name: 'login', component: LoginView, meta: { guest: true, title: '登入', scene: 'door', sceneDim: 0.1 } },
  { path: '/register', name: 'register', component: RegisterView, meta: { guest: true, title: '註冊', scene: 'door', sceneDim: 0.1 } },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView, meta: { guest: true, title: '忘記密碼', scene: 'door', sceneDim: 0.1 } },
  { path: '/privacy', name: 'privacy', component: PrivacyView, meta: { hidden: true, title: '隱私權政策', scene: 'interior' } },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordView, meta: { hidden: true, title: '設定新密碼', scene: 'door', sceneDim: 0.1 } },
  { path: '/routes', name: 'routes-admin', component: RoutesAdmin, meta: { role: 'admin', title: '路由管理' } },
  { path: '/admin/users', name: 'admin-users', component: AdminUsers, meta: { role: 'admin', title: '會員' } },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(async (to) => {
  // 重新整理後要先用 token 換回身分，否則已登入的 admin 會被守衛誤判成未登入
  if (!session.ready) {
    await restore()
  }

  const requiresAuth = Boolean(to.meta.auth || to.meta.role)

  if (requiresAuth && !isLoggedIn.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 權限不夠就回首頁，不是導去登入頁——他已經登入了，問題是角色不對
  if (to.meta.role && session.user?.role !== to.meta.role) {
    return { path: '/' }
  }

  // 股市追蹤這類金融股市功能：沒被開通就回首頁（真正的放行在後端）
  if (to.meta.stock && !canUseStock.value) {
    return { path: '/' }
  }

  if (to.meta.guest && isLoggedIn.value) {
    return { path: '/' }
  }

  return true
})

// 守衛只在換頁時檢查。已經停在要登入的頁面上時 token 過期（任何請求收到 401），
// 登入狀態會被清掉卻不會換頁，畫面就停在「請先登入」的錯誤上。
// 這時照守衛的規則導去登入頁，登入後由 redirect 帶回原頁。
// 主動登出不在這裡處理：App.vue 的登出會自己回首頁，兩邊都導頁會互搶。
onSessionExpired(() => {
  const current = router.currentRoute.value
  if (current.meta.auth || current.meta.role) {
    void router.replace({ path: '/login', query: { redirect: current.fullPath } })
  }
})

export default router
