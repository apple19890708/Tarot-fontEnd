<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { currentUser, isAdmin, isLoggedIn, logout } from './lib/auth'
import { healthLabel, refreshHealth } from './lib/health'

const router = useRouter()
const route = useRoute()

onMounted(refreshHealth)

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
		<header class="border-b border-white/6 bg-black/10">
			<div class="mx-auto flex flex-wrap items-center justify-between gap-4 px-5 py-3">
				<div class="leading-tight">
					<p class="text-[10px] uppercase tracking-[0.3em] text-amber-100/70">Tarot Divination Studio</p>
					<p class="text-base font-semibold text-stone-50">塔羅占卜</p>
					<p class="text-xs text-stone-300/75">{{ healthLabel }}</p>
				</div>
				<nav class="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap sm:gap-x-4">
					<router-link v-for="r in navRoutes" :key="r.name" :to="r.path" class="text-sm transition" :class="navClass(r.name)">{{ r.label }}</router-link>

					<template v-if="isLoggedIn">
						<span class="text-sm text-stone-300/70">
							{{ currentUser?.displayName }}
							<span v-if="isAdmin" class="ml-1 rounded-full border border-amber-200/30 bg-amber-200/10 px-2 py-0.5 text-xs text-amber-100">admin</span>
						</span>
						<button class="cursor-pointer text-sm text-stone-200/80 hover:text-rose-200" @click="signOut">登出</button>
					</template>
					<template v-else>
						<router-link to="/login" class="text-sm transition" :class="navClass('login')">登入</router-link>
						<router-link to="/register" class="rounded-xl border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-sm text-amber-100 hover:bg-amber-200/20">註冊</router-link>
					</template>
				</nav>
			</div>
		</header>

		<main class="mx-auto w-full max-w-7xl p-5">
			<router-view />
		</main>
	</div>
</template>

<style scoped></style>
