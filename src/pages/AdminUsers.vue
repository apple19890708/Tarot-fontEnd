<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import SkeletonBlock from '../components/SkeletonBlock.vue'
import { fetchAdminUsers, setUserAiAccess } from '../lib/api'
import { installWashi } from '../lib/pixelArt'
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
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    return '—'
  }
  // 補零到固定寬度，配上欄位的 tabular-nums 與右對齊，上下兩列的數字才會對齊
  const pad = (n: number) => String(n).padStart(2, '0')
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${ymd} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 和紙帳簿的紙紋（和我的紀錄菜單同一張）
installWashi()

onMounted(() => load(1))
</script>

<template>
  <!--
    管理頁的背景是星夜，深色卡片和夜空太接近，所以整頁做成一本攤開的和紙帳簿：
    米白和紙、深木粗框、墨色文字；表頭是深木條配像素字，角色與開通狀態用方框印章
  -->
  <div class="border-4 border-[#3b2618] bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] p-4 text-[#2a1a14] shadow-[6px_6px_0_rgba(0,0,0,0.45)] sm:p-6">
    <div class="space-y-1 border-b-2 border-dashed border-[#3b2618]/30 pb-4">
      <h1 class="font-pixel text-[24px] text-[#2a1a14]">會員列表</h1>
      <p class="text-sm leading-7 text-[#2a1a14]/75">
        共 {{ total }} 位會員。AI 解析預設關閉，要逐一開通；管理者一律可用。
        要把某個帳號升為管理者，在後端執行
        <code class="bg-[#3b2618] px-1.5 py-0.5 text-xs text-[#f1e7cf]">npm run user:promote -- &lt;email&gt;</code>。
      </p>
    </div>

    <p v-if="error" class="mt-4 border-2 border-[#a8322a] bg-[#a8322a]/10 px-3 py-2 text-sm text-[#a8322a]">
      {{ error }}
    </p>

    <!-- 手機欄位放不下，表格自己橫向捲動，不撐破頁面 -->
    <div class="mt-4 overflow-x-auto border-2 border-[#3b2618]">
      <table class="w-full min-w-[40rem] text-left text-sm">
        <thead class="bg-[#3b2618] font-pixel text-[12px] text-[#f1e7cf]">
          <tr>
            <th class="px-4 py-2 font-normal">Email</th>
            <th class="px-4 py-2 font-normal">顯示名稱</th>
            <th class="px-4 py-2 font-normal">角色</th>
            <th class="px-4 py-2 font-normal">AI 解析</th>
            <th class="px-4 py-2 text-right font-normal">註冊時間</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="n in 5" :key="n" class="border-b-2 border-dashed border-[#3b2618]/20 last:border-0">
              <td class="px-4 py-3"><SkeletonBlock class="h-4 w-48 rounded-none bg-[#3b2618]/15!" /></td>
              <td class="px-4 py-3"><SkeletonBlock class="h-4 w-20 rounded-none bg-[#3b2618]/15!" /></td>
              <td class="px-4 py-3"><SkeletonBlock class="h-6 w-16 rounded-none bg-[#3b2618]/15!" /></td>
              <td class="px-4 py-3"><SkeletonBlock class="h-7 w-28 rounded-none bg-[#3b2618]/15!" /></td>
              <td class="px-4 py-3"><SkeletonBlock class="ml-auto h-4 w-32 rounded-none bg-[#3b2618]/15!" /></td>
            </tr>
          </template>
          <tr v-else-if="!users.length">
            <td colspan="5" class="px-4 py-6 text-center text-[#2a1a14]/60">還沒有任何會員。</td>
          </tr>
          <tr
            v-for="user in users"
            v-else
            :key="user.id"
            class="border-b-2 border-dashed border-[#3b2618]/20 transition-colors last:border-0 hover:bg-[#3b2618]/5"
          >
            <td class="px-4 py-3">{{ user.email }}</td>
            <td class="px-4 py-3 text-[#2a1a14]/75">{{ user.displayName }}</td>
            <td class="px-4 py-3">
              <!-- 方框印章：管理者朱紅、會員藍；像素字只能用 12 的倍數，12 太小、24 太大，改用一般字 14px -->
              <span
                class="inline-block border-2 px-2 py-1 text-sm leading-none tracking-wide"
                :class="user.role === 'admin' ? 'border-[#a8322a] text-[#a8322a]' : 'border-[#3d5a80] text-[#3d5a80]'"
              >
                {{ user.role }}
              </span>
            </td>
            <td class="px-4 py-3">
              <span v-if="user.role === 'admin'" class="text-xs text-[#2a1a14]/55">管理者一律可用</span>
              <button
                v-else
                type="button"
                :disabled="updatingId === user.id"
                class="cursor-pointer border-2 border-[#3b2618] px-2.5 py-1 text-xs shadow-[2px_2px_0_rgba(0,0,0,0.3)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                :class="
                  user.aiAccess
                    ? 'bg-[#a8322a] text-[#f1e7cf] hover:bg-[#bf3d33]'
                    : 'bg-[#e9dcc0] text-[#2a1a14] hover:bg-[#f6eedb]'
                "
                @click="toggleAiAccess(user)"
              >
                {{ updatingId === user.id ? '更新中…' : user.aiAccess ? '已開通．點此收回' : '未開通．點此開通' }}
              </button>
            </td>
            <td class="px-4 py-3 text-right tabular-nums text-[#2a1a14]/65">{{ formatDate(user.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pageCount > 1" class="mt-4 flex items-center justify-center gap-3 text-sm">
      <button
        class="cursor-pointer border-2 border-[#3b2618] bg-[#e9dcc0] px-3 py-1 font-pixel text-[12px] shadow-[2px_2px_0_rgba(0,0,0,0.3)] transition hover:bg-[#f6eedb] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page <= 1 || loading"
        @click="load(page - 1)"
      >
        上一頁
      </button>
      <span class="tabular-nums text-[#2a1a14]/70">{{ page }} / {{ pageCount }}</span>
      <button
        class="cursor-pointer border-2 border-[#3b2618] bg-[#e9dcc0] px-3 py-1 font-pixel text-[12px] shadow-[2px_2px_0_rgba(0,0,0,0.3)] transition hover:bg-[#f6eedb] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="page >= pageCount || loading"
        @click="load(page + 1)"
      >
        下一頁
      </button>
    </div>
  </div>
</template>
