<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { currentUser, isAdmin, isLoggedIn, logout } from './lib/auth'

const router = useRouter()

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
	<div class="min-h-screen bg-neutral-900 text-stone-100">
		<header class="border-b border-white/6 bg-black/10">
			<div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
				<div class="font-semibold">Tarot Studio</div>
				<nav class="flex items-center gap-4">
					<router-link v-for="r in navRoutes" :key="r.name" :to="r.path" class="text-sm text-stone-200/80 hover:text-amber-200">{{ r.label }}</router-link>

					<template v-if="isLoggedIn">
						<span class="text-sm text-stone-300/70">
							{{ currentUser?.displayName }}
							<span v-if="isAdmin" class="ml-1 rounded-full border border-amber-200/30 bg-amber-200/10 px-2 py-0.5 text-xs text-amber-100">admin</span>
						</span>
						<button class="cursor-pointer text-sm text-stone-200/80 hover:text-rose-200" @click="signOut">登出</button>
					</template>
					<template v-else>
						<router-link to="/login" class="text-sm text-stone-200/80 hover:text-amber-200">登入</router-link>
						<router-link to="/register" class="rounded-xl border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-sm text-amber-100 hover:bg-amber-200/20">註冊</router-link>
					</template>
				</nav>
			</div>
		</header>

		<main class="mx-auto max-w-7xl p-5">
			<router-view />
		</main>
	</div>
</template>

<style scoped></style>
