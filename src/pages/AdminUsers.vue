<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AdminUserDialog from '../components/AdminUserDialog.vue'
import SelectField from '../components/SelectField.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { fetchAdminLogs, fetchAdminUsers, setUserAiAccess, setUserStockAccess } from '../lib/api'
import { formatDateTime, isInactive, logActionText, loginMethodsText, personText, relativeTime } from '../lib/adminFormat'
import { installWashi } from '../lib/pixelArt'
import type { AdminLogEntry, AdminUser, AdminUserFilter, AdminUserSort, AdminUserStats } from '../types'

// 會員管理：頁首統計、搜尋／篩選／排序的會員列表（點一位開詳細彈窗），以及管理操作紀錄。
// 篩選與排序不記住（管理頁偶爾用，每次從「全部、依註冊時間」開始比較不會看漏人）

type Tab = 'users' | 'logs'
const tab = ref<Tab>('users')

// ---- 會員列表 ----
const users = ref<AdminUser[]>([])
const total = ref(0)
const stats = ref<AdminUserStats | null>(null)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

const keyword = ref('')
const filter = ref<AdminUserFilter>('all')
const sort = ref<AdminUserSort>('created')

const FILTER_OPTIONS: { value: AdminUserFilter; label: string }[] = [
  { value: 'all', label: '全部會員' },
  { value: 'ai', label: '已開通 AI 解析' },
  { value: 'stock', label: '已開通金融股市' },
  { value: 'inactive', label: '30 天沒有活動' },
  { value: 'disabled', label: '已停用' },
  { value: 'admin', label: '管理者' },
]
const SORT_OPTIONS: { value: AdminUserSort; label: string }[] = [
  { value: 'created', label: '依註冊時間' },
  { value: 'active', label: '依最後活動' },
  { value: 'login', label: '依最後登入' },
]

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const hasCondition = computed(() => keyword.value.trim() !== '' || filter.value !== 'all')

// 翻頁、打字可能連續觸發，舊的回應要丟掉（同 loadNarration 的 request id 作法）
let requestId = 0
async function load(target = page.value) {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await fetchAdminUsers({ page: target, pageSize, q: keyword.value, filter: filter.value, sort: sort.value })
    if (current !== requestId) return
    users.value = result.users
    total.value = result.total
    page.value = result.page
    if (result.stats) stats.value = result.stats
  } catch (requestError) {
    if (current !== requestId) return
    error.value = requestError instanceof Error ? requestError.message : '會員列表載入失敗。'
  } finally {
    if (current === requestId) loading.value = false
  }
}

// 搜尋停手 300ms 才查；篩選、排序馬上查。條件一變就回第 1 頁
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => load(1), 300)
})
watch([filter, sort], () => load(1))
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer)
})

function clearConditions() {
  keyword.value = ''
  filter.value = 'all'
}

// 換掉列表裡的那一列，不重抓整頁，避免排序或分頁跳動。
// 頁首統計也跟著加減（不然停用後「已停用」還是舊數字）；before 是操作前的樣子
function replaceUser(updated: AdminUser, before?: AdminUser) {
  const index = users.value.findIndex((item) => item.id === updated.id)
  const previous = before ?? (index >= 0 ? users.value[index] : undefined)
  if (index >= 0) users.value[index] = updated
  const s = stats.value
  if (!s || !previous || updated.role !== 'member') return
  const delta = (key: 'aiAccess' | 'stockAccess' | 'disabled') => Number(Boolean(updated[key])) - Number(Boolean(previous[key]))
  s.aiMembers += delta('aiAccess')
  s.stockMembers += delta('stockAccess')
  s.disabled += delta('disabled')
}

// ---- 開通／收回權限（列表上直接按）----
const updatingId = ref('')
type AccessField = 'aiAccess' | 'stockAccess'
const ACCESS_SETTERS = { aiAccess: setUserAiAccess, stockAccess: setUserStockAccess }

async function toggleAccess(user: AdminUser, field: AccessField) {
  if (updatingId.value || user.role === 'admin') return
  updatingId.value = `${user.id}:${field}`
  error.value = ''
  try {
    const result = await ACCESS_SETTERS[field](user.id, !user[field])
    replaceUser(result.user)
    logsLoaded = false
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : '權限更新失敗。'
  } finally {
    updatingId.value = ''
  }
}

// ---- 會員詳細彈窗 ----
const selected = ref<AdminUser | null>(null)
function onUpdated(user: AdminUser) {
  replaceUser(user, selected.value?.id === user.id ? selected.value : undefined)
  // 請求還沒回來就關掉彈窗的話，不要因為回應又把它打開
  if (selected.value?.id === user.id) selected.value = user
  logsLoaded = false
}

