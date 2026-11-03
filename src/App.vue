<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import PixelWorld from './components/PixelWorld.vue'
import { currentUser, isAdmin, isLoggedIn, logout } from './lib/auth'
import { cardStyle, setCardStyle } from './lib/cardStyle'
import { healthLabel, refreshHealth } from './lib/health'
import { prefersReducedMotion } from './lib/motion'
import type { SceneKey } from './lib/pixel/core'
import { sceneBus } from './lib/sceneBus'

const router = useRouter()
const route = useRoute()

onMounted(refreshHealth)

// 像素世界的場景由路由的 meta.scene 決定，沒寫的頁面（含管理者自訂的路由）是最安靜的星夜。
// 路由準備好之前先不畫，免得第一次載入時把「起始空路由」當成星夜、播一段多餘的過場
const routerReady = ref(false)
router.isReady().then(() => (routerReady.value = true))
const scene = computed<SceneKey | null>(() =>
  routerReady.value ? ((route.meta.scene as SceneKey | undefined) ?? 'sky') : null,
)
// 背景壓暗多少：首頁 0（夜景是主角），要讀資料的頁面預設 0.15（0.35 使用者覺得太暗），背景只當畫框
const sceneDim = computed(() => (route.meta.sceneDim as number | undefined) ?? 0.15)

// 換頁時場景不同，就等背景過場播完再淡入頁面內容，不要一進來就蓋在過場上。
// 在場景改變當下（App 自己的 pre watcher，比畫面更新早）先藏起來，PixelWorld 回報過場結束再顯示；
// 分頁在背景時動畫迴圈會暫停、過場不會結束，所以最多等 1.5 秒就照樣顯示。減少動態時沒有過場，不藏
const contentHidden = ref(false)
let revealFallback: ReturnType<typeof setTimeout> | undefined
function reveal() {
  contentHidden.value = false
  clearTimeout(revealFallback)
}
watch(scene, (next, prev) => {
  if (!prev || !next || next === prev || prefersReducedMotion()) return
  contentHidden.value = true
  clearTimeout(revealFallback)
  revealFallback = setTimeout(reveal, 1500)
})
watch(
  () => sceneBus.transitioning,
  (moving) => {
    if (!moving) reveal()
  },
)
onBeforeUnmount(() => clearTimeout(revealFallback))

// sm 斷點（640px）。手機把選單收進漢堡，桌機一律攤開；
// 初值直接讀 matchMedia，桌機才不會先閃一下收合的樣子
const DESKTOP_QUERY = '(min-width: 640px)'
const isDesktop = ref(typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches)
let mediaQuery: MediaQueryList | null = null

function onBreakpointChange(event: MediaQueryListEvent) {
  isDesktop.value = event.matches
}

onMounted(() => {
  mediaQuery = window.matchMedia(DESKTOP_QUERY)
  isDesktop.value = mediaQuery.matches
  mediaQuery.addEventListener('change', onBreakpointChange)
})

onBeforeUnmount(() => mediaQuery?.removeEventListener('change', onBreakpointChange))

// 手機的漢堡選單；換頁後自動收起來
const menuOpen = ref(false)
watch(() => route.fullPath, () => (menuOpen.value = false))

// 桌機永遠顯示，手機只有打開時顯示（這時 Transition 才會跑收合動畫）
const navVisible = computed(() => isDesktop.value || menuOpen.value)

// 目前所在的頁面亮起；用路由名稱比對，網址帶 query（例如紀錄頁的 ?id=）也算同一頁
function navClass(name: string) {
  return route.name === name ? 'text-amber-200' : 'text-stone-200/80 hover:text-amber-200'
}

// 導覽列只顯示目前角色進得去的頁面
const navRoutes = computed(() =>
  router
    .getRoutes()
    .filter((route) => route.name && !route.meta?.guest)
    // 要登入才進得去的頁面（例如我的紀錄），沒登入就不列出來
    .filter((route) => !route.meta?.auth || isLoggedIn.value)
    .filter((route) => !route.meta?.role || route.meta.role === currentUser.value?.role)
    .map((route) => ({
      name: String(route.name),
      path: route.path,
      label: String(route.meta?.title || route.name),
    })),
)

function signOut() {
  logout()
  router.push('/')
}
</script>

