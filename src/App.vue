<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const routes = computed(() => router.getRoutes().filter((r) => r.name))
</script>

<template>
	<div class="min-h-screen bg-neutral-900 text-stone-100">
		<header class="border-b border-white/6 bg-black/10">
			<div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
				<div class="font-semibold">Tarot Studio</div>
				<nav class="flex items-center gap-4">
					<router-link v-for="r in routes" :key="r.name" :to="r.path" class="text-sm text-stone-200/80 hover:text-amber-200">{{ r.name }}</router-link>
				</nav>
			</div>
		</header>

		<main class="mx-auto max-w-7xl p-5">
			<router-view />
		</main>
	</div>
</template>

<style scoped></style>