const statCards = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '全部會員', value: s.total },
    { label: '近 7 天有活動', value: s.active7d },
    { label: '本月新註冊', value: s.newThisMonth },
    { label: '開通 AI 解析', value: s.aiMembers },
    { label: '開通金融股市', value: s.stockMembers },
    { label: '已停用', value: s.disabled },
  ]
})

// ---- 管理操作紀錄 ----
const logs = ref<AdminLogEntry[]>([])
const logsTotal = ref(0)
const logsPage = ref(1)
const logsLoading = ref(false)
const logsError = ref('')
const LOGS_PAGE_SIZE = 30
const logsPageCount = computed(() => Math.max(1, Math.ceil(logsTotal.value / LOGS_PAGE_SIZE)))
// 有新操作（開通、停用…）後，下次切到紀錄分頁重新抓
let logsLoaded = false
let logsRequestId = 0

async function loadLogs(target = logsPage.value) {
  const current = ++logsRequestId
  logsLoading.value = true
  logsError.value = ''
  try {
    const result = await fetchAdminLogs(target)
    if (current !== logsRequestId) return
    logs.value = result.logs
    logsTotal.value = result.total
    logsPage.value = result.page
    logsLoaded = true
  } catch (requestError) {
    if (current !== logsRequestId) return
    logsError.value = requestError instanceof Error ? requestError.message : '操作紀錄載入失敗。'
  } finally {
    if (current === logsRequestId) logsLoading.value = false
  }
}

watch(tab, (value) => {
  if (value === 'logs' && !logsLoaded) void loadLogs(1)
})

// 和紙帳簿的紙紋（和我的紀錄菜單同一張）
installWashi()

onMounted(() => load(1))

const PAGER_BUTTON =
  'cursor-pointer border-2 border-frame bg-[#e9dcc0] px-3 py-1 font-pixel text-button shadow-[2px_2px_0_var(--c-shade)] transition hover:bg-[#f6eedb] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40'
</script>

