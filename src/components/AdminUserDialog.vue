<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import SkeletonBlock from './SkeletonBlock.vue'
import { fetchAdminUser, forceLogoutUser, setUserDisabled } from '../lib/api'
import { currentUser } from '../lib/auth'
import { confirmDialog } from '../lib/confirm'
import { useScrollLock } from '../lib/useScrollLock'
import {
  formatDateTime,
  lastLoginMethodText,
  logActionText,
  loginMethodsText,
  personText,
  relativeTime,
} from '../lib/adminFormat'
import type { AdminUser, AdminUserDetail } from '../types'

// 會員詳細（會員管理頁點一列開啟）：基本資料、使用量、帳號操作（停用／恢復、強制登出）、最近的管理操作。
// 外觀和會員管理頁同一本和紙帳簿；手機全螢幕、桌機置中。帳號狀態變了用 updated 通知列表換掉那一列
const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{ close: []; updated: [user: AdminUser] }>()

useScrollLock()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const detail = ref<AdminUserDetail | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchAdminUser(props.user.id)
    if (id !== requestId) return
    detail.value = result
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '會員資料讀不到。'
    status.value = 'error'
  }
}
onMounted(load)

// 詳細資料回來前先用列表那一列的資料，標題與基本欄位不必等
const user = computed(() => detail.value?.user ?? props.user)
const isSelf = computed(() => currentUser.value?.id === props.user.id)
// 管理者不能被停用；自己不能從這裡登出；停用的帳號已經全部登出，不必再強制登出
const canDisable = computed(() => user.value.role !== 'admin' && !isSelf.value)
const canLogout = computed(() => !isSelf.value && !user.value.disabled)

const busy = ref<'' | 'disable' | 'logout'>('')
const actionError = ref('')
const notice = ref('')

async function toggleDisabled() {
  if (busy.value || !canDisable.value) return
  const disabling = !user.value.disabled
  const ok = await confirmDialog(
    disabling
      ? {
          title: '停用帳號',
          message: `確定要停用 ${user.value.email} 嗎？對方會立刻被登出所有裝置，之後也不能登入，直到你恢復帳號。資料不會被刪除。`,
          confirmText: '停用',
          danger: true,
        }
      : { title: '恢復帳號', message: `確定要恢復 ${user.value.email} 嗎？恢復後對方可以重新登入。`, confirmText: '恢復' },
  )
  if (!ok) return
  busy.value = 'disable'
  actionError.value = ''
  notice.value = ''
  try {
    const result = await setUserDisabled(props.user.id, disabling)
    emit('updated', result.user)
    notice.value = disabling ? '已停用，對方的所有裝置都已登出。' : '已恢復，對方可以重新登入。'
    await load()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '操作失敗。'
  } finally {
    busy.value = ''
  }
}

async function forceLogout() {
  if (busy.value || !canLogout.value) return
  const ok = await confirmDialog({
    title: '強制登出',
    message: `確定要讓 ${user.value.email} 的所有裝置登出嗎？對方重新登入就能繼續使用（帳號沒有被停用）。`,
    confirmText: '全部登出',
    danger: true,
  })
  if (!ok) return
  busy.value = 'logout'
  actionError.value = ''
  notice.value = ''
  try {
    const result = await forceLogoutUser(props.user.id)
    emit('updated', result.user)
    notice.value = '已登出對方的所有裝置。'
    await load()
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '操作失敗。'
  } finally {
    busy.value = ''
  }
}

// 「3 / 20」；admin 沒有上限只寫次數；舊版後端沒有數字寫 —
function quota(used: number | null, limit: number | null) {
  if (used === null) return '—'
  return limit === null ? `${used} 次` : `${used} / ${limit}`
}
const num = (value: number | null | undefined) => (value === null || value === undefined ? '—' : String(value))

