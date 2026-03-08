import { createRouter, createWebHistory } from 'vue-router'

const HomeView = () => import('../pages/HomeView.vue')
const RoutesAdmin = () => import('../pages/RoutesAdmin.vue')

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/routes', name: 'routes-admin', component: RoutesAdmin },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
