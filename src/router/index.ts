import { createRouter, createWebHistory } from 'vue-router'
import type { RouteLocationNormalized } from 'vue-router'

import { canUseLenormand, canUseStock, isLoggedIn, onSessionExpired, restore, session } from '../lib/auth'
import { applySeo } from '../lib/seo'
import { DIVINATION_SCENE } from '../lib/sceneBus'
import { claimGuestCardIfAny } from '../lib/dailyCard'

const HomeView = () => import('../pages/HomeView.vue')
const RoutesAdmin = () => import('../pages/RoutesAdmin.vue')
const LoginView = () => import('../pages/LoginView.vue')
const RegisterView = () => import('../pages/RegisterView.vue')
const AdminUsers = () => import('../pages/AdminUsers.vue')
const HistoryView = () => import('../pages/HistoryView.vue')
const CalendarView = () => import('../pages/CalendarView.vue')
const JournalView = () => import('../pages/JournalView.vue')
const MarketTrackView = () => import('../pages/MarketTrackView.vue')
const ForgotPasswordView = () => import('../pages/ForgotPasswordView.vue')
const ResetPasswordView = () => import('../pages/ResetPasswordView.vue')
const PrivacyView = () => import('../pages/PrivacyView.vue')
const AccountView = () => import('../pages/AccountView.vue')
const VerifyEmailView = () => import('../pages/VerifyEmailView.vue')
const LenormandView = () => import('../pages/LenormandView.vue')

