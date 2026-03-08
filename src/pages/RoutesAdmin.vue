<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const name = ref('')
const path = ref('')
const permission = ref<'public' | 'private'>('public')

const routes = computed(() =>
  router
    .getRoutes()
    .filter((r) => r.name)
    .map((r) => ({ name: String(r.name), path: r.path, removable: !!r.meta?.custom, permission: r.meta?.permission || 'public' }))
)

function addRoute() {
  if (!name.value || !path.value) return
  const routeName = name.value
  const routePath = path.value.startsWith('/') ? path.value : `/${path.value}`

  // create a simple placeholder component for dynamic routes
  router.addRoute({ name: routeName, path: routePath, component: () => import('./GenericRoute.vue'), meta: { custom: true, permission: permission.value } })
  name.value = ''
  path.value = ''
}

function removeRoute(rname: string) {
  try {
    router.removeRoute(rname)
  } catch (e) {
    // noop
  }
}
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold">路由管理</h1>
    <p class="text-sm text-stone-300">在此你可以新增或移除前端路由（僅限自訂路由）。</p>

    <div class="rounded-lg border bg-white/5 p-4">
      <p class="text-sm">目前路由清單:</p>
      <ul class="mt-2 space-y-2 text-sm">
        <li v-for="r in routes" :key="r.name" class="flex items-center justify-between gap-4">
          <div>
            <span class="font-medium">{{ r.name }}</span>
            <span class="ml-2 text-stone-400">{{ r.path }}</span>
            <span class="ml-3 text-xs text-stone-300/70">{{ r.permission }}</span>
          </div>
          <div>
            <button v-if="r.removable" @click="removeRoute(r.name)" class="rounded px-3 py-1 text-sm bg-rose-400/10">移除</button>
          </div>
        </li>
      </ul>
    </div>

    <div class="rounded-lg border bg-white/5 p-4">
      <p class="text-sm font-medium">新增路由</p>
      <div class="mt-2 flex flex-col gap-2">
        <input v-model="name" placeholder="Route name" class="rounded px-3 py-2 bg-black/10" />
        <input v-model="path" placeholder="/path" class="rounded px-3 py-2 bg-black/10" />
        <select v-model="permission" class="rounded px-3 py-2 bg-black/10">
          <option value="public">public</option>
          <option value="private">private</option>
        </select>
        <div class="pt-2">
          <button @click="addRoute" class="rounded bg-amber-300 px-4 py-2 text-sm">新增</button>
        </div>
      </div>
    </div>

    <router-link to="/" class="text-amber-300">回到首頁</router-link>
  </div>
</template>

<style scoped></style>