<template>
	<!-- 兩列格線：top bar 依內容高度，主內容撐滿剩下的畫面，頁面可以用 min-h-full 做滿版 -->
	<!-- 全站都有像素世界（PixelWorld）墊在後面，外層不上底色才看得到 -->
	<div class="grid min-h-screen grid-rows-[auto_1fr] text-stone-100">
		<PixelWorld :scene="scene" :dim="sceneDim" />
		<header class="relative border-b-2 border-[#3b2618] bg-[#0f1526]/85">
			<div class="mx-auto flex min-w-0 items-center justify-between gap-4 px-5 py-3">
				<div class="min-w-0 leading-tight">
					<p class="text-[10px] uppercase tracking-[0.3em] text-amber-100/70">Tarot Divination Studio</p>
					<p class="font-pixel text-[12px] text-stone-50">塔羅占卜</p>
					<p class="truncate text-[11px] text-stone-300/75 sm:text-xs">{{ healthLabel }}</p>
				</div>

				<!-- 手機放不下一整列連結，改成漢堡；三條線在打開時轉成叉 -->
				<button
					type="button"
					class="-mr-1 shrink-0 cursor-pointer border-2 border-[#f1e7cf]/30 p-1.5 text-stone-200 transition hover:border-amber-200/60 hover:text-amber-200 active:translate-x-[2px] active:translate-y-[2px] sm:hidden"
					:aria-expanded="menuOpen"
					aria-controls="main-nav"
					aria-label="選單"
					@click="menuOpen = !menuOpen"
				>
					<span class="relative block h-5 w-5" aria-hidden="true">
						<!-- 上下兩條往中間併攏後轉成叉，中間那條淡出 -->
						<span
							class="absolute left-0 h-0.5 w-5 bg-current transition-all duration-300 ease-out motion-reduce:transition-none"
							:class="menuOpen ? 'top-[9px] rotate-45' : 'top-[4px]'"
						/>
						<span
							class="absolute left-0 top-[9px] h-0.5 w-5 bg-current transition-opacity duration-200 ease-out motion-reduce:transition-none"
							:class="menuOpen ? 'opacity-0' : 'opacity-100'"
						/>
						<span
							class="absolute left-0 h-0.5 w-5 bg-current transition-all duration-300 ease-out motion-reduce:transition-none"
							:class="menuOpen ? 'top-[9px] -rotate-45' : 'top-[14px]'"
						/>
					</span>
				</button>

				<!-- 同一份選單：手機收在漢堡底下的面板（展開時滑下來），sm 以上回到 header 裡橫排 -->
				<Transition
					enter-active-class="transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none"
					enter-from-class="max-h-0 opacity-0"
					enter-to-class="max-h-80 opacity-100"
					leave-active-class="transition-[max-height,opacity] duration-200 ease-in motion-reduce:transition-none"
					leave-from-class="max-h-80 opacity-100"
					leave-to-class="max-h-0 opacity-0"
				>
					<nav
						v-if="navVisible"
						id="main-nav"
						class="absolute inset-x-0 top-full z-30 flex max-h-80 flex-col items-stretch gap-2.5 overflow-hidden border-b-4 border-[#3b2618] bg-[#0f1526] px-5 py-4 shadow-[0_6px_0_rgba(0,0,0,0.45)] sm:static sm:z-auto sm:max-h-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 sm:overflow-visible sm:whitespace-nowrap sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
					>
						<router-link v-for="r in navRoutes" :key="r.name" :to="r.path" class="font-pixel text-[12px] transition" :class="navClass(r.name)">{{ r.label }}</router-link>

						<template v-if="isLoggedIn">
							<span class="font-pixel text-[12px] text-stone-300/70">
								{{ currentUser?.displayName }}
								<span v-if="isAdmin" class="ml-1 border-2 border-amber-200/40 bg-amber-200/10 px-1.5 py-0.5 font-pixel text-[12px] text-amber-100">admin</span>
							</span>
							<button class="cursor-pointer text-left font-pixel text-[12px] text-stone-200/80 transition hover:text-rose-200 sm:text-center" @click="signOut">登出</button>
						</template>
						<template v-else>
							<router-link to="/login" class="font-pixel text-[12px] transition" :class="navClass('login')">登入</router-link>
							<router-link to="/register" class="border-2 border-amber-200/40 bg-amber-200/10 px-3 py-1 text-center font-pixel text-[12px] text-amber-100 transition hover:bg-amber-200/20 active:translate-x-[2px] active:translate-y-[2px]">註冊</router-link>
						</template>
					</nav>
				</Transition>
			</div>
		</header>

		<!--
			牌面風格的 icon 開關，浮在畫面右上（頂部導覽列下方），捲動時也一直在：一張牌裡排著像素方塊。
			開著是像素牌面（琥珀色），關著是原版圖；所有畫面的牌面一起換。
			z-20 低於手機選單（z-30），選單展開時會蓋過它
		-->
		<button
			type="button"
			class="fixed right-4 top-20 z-20 flex h-11 w-11 cursor-pointer items-center justify-center border-2 border-[#3b2618] bg-[#0f1526] shadow-[3px_3px_0_rgba(0,0,0,0.5)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none md:right-8"
			:class="cardStyle === 'pixel' ? 'text-amber-200' : 'text-stone-200/60 hover:text-amber-200'"
			:aria-pressed="cardStyle === 'pixel'"
			aria-label="像素牌面"
			:title="cardStyle === 'pixel' ? '像素牌面：開' : '像素牌面：關'"
			@click="setCardStyle(cardStyle === 'pixel' ? 'original' : 'pixel')"
		>
			<svg viewBox="0 0 12 16" class="h-6 w-[18px]" shape-rendering="crispEdges" aria-hidden="true">
				<rect x="0.5" y="0.5" width="11" height="15" fill="none" stroke="currentColor" />
				<rect x="3" y="3" width="2" height="2" fill="currentColor" />
				<rect x="7" y="3" width="2" height="2" fill="currentColor" />
				<rect x="5" y="7" width="2" height="2" fill="currentColor" />
				<rect x="3" y="11" width="2" height="2" fill="currentColor" />
				<rect x="7" y="11" width="2" height="2" fill="currentColor" />
			</svg>
		</button>

		<!-- 過場中先隱形（版面照占位，淡入時不會跳動），播完再用 0.3 秒淡入 -->
		<main
			class="mx-auto w-full min-w-0 max-w-7xl px-4 py-3 transition-opacity duration-300 ease-out motion-reduce:transition-none sm:p-5"
			:class="contentHidden ? 'invisible opacity-0' : 'opacity-100'"
		>
			<router-view />
		</main>
	</div>
</template>

<style scoped></style>