// meta.auth：要登入；meta.role：要指定角色；meta.guest：已登入就不該再看到（登入／註冊頁）
// meta.wide：資料多的頁面，桌機的內容區放寬到 1600px（一般頁面 1280px）
// meta.hidden：不列在導覽列（重設密碼頁：從信裡的連結進來，已登入的人也要能打開，所以不能用 guest）
// meta.stock：要有金融股市權限（admin 或被開通的會員），例如股市追蹤
// meta.lenormand：要有雷諾曼權限（admin 或被開通的會員，v27）；沒權限的人選單看不到、網址直接打也回首頁
// meta.scene：像素世界的場景（city 街景、door 居酒屋門口、interior 店內）；沒寫就是 sky 星夜
// meta.sceneDim：背景壓暗多少（0～1）；沒寫是 0.15（要讀資料的頁面，背景只當畫框）
// meta.noindex：不給搜尋引擎收錄（v24 4-4）；要登入（auth／role）的頁面一律不收錄，不用另外寫
const routes = [
  // 占卜頁的背景（夜晚的像素城市、不壓暗）和雷諾曼共用同一份設定
  { path: '/', name: 'home', component: HomeView, meta: { title: '占卜', ...DIVINATION_SCENE } },
  // 「我的紀錄」拆成兩頁（2026-11-20 使用者要求）：塔羅紀錄在這裡；股票分析與財經新聞分析搬到股市分析紀錄。
  // 舊網址 /history?tab=stock|news 轉過去，存下來的連結不會壞
  {
    path: '/history',
    name: 'history',
    component: HistoryView,
    meta: { auth: true, title: '塔羅紀錄', scene: 'interior', menuGroup: 'tarot', menuOrder: 1, recordTabs: ['tarot'] },
    beforeEnter: (to: RouteLocationNormalized) => (to.query.tab === 'stock' || to.query.tab === 'news' ? { name: 'market-records', query: to.query } : true),
  },
  // 每日一牌＋月曆（v26 計畫 1）。計畫 3 做好後改從會員選單進入
  { path: '/calendar', name: 'calendar', component: CalendarView, meta: { auth: true, title: '占卜月曆', scene: 'interior', menuGroup: 'tarot', menuOrder: 2 } },
  // 占卜日記（v26 計畫 2）：寫在一筆塔羅紀錄或一天的每日一牌底下；不放在頂欄，從紀錄與月曆進來
  { path: '/journal/:kind/:id', name: 'journal', component: JournalView, meta: { auth: true, hidden: true, title: '日記', scene: 'interior', wide: true } },
  // 股票日記一檔一本（v26 計畫 2-2）：/journal/stock/tw/0050、/journal/stock/us/NVDA。舊的 /journal/stock/<分析 id> 走上面那條，頁面再轉過來
  {
    path: '/journal/stock/:market/:code',
    name: 'stock-journal',
    component: JournalView,
    meta: { auth: true, stock: true, hidden: true, title: '股票日記', scene: 'interior', wide: true },
  },
  { path: '/market', name: 'market', component: MarketTrackView, meta: { auth: true, stock: true, title: '股市追蹤', scene: 'interior', wide: true, menuGroup: 'stock', menuOrder: 1 } },
  // 雷諾曼占卜（v27 3-9）：第二套牌「靜謐花園雷諾曼」。入口在頂欄的「占卜」選單（DivinationMenu，2026-11-25 使用者要求），
  // 不列在會員選單（hidden）；會員選單的「雷諾曼」一組之後只放雷諾曼紀錄（階段 6）。權限照樣由 meta.lenormand 擋。
  // 背景和塔羅首頁一樣（2026-11-25 使用者要求；原本是 interior 酒吧室內）
  { path: '/lenormand', name: 'lenormand', component: LenormandView, meta: { auth: true, lenormand: true, hidden: true, title: '雷諾曼占卜', ...DIVINATION_SCENE } },
  // 雷諾曼紀錄（v27 階段 6）：和塔羅紀錄、股市分析紀錄同一頁（HistoryView），分頁由 recordTabs 決定。
  // 放在會員選單的「雷諾曼」一組（D8：這一組只放紀錄），沒權限的人看不到
  { path: '/lenormand/records', name: 'lenormand-records', component: HistoryView, meta: { auth: true, lenormand: true, title: '雷諾曼紀錄', scene: 'interior', menuGroup: 'lenormand', menuOrder: 1, recordTabs: ['lenormand'] } },
  // 股市分析紀錄：原本「我的紀錄」的股票分析與財經新聞分析（2026-11-20 拆出來），排在股市追蹤後面
  { path: '/market/records', name: 'market-records', component: HistoryView, meta: { auth: true, stock: true, title: '股市分析紀錄', scene: 'interior', menuGroup: 'stock', menuOrder: 2, recordTabs: ['stock', 'news'] } },
  { path: '/login', name: 'login', component: LoginView, meta: { guest: true, title: '登入', scene: 'door', sceneDim: 0.1 } },
  { path: '/register', name: 'register', component: RegisterView, meta: { guest: true, title: '註冊', scene: 'door', sceneDim: 0.1 } },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordView, meta: { guest: true, noindex: true, title: '忘記密碼', scene: 'door', sceneDim: 0.1 } },
  // 帳號設定（v24）：從導覽列點自己的名字進來，不另外列在導覽列
  { path: '/account', name: 'account', component: AccountView, meta: { auth: true, hidden: true, title: '帳號設定', scene: 'interior' } },
  // 驗證信箱（v24 3-1）：從驗證信的連結進來，登不登入都能打開，所以不能用 guest
  { path: '/verify-email', name: 'verify-email', component: VerifyEmailView, meta: { hidden: true, noindex: true, title: '驗證信箱', scene: 'door', sceneDim: 0.1 } },
  { path: '/privacy', name: 'privacy', component: PrivacyView, meta: { hidden: true, title: '隱私權政策', scene: 'interior' } },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordView, meta: { hidden: true, noindex: true, title: '設定新密碼', scene: 'door', sceneDim: 0.1 } },
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
  // 訪客抽的每日一牌：登入或註冊後第一次換頁時就送出領取（不等），頁面掛載前就開始，
  // 月曆頁讀資料前會等它做完（waitForGuestClaim），才不會先顯示「還沒抽」
  if (isLoggedIn.value) void claimGuestCardIfAny()

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

  // 雷諾曼：同上，沒被開通就回首頁（真正的放行在後端）
  if (to.meta.lenormand && !canUseLenormand.value) {
    return { path: '/' }
  }

  if (to.meta.guest && isLoggedIn.value) {
    return { path: '/' }
  }

  return true
})

// 換頁後更新標題、描述、canonical、noindex（v24 第六節）
router.afterEach((to) => applySeo(to))

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
