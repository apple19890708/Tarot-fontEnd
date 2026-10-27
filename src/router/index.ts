import { createRouter, createWebHistory } from 'vue-router'

import { isLoggedIn, restore, session } from '../lib/auth'

const HomeView = () => import('../pages/HomeView.vue')
const RoutesAdmin = () => import('../pages/RoutesAdmin.vue')
const LoginView = () => import('../pages/LoginView.vue')
const RegisterView = () => import('../pages/RegisterView.vue')
const AdminUsers = () => import('../pages/AdminUsers.vue')
const HistoryView = () => import('../pages/HistoryView.vue')

// meta.auth：要登入；meta.role：要指定角色；meta.guest：已登入就不該再看到（登入／註冊頁）
const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: '占卜' } },
  { path: '/history', name: 'history', component: HistoryView, meta: { auth: true, title: '我的紀錄' } },
  { path: '/login', name: 'login', component: LoginView, meta: { guest: true, title: '登入' } },
  { path: '/register', name: 'register', component: RegisterView, meta: { guest: true, title: '註冊' } },
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

  if (to.meta.guest && isLoggedIn.value) {
    return { path: '/' }
  }

  return true
})

export default router