const usageGroups = computed(() => {
  const usage = detail.value?.usage
  if (!usage) return []
  return [
    {
      title: '塔羅',
      rows: [
        { label: '占卜紀錄', value: num(usage.readings.total) },
        { label: '近 30 天', value: num(usage.readings.last30Days) },
      ],
    },
    {
      title: 'AI（今天，台北時間）',
      rows: [
        { label: '個股深度分析', value: quota(usage.ai.stockToday, usage.ai.stockLimit) },
        { label: '財經新聞分析', value: quota(usage.ai.newsToday, usage.ai.newsLimit) },
        { label: '個股分析紀錄', value: num(usage.ai.stockAnalyses) },
        { label: '新聞分析紀錄', value: num(usage.ai.newsAnalyses) },
      ],
    },
    {
      title: '股市',
      rows: [
        { label: '追蹤股票', value: num(usage.market.watches) },
        { label: '啟用中的提醒', value: num(usage.market.activeAlerts) },
        { label: '開推播的裝置', value: num(usage.market.pushDevices) },
      ],
    },
  ]
})

const infoRows = computed(() => [
  { label: '顯示名稱', value: user.value.displayName },
  { label: '登入方式', value: loginMethodsText(user.value) },
  { label: '註冊時間', value: formatDateTime(user.value.createdAt) },
  {
    label: '最後登入',
    value: user.value.lastLoginAt
      ? `${formatDateTime(user.value.lastLoginAt)}（${lastLoginMethodText(user.value.lastLoginMethod)}）`
      : '沒有紀錄',
  },
  { label: '最後活動', value: user.value.lastActiveAt ? `${formatDateTime(user.value.lastActiveAt)}（${relativeTime(user.value.lastActiveAt)}）` : '沒有紀錄' },
])

