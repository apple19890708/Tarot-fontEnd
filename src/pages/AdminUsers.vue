<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { fetchAdminUsers, setUserAiAccess } from '../lib/api'
import type { AuthUser } from '../types'

const users = ref<AuthUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const error = ref('')

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

// 翻頁可能被連點，舊的回應要丟掉（同 loadNarration 的 request id 作法）
let requestId = 0

async function load(target = page.value) {
  const current = ++requestId
  loading.value = true
  error.value = ''

  try {
    const result = await fetchAdminUsers({ page: target, pageSize: pageSize.value })
    if (current !== requestId) {
      return
    }
    users.value = result.users
    total.value = result.total
    page.value = result.page
  } catch (requestError) {
    if (current !== requestId) {
      return
    }
    error.value = requestError instanceof Error ? requestError.message : '會員列表載入失敗。'
  } finally {
    if (current === requestId) {
      loading.value = false
    }
  }
}

// 正在送出的那一列，避免連點
const updatingId = ref('')

async function toggleAiAccess(user: AuthUser) {
  if (updatingId.value || user.role === 'admin') {
    return
  }

  updatingId.value = user.id
  error.value = ''

  try {
    const result = await setUserAiAccess(user.id, !user.aiAccess)
    // 只換這一列，不重抓整頁，避免排序或分頁跳動
    const index = users.value.findIndex((item) => item.id === user.id)
    if (index >= 0) {
      users.value[index] = result.user
    }
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : '權限更新失敗。'
  } finally {
    updatingId.value = ''
  }
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—'
}

onMounted(() => load(1))
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold">會員列表</h1>
      <p class="text-sm text-stone-300/80">
        共 {{ total }} 位會員。AI 解析預設關閉，要逐一開通；管理者一律可用。
        要把某個帳號升為管理者，在後端執行
        <code class="rounded bg-black/30 px-1.5 py-0.5 text-xs">npm run user:promote -- &lt;email&gt;</code>。
      </p>
    </div>

    <p v-if="error" class="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
      {{ error }}
    </p>

    <div class="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5">
      <table class="w-full text-left text-sm">
        <thead class="border-b border-white/10 text-xs uppercase text-stone-300/60">
          <tr>
            <th class="px-5 py-3 font-medium">Email</th>
            <th class="px-5 py-3 font-medium">顯示名稱</th>
            <th class="px-5 py-3 font-medium">角色</th>
            <th class="px-5 py-3 font-medium">AI 解析</th>
            <th class="px-5 py-3 font-medium">註冊時間</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="px-5 py-6 text-center text-stone-300/70">載入中…</td>
          </tr>
          <tr v-else-if="!users.length">
            <td colspan="5" class="px-5 py-6 text-center text-stone-300/70">還沒有任何會員。</td>
          </tr>
          <tr v-for="user in users" v-else :key="user.id" class="border-b border-white/5 last:border-0">
            <td class="px-5 py-3">{{ user.email }}</td>
            <td class="px-5 py-3 text-stone-300/80">{{ user.displayName }}</td>
            <td class="px-5 py-3">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs"
                :class="
                  user.role === 'admin'
                    ? 'border border-amber-200/30 bg-amber-200/10 text-amber-100'
                    : 'border border-white/10 bg-white/5 text-stone-300/80'
                "
              >
                {{ user.role }}
              </span>
            </td>
            <td class="px-5 py-3">
              <span v-if="user.role === 'admin'" class="text-xs text-stone-300/60">管理者一律可用</span>
              <button
                v-else
                type="button"
                :disabled="updatingId === user.id"
                class="cursor-pointer rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  user.aiAccess
                    ? 'border-amber-200/30 bg-amber-200/10 text-amber-100 hover:bg-amber-200/20'
                    : 'border-white/10 bg-white/5 text-stone-300/70 hover:bg-white/10'
                "
                @click="toggleAiAccess(user)"
              >
                {{ updatingId === user.id ? '更新中…' : user.aiAccess ? '已開通．點此收回' : '未開通．點此開通' }}
              </button>
            </td>
            <td class="px-5 py-3 text-stone-300/70">{{ formatDate(user.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="flex items-center justify-center gap-3 text-sm">
      <button
        class="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page <= 1 || loading"
        @click="load(page - 1)"
      >
        上一頁
      </button>
      <span class="text-stone-300/70">{{ page }} / {{ pageCount }}</span>
      <button
        class="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page >= pageCount || loading"
        @click="load(page + 1)"
      >
        下一頁
      </button>
    </div>
  </div>
</template>
