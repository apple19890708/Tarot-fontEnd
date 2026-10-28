<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { currentUser, isAdmin, isLoggedIn, logout } from './lib/auth'
import { healthLabel, refreshHealth } from './lib/health'

const router = useRouter()
const route = useRoute()

onMounted(refreshHealth)

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
  return route.name === name ? 'font-medium text-amber-200' : 'text-stone-200/80 hover:text-amber-200'
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
	<div class="grid min-h-screen grid-rows-[auto_1fr] bg-neutral-900 text-stone-100">
		<header class="relative border-b border-white/6 bg-black/10">
			<div class="mx-auto flex min-w-0 items-center justify-between gap-4 px-5 py-3">
				<div class="min-w-0 leading-tight">
					<p class="text-[10px] uppercase tracking-[0.3em] text-amber-100/70">Tarot Divination Studio</p>
					<p class="text-sm font-semibold text-stone-50 sm:text-base">塔羅占卜</p>
					<p class="truncate text-[10px] text-stone-300/75 sm:text-xs">{{ healthLabel }}</p>
				</div>

				<!-- 手機放不下一整列連結，改成漢堡；三條線在打開時轉成叉 -->
				<button
					type="button"
					class="-mr-2 shrink-0 cursor-pointer rounded-xl border border-white/10 p-2 text-stone-200 transition hover:bg-white/10 sm:hidden"
					:aria-expanded="menuOpen"
					aria-controls="main-nav"
					aria-label="選單"
					@click="menuOpen = !menuOpen"
				>
					<span class="relative block h-5 w-5" aria-hidden="true">
						<!-- 上下兩條往中間併攏後轉成叉，中間那條淡出 -->
						<span
							class="absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out motion-reduce:transition-none"
							:class="menuOpen ? 'top-[9px] rotate-45' : 'top-[4px]'"
						/>
						<span
							class="absolute left-0 top-[9px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 ease-out motion-reduce:transition-none"
							:class="menuOpen ? 'opacity-0' : 'opacity-100'"
						/>
						<span
							class="absolute left-0 h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out motion-reduce:transition-none"
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
						class="absolute inset-x-0 top-full z-30 flex max-h-80 flex-col items-stretch gap-2 overflow-hidden border-b border-white/10 bg-neutral-900 px-5 py-4 shadow-lg shadow-black/40 sm:static sm:z-auto sm:max-h-none sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1 sm:overflow-visible sm:whitespace-nowrap sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
					>
						<router-link v-for="r in navRoutes" :key="r.name" :to="r.path" class="text-sm transition" :class="navClass(r.name)">{{ r.label }}</router-link>

						<template v-if="isLoggedIn">
							<span class="text-sm text-stone-300/70">
								{{ currentUser?.displayName }}
								<span v-if="isAdmin" class="ml-1 rounded-full border border-amber-200/30 bg-amber-200/10 px-2 py-0.5 text-xs text-amber-100">admin</span>
							</span>
							<button class="cursor-pointer text-left text-sm text-stone-200/80 hover:text-rose-200 sm:text-center" @click="signOut">登出</button>
						</template>
						<template v-else>
							<router-link to="/login" class="text-sm transition" :class="navClass('login')">登入</router-link>
							<router-link to="/register" class="rounded-xl border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-center text-sm text-amber-100 hover:bg-amber-200/20">註冊</router-link>
						</template>
					</nav>
				</Transition>
			</div>
		</header>

		<main class="mx-auto w-full min-w-0 max-w-7xl p-3 sm:p-5">
			<router-view />
		</main>
	</div>
</template>

<style scoped></style>