const BUTTON =
  'cursor-pointer border-2 border-frame px-3 py-1.5 text-button shadow-[2px_2px_0_var(--c-shade)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-overlay md:p-6" @click.self="emit('close')">
      <div
        class="flex h-full w-full flex-col border-frame bg-[#f1e7cf] [background-image:var(--pixel-washi)] [background-size:192px_192px] text-[#2a1a14] md:h-auto md:max-h-[90vh] md:max-w-2xl md:border-4 md:shadow-[6px_6px_0_var(--c-shade)]"
        role="dialog"
        aria-modal="true"
        :aria-label="`會員：${user.email}`"
      >
        <div class="flex items-start justify-between gap-3 border-b-2 border-dashed border-frame/30 px-4 py-3">
          <div class="min-w-0">
            <p class="truncate text-subtitle font-semibold" :title="user.email">{{ user.email }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                class="inline-block border-2 px-2 py-0.5 text-caption leading-none"
                :class="user.role === 'admin' ? 'border-[#a8322a] text-[#a8322a]' : 'border-[#3d5a80] text-[#3d5a80]'"
              >
                {{ user.role }}
              </span>
              <span v-if="user.disabled" class="inline-block border-2 border-[#2a1a14] bg-[#2a1a14] px-2 py-0.5 text-caption leading-none text-[#f1e7cf]">
                已停用
              </span>
              <span v-if="isSelf" class="text-caption text-[#2a1a14]/60">（你自己）</span>
            </div>
          </div>
          <button type="button" :class="[BUTTON, 'shrink-0 bg-[#e9dcc0] font-pixel hover:bg-[#f6eedb]']" @click="emit('close')">關閉</button>
        </div>

        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          <!-- 基本資料：列表那一列就有，不必等 -->
          <dl class="grid gap-x-4 gap-y-1.5 text-body sm:grid-cols-[auto_1fr]">
            <template v-for="row in infoRows" :key="row.label">
              <dt class="text-[#2a1a14]/65">{{ row.label }}</dt>
              <dd class="tabular-nums">{{ row.value }}</dd>
            </template>
            <template v-if="user.disabled">
              <dt class="text-[#2a1a14]/65">停用時間</dt>
              <dd class="tabular-nums">{{ formatDateTime(user.disabledAt) }}</dd>
            </template>
          </dl>

          <!-- 帳號操作 -->
          <section v-if="canDisable || canLogout" class="space-y-2">
            <h3 class="font-pixel text-[12px] text-[#a8322a]">帳號操作</h3>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="canDisable"
                type="button"
                :disabled="busy !== ''"
                :class="[BUTTON, user.disabled ? 'bg-[#e9dcc0] hover:bg-[#f6eedb]' : 'bg-[#a8322a] text-[#f1e7cf] hover:bg-[#bf3d33]']"
                @click="toggleDisabled"
              >
                {{ busy === 'disable' ? '處理中…' : user.disabled ? '恢復帳號' : '停用帳號' }}
              </button>
              <button v-if="canLogout" type="button" :disabled="busy !== ''" :class="[BUTTON, 'bg-[#e9dcc0] hover:bg-[#f6eedb]']" @click="forceLogout">
                {{ busy === 'logout' ? '處理中…' : '強制登出所有裝置' }}
              </button>
            </div>
            <p class="text-caption text-[#2a1a14]/65">
              停用：不能登入、已登入的裝置立刻登出，資料保留，可以再恢復。強制登出：只是讓對方重新登入一次（懷疑帳號被盜時用）。
            </p>
            <p v-if="notice" class="text-body text-[#2f6b3a]">{{ notice }}</p>
            <p v-if="actionError" class="text-body text-[#a8322a]">{{ actionError }}</p>
          </section>
          <p v-else-if="user.role === 'admin'" class="text-caption text-[#2a1a14]/65">
            管理者帳號不能被停用{{ isSelf ? '；要登出自己請用水晶球選單' : '' }}。
          </p>

          <!-- 使用量：等詳細資料 -->
          <section class="space-y-2">
            <h3 class="font-pixel text-[12px] text-[#a8322a]">使用量</h3>
            <div v-if="status === 'loading' && !detail" class="grid gap-2 sm:grid-cols-3">
              <div v-for="n in 3" :key="n" class="space-y-2 border-2 border-frame/40 p-3">
                <SkeletonBlock class="h-4 w-20 rounded-none bg-frame/15!" />
                <SkeletonBlock v-for="m in 3" :key="m" class="h-4 w-full rounded-none bg-frame/15!" />
              </div>
            </div>
            <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-[#a8322a] bg-[#a8322a]/10 px-3 py-2 text-body text-[#a8322a]">
              <span>{{ error }}</span>
              <button type="button" :class="[BUTTON, 'bg-[#e9dcc0] text-[#2a1a14] hover:bg-[#f6eedb]']" @click="load">重試</button>
            </div>
            <div v-else class="grid gap-2 sm:grid-cols-3">
              <div v-for="group in usageGroups" :key="group.title" class="border-2 border-frame/40 p-3">
                <p class="text-body font-semibold">{{ group.title }}</p>
                <dl class="mt-1.5 space-y-1 text-body">
                  <div v-for="row in group.rows" :key="row.label" class="flex justify-between gap-2">
                    <dt class="text-[#2a1a14]/65">{{ row.label }}</dt>
                    <dd class="tabular-nums">{{ row.value }}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <!-- 最近的管理操作 -->
          <section class="space-y-2">
            <h3 class="font-pixel text-[12px] text-[#a8322a]">最近的管理操作</h3>
            <div v-if="status === 'loading' && !detail" class="space-y-1.5">
              <SkeletonBlock v-for="n in 3" :key="n" class="h-4 w-full rounded-none bg-frame/15!" />
            </div>
            <p v-else-if="detail && detail.logs.length === 0" class="text-body text-[#2a1a14]/65">還沒有任何管理操作。</p>
            <ul v-else-if="detail" class="space-y-1 text-body">
              <li v-for="entry in detail.logs" :key="entry.id" class="flex flex-wrap gap-x-2">
                <span class="tabular-nums text-[#2a1a14]/65">{{ formatDateTime(entry.createdAt) }}</span>
                <span>{{ logActionText(entry) }}</span>
                <span class="text-[#2a1a14]/65">（{{ personText(entry.admin) }}）</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>