<template>
  <!--
    管理頁的背景是星夜，深色卡片和夜空太接近，所以整頁做成一本攤開的和紙帳簿：
    米白和紙、深木粗框、墨色文字；表頭是深木條配像素字，角色與開通狀態用方框印章
  -->
  <div class="border-4 border-frame bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] p-4 text-[#2a1a14] shadow-[6px_6px_0_var(--c-shade)] sm:p-6">
    <div class="space-y-1 border-b-2 border-dashed border-frame/30 pb-4">
      <h1 class="font-pixel text-[24px] text-[#2a1a14]">會員管理</h1>
      <p class="text-body text-[#2a1a14]/75">
        AI 解析與金融股市（股市諮詢、股市追蹤）預設關閉，要分別逐一開通；管理者一律可用。點會員的 Email 看使用量、停用帳號或強制登出。
      </p>
    </div>

    <!-- 頁首統計：第一次載入前放同數量的骨架 -->
    <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <template v-if="statCards.length">
        <div v-for="card in statCards" :key="card.label" class="border-2 border-frame/40 bg-[#e9dcc0]/50 px-3 py-2">
          <p class="text-caption text-[#2a1a14]/65">{{ card.label }}</p>
          <p class="text-title font-semibold tabular-nums">{{ card.value }}</p>
        </div>
      </template>
      <template v-else-if="loading">
        <div v-for="n in 6" :key="n" class="space-y-2 border-2 border-frame/40 px-3 py-2">
          <SkeletonBlock class="h-3.5 w-20 rounded-none bg-frame/15!" />
          <SkeletonBlock class="h-6 w-10 rounded-none bg-frame/15!" />
        </div>
      </template>
    </div>

    <!-- 分頁：會員列表／操作紀錄（換頁用朱紅，和下面的篩選下拉區分） -->
    <div class="mt-5 flex gap-2" role="tablist" aria-label="會員管理">
      <button
        v-for="option in [{ value: 'users', label: '會員列表' }, { value: 'logs', label: '操作紀錄' }] as const"
        :key="option.value"
        type="button"
        role="tab"
        :aria-selected="tab === option.value"
        class="cursor-pointer border-2 border-frame px-3 py-1 font-pixel text-button transition active:translate-x-[2px] active:translate-y-[2px]"
        :class="tab === option.value ? 'bg-[#a8322a] text-[#f1e7cf]' : 'bg-[#e9dcc0] text-[#2a1a14] hover:bg-[#f6eedb]'"
        @click="tab = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- ── 會員列表 ── -->
    <template v-if="tab === 'users'">
      <div class="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <input
          v-model="keyword"
          type="search"
          maxlength="100"
          placeholder="搜尋 Email 或顯示名稱"
          aria-label="搜尋 Email 或顯示名稱"
          class="w-full border-2 border-frame bg-[#f1e7cf] px-2 py-1.5 text-body text-[#2a1a14] shadow-[3px_3px_0_var(--c-shade)] placeholder:text-[#2a1a14]/45 focus:border-[#a8322a] focus:outline-none"
        />
        <SelectField v-model="filter" :options="FILTER_OPTIONS" label="篩選" variant="washi" hide-label />
        <SelectField v-model="sort" :options="SORT_OPTIONS" label="排序" variant="washi" hide-label />
      </div>
      <p class="mt-2 text-caption text-[#2a1a14]/70">
        <template v-if="hasCondition">
          符合 {{ total }} 位
          <button type="button" class="ml-1 cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[#a8322a] active:text-[#a8322a]" @click="clearConditions">
            清除條件
          </button>
        </template>
        <template v-else>共 {{ total }} 位</template>
      </p>

      <div v-if="error" class="mt-3 flex flex-wrap items-center gap-3 border-2 border-[#a8322a] bg-[#a8322a]/10 px-3 py-2 text-body text-[#a8322a]">
        <span>{{ error }}</span>
        <button type="button" :class="PAGER_BUTTON" class="text-[#2a1a14]" :disabled="loading" @click="load()">重試</button>
      </div>

      <!-- 手機欄位放不下，表格自己橫向捲動，不撐破頁面 -->
      <div class="mt-3 overflow-x-auto border-2 border-frame">
        <table class="w-full min-w-[60rem] text-left text-body">
          <thead class="bg-frame font-pixel text-[12px] text-[#f1e7cf]">
            <tr>
              <th class="px-3 py-2 font-normal">會員</th>
              <th class="px-3 py-2 font-normal">角色</th>
              <th class="px-3 py-2 font-normal">登入方式</th>
              <th class="px-3 py-2 font-normal">AI 解析</th>
              <th class="px-3 py-2 font-normal">金融股市</th>
              <th class="px-3 py-2 text-right font-normal">最後活動</th>
              <th class="px-3 py-2 text-right font-normal">註冊時間</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="loading && !users.length">
              <tr v-for="n in 5" :key="n" class="border-b-2 border-dashed border-frame/20 last:border-0">
                <td class="px-3 py-3"><SkeletonBlock class="h-4 w-48 rounded-none bg-frame/15!" /><SkeletonBlock class="mt-1.5 h-3.5 w-20 rounded-none bg-frame/15!" /></td>
                <td class="px-3 py-3"><SkeletonBlock class="h-6 w-16 rounded-none bg-frame/15!" /></td>
                <td class="px-3 py-3"><SkeletonBlock class="h-4 w-20 rounded-none bg-frame/15!" /></td>
                <td class="px-3 py-3"><SkeletonBlock class="h-7 w-28 rounded-none bg-frame/15!" /></td>
                <td class="px-3 py-3"><SkeletonBlock class="h-7 w-28 rounded-none bg-frame/15!" /></td>
                <td class="px-3 py-3"><SkeletonBlock class="ml-auto h-4 w-20 rounded-none bg-frame/15!" /></td>
                <td class="px-3 py-3"><SkeletonBlock class="ml-auto h-4 w-32 rounded-none bg-frame/15!" /></td>
              </tr>
            </template>
            <tr v-else-if="!users.length">
              <td colspan="7" class="px-3 py-6 text-center text-[#2a1a14]/60">
                <!-- 讀取失敗時不能說「沒有會員」（上面已顯示錯誤與重試） -->
                {{ error ? '會員列表沒有讀到。' : hasCondition ? '沒有符合條件的會員。' : '還沒有任何會員。' }}
              </td>
            </tr>
            <tr
              v-for="user in users"
              v-else
              :key="user.id"
              class="border-b-2 border-dashed border-frame/20 transition-colors last:border-0 hover:bg-frame/5"
              :class="loading ? 'opacity-60' : ''"
            >
              <td class="max-w-[18em] px-3 py-3">
                <button
                  type="button"
                  class="block max-w-full cursor-pointer truncate text-left underline decoration-dotted underline-offset-2 hover:text-[#a8322a] active:text-[#a8322a]"
                  :title="`${user.email}：看詳細`"
                  @click="selected = user"
                >
                  {{ user.email }}
                </button>
                <span class="block truncate text-caption text-[#2a1a14]/65" :title="user.displayName">{{ user.displayName }}</span>
              </td>
              <td class="px-3 py-3">
                <div class="flex flex-wrap items-center gap-1">
                  <!-- 方框印章：管理者朱紅、會員藍；停用是墨色實心 -->
                  <span
                    class="inline-block border-2 px-2 py-1 text-caption leading-none tracking-wide"
                    :class="user.role === 'admin' ? 'border-[#a8322a] text-[#a8322a]' : 'border-[#3d5a80] text-[#3d5a80]'"
                  >
                    {{ user.role }}
                  </span>
                  <span v-if="user.disabled" class="inline-block border-2 border-[#2a1a14] bg-[#2a1a14] px-2 py-1 text-caption leading-none text-[#f1e7cf]">停用</span>
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-3 text-[#2a1a14]/75">{{ loginMethodsText(user) }}</td>
              <td v-for="field in (['aiAccess', 'stockAccess'] as const)" :key="field" class="px-3 py-3">
                <span v-if="user.role === 'admin'" class="text-caption text-[#2a1a14]/55">管理者一律可用</span>
                <button
                  v-else
                  type="button"
                  :disabled="updatingId === `${user.id}:${field}`"
                  class="cursor-pointer whitespace-nowrap border-2 border-frame px-2.5 py-1 text-button shadow-[2px_2px_0_var(--c-shade)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                  :class="user[field] ? 'bg-[#a8322a] text-[#f1e7cf] hover:bg-[#bf3d33]' : 'bg-[#e9dcc0] text-[#2a1a14] hover:bg-[#f6eedb]'"
                  @click="toggleAccess(user, field)"
                >
                  {{ updatingId === `${user.id}:${field}` ? '更新中…' : user[field] ? '已開通．點此收回' : '未開通．點此開通' }}
                </button>
              </td>
              <!-- 超過 30 天沒有活動（或沒有紀錄）標淡 -->
              <td
                class="whitespace-nowrap px-3 py-3 text-right tabular-nums"
                :class="isInactive(user) ? 'text-[#2a1a14]/45' : 'text-[#2a1a14]/80'"
                :title="formatDateTime(user.lastActiveAt)"
              >
                {{ relativeTime(user.lastActiveAt) }}
              </td>
              <td class="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[#2a1a14]/65">{{ formatDateTime(user.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-caption text-[#2a1a14]/60">
        最後活動：帶著登入狀態使用網站的最後時間（每小時記一次）。這個功能上線前沒來過的會員顯示「沒有紀錄」。
      </p>

      <div v-if="pageCount > 1" class="mt-4 flex items-center justify-center gap-3 text-body">
        <button type="button" :class="PAGER_BUTTON" :disabled="page <= 1 || loading" @click="load(page - 1)">上一頁</button>
        <span class="tabular-nums text-[#2a1a14]/70">{{ page }} / {{ pageCount }}</span>
        <button type="button" :class="PAGER_BUTTON" :disabled="page >= pageCount || loading" @click="load(page + 1)">下一頁</button>
      </div>
    </template>

    <!-- ── 操作紀錄 ── -->
    <template v-else>
      <p class="mt-4 text-body text-[#2a1a14]/75">開通、收回權限，停用、恢復帳號，強制登出，都會記在這裡（新到舊）。</p>
      <div v-if="logsError" class="mt-3 flex flex-wrap items-center gap-3 border-2 border-[#a8322a] bg-[#a8322a]/10 px-3 py-2 text-body text-[#a8322a]">
        <span>{{ logsError }}</span>
        <button type="button" :class="PAGER_BUTTON" class="text-[#2a1a14]" @click="loadLogs()">重試</button>
      </div>
      <ul v-if="logsLoading && !logs.length" class="mt-3 space-y-2">
        <li v-for="n in 6" :key="n" class="border-b-2 border-dashed border-frame/20 pb-2">
          <SkeletonBlock class="h-4 w-full max-w-md rounded-none bg-frame/15!" />
        </li>
      </ul>
      <p v-else-if="!logs.length && !logsError" class="mt-3 text-body text-[#2a1a14]/60">還沒有任何管理操作。</p>
      <ul v-else class="mt-3 space-y-2 text-body" :class="logsLoading ? 'opacity-60' : ''">
        <li v-for="entry in logs" :key="entry.id" class="flex flex-wrap gap-x-2 border-b-2 border-dashed border-frame/20 pb-2">
          <span class="tabular-nums text-[#2a1a14]/65">{{ formatDateTime(entry.createdAt) }}</span>
          <span class="font-semibold">{{ personText(entry.admin) }}</span>
          <span>{{ logActionText(entry) }}</span>
          <span class="break-all text-[#3d5a80]">{{ personText(entry.target ?? null) }}</span>
        </li>
      </ul>
      <div v-if="logsPageCount > 1" class="mt-4 flex items-center justify-center gap-3 text-body">
        <button type="button" :class="PAGER_BUTTON" :disabled="logsPage <= 1 || logsLoading" @click="loadLogs(logsPage - 1)">上一頁</button>
        <span class="tabular-nums text-[#2a1a14]/70">{{ logsPage }} / {{ logsPageCount }}</span>
        <button type="button" :class="PAGER_BUTTON" :disabled="logsPage >= logsPageCount || logsLoading" @click="loadLogs(logsPage + 1)">下一頁</button>
      </div>
    </template>

    <AdminUserDialog v-if="selected" :key="selected.id" :user="selected" @close="selected = null" @updated="onUpdated" />
  </div>
</template>
