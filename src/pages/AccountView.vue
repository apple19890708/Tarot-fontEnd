<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import GoogleSignInButton from '../components/GoogleSignInButton.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import { fetchAccount, resendVerificationRequest } from '../lib/api'
import { changePassword, deleteAccount, logoutEverywhere } from '../lib/auth'
import { confirmDialog } from '../lib/confirm'
import type { AccountInfo } from '../types'

// 帳號設定（v24 階段 2）：看登入方式、改密碼、登出所有裝置、刪除帳號。
// 從導覽列點自己的名字進來；真正的檢查（舊密碼、身分確認、管理者不能刪自己）都在後端
const router = useRouter()

const account = ref<AccountInfo | null>(null)
const loading = ref(true)
const loadError = ref('')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    account.value = (await fetchAccount()).account
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '帳號資料暫時讀不到，請稍後再試。'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ---- 重寄驗證信（v24 3-1）----
const resending = ref(false)
const resendNotice = ref('')
const resendError = ref('')

async function resendVerification() {
  if (resending.value) return
  resending.value = true
  resendNotice.value = ''
  resendError.value = ''
  try {
    const result = await resendVerificationRequest()
    if (result.verified && account.value) {
      account.value = { ...account.value, emailVerified: true }
    } else {
      resendNotice.value = `驗證信已寄到 ${result.email ?? account.value?.email ?? '你的信箱'}，請在 24 小時內點信裡的連結。`
    }
  } catch (error) {
    resendError.value = error instanceof Error ? error.message : '驗證信暫時寄不出去，請稍後再試。'
  } finally {
    resending.value = false
  }
}

// ---- 改密碼 ----
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changing = ref(false)
const changeError = ref('')
const changeDone = ref(false)

async function submitChange() {
  if (changing.value) return
  changeError.value = ''
  changeDone.value = false
  if (newPassword.value !== confirmPassword.value) {
    changeError.value = '兩次輸入的新密碼不一樣。'
    return
  }
  changing.value = true
  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    changeDone.value = true
  } catch (error) {
    changeError.value = error instanceof Error ? error.message : '密碼暫時改不了，請稍後再試。'
  } finally {
    changing.value = false
  }
}

// ---- 登出所有裝置 ----
const loggingOut = ref(false)
const logoutError = ref('')

async function onLogoutAll() {
  const ok = await confirmDialog({
    title: '登出所有裝置',
    message:
      '所有登入中的手機、電腦（包含這一台）都會被登出，要重新登入才能再用。\n懷疑帳號被別人用了，可以先按這個，再換一組新密碼。',
    confirmText: '全部登出',
    danger: true,
  })
  if (!ok) return
  loggingOut.value = true
  logoutError.value = ''
  try {
    await logoutEverywhere()
    void router.push('/')
  } catch (error) {
    logoutError.value = error instanceof Error ? error.message : '暫時登出不了，請稍後再試。'
  } finally {
    loggingOut.value = false
  }
}

// ---- 刪除帳號 ----
const deletePassword = ref('')
const deleting = ref(false)
const deleteError = ref('')

const DELETE_MESSAGE =
  '帳號和所有占卜紀錄、AI 解讀、股市追蹤清單、價位提醒、推播設定都會一起刪除，無法復原。\n確定要刪除嗎？'

async function runDelete(payload: { password?: string; credential?: string }) {
  const ok = await confirmDialog({ title: '刪除帳號', message: DELETE_MESSAGE, confirmText: '刪除帳號', danger: true })
  if (!ok) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteAccount(payload)
    void router.push('/')
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '帳號暫時刪不了，請稍後再試。'
  } finally {
    deleting.value = false
  }
}

function submitDelete() {
  if (deleting.value) return
  if (!deletePassword.value) {
    deleteError.value = '請輸入密碼確認是你本人。'
    return
  }
  void runDelete({ password: deletePassword.value })
}

// 只有 Google 的帳號：重新用 Google 登入一次，後端確認是同一個 Google 帳號才刪
function deleteWithGoogle(credential: string) {
  if (deleting.value) return
  void runDelete({ credential })
}

const CARD = 'space-y-4 rounded-[1.75rem] border border-tint/10 bg-surface p-6 sm:p-7'
const INPUT =
  'w-full rounded-xl border border-tint/10 bg-sink/20 px-3 py-2 text-body outline-none focus:border-accent-hue/40'
const LABEL = 'text-caption text-ink-muted'
</script>

<template>
  <div class="mx-auto max-w-xl space-y-5">
    <h1 class="text-title font-semibold">帳號設定</h1>

    <!-- 載入中：和下面帳號資料卡同形狀 -->
    <section v-if="loading" :class="CARD">
      <SkeletonBlock class="h-6 w-28" />
      <SkeletonBlock class="h-5 w-56" />
      <SkeletonBlock class="h-5 w-40" />
    </section>

    <section v-else-if="loadError" :class="CARD">
      <p class="text-body text-danger">{{ loadError }}</p>
      <button
        type="button"
        class="cursor-pointer rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-button text-accent hover:bg-accent-hue/20 active:translate-y-px"
        @click="load"
      >
        重新讀取
      </button>
    </section>

    <template v-else-if="account">
      <!-- 帳號資料 -->
      <section :class="CARD">
        <h2 class="text-subtitle font-semibold text-accent">帳號資料</h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
          <dt class="text-ink-muted">信箱</dt>
          <dd class="min-w-0 break-all">{{ account.email }}</dd>
          <dt class="text-ink-muted">信箱驗證</dt>
          <dd>
            <span v-if="account.emailVerified" class="text-down-ink">已驗證</span>
            <span v-else class="text-warn">還沒驗證</span>
          </dd>
          <dt class="text-ink-muted">名稱</dt>
          <dd class="min-w-0 break-all">{{ account.displayName }}</dd>
          <dt class="text-ink-muted">登入方式</dt>
          <dd class="flex flex-wrap gap-2">
            <span
              v-if="account.loginMethods.password"
              class="rounded-lg border border-tint/15 bg-tint/5 px-2 py-0.5 text-caption text-ink"
            >密碼</span>
            <span
              v-if="account.loginMethods.google"
              class="rounded-lg border border-tint/15 bg-tint/5 px-2 py-0.5 text-caption text-ink"
            >Google</span>
          </dd>
        </dl>
        <!-- 沒驗證的信箱：管理者不能開通 AI 與股市權限，提示重寄 -->
        <div v-if="!account.emailVerified" class="space-y-3 rounded-xl border border-warn/30 bg-tint/5 px-4 py-3">
          <p class="text-body leading-7 text-ink-soft">
            信箱還沒驗證。驗證過的帳號才能被開通 AI 解讀與股市功能；註冊時寄的驗證信 24 小時內有效。
          </p>
          <p v-if="resendNotice" class="text-body text-down-ink">{{ resendNotice }}</p>
          <p v-if="resendError" class="text-body text-danger">{{ resendError }}</p>
          <button
            type="button"
            :disabled="resending"
            class="cursor-pointer rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-button text-accent hover:bg-accent-hue/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            @click="resendVerification"
          >
            {{ resending ? '寄送中…' : '重寄驗證信' }}
          </button>
        </div>
      </section>

      <!-- 密碼 -->
      <section :class="CARD">
        <h2 class="text-subtitle font-semibold text-accent">密碼</h2>
        <form v-if="account.loginMethods.password" class="space-y-4" @submit.prevent="submitChange">
          <label class="block space-y-1.5">
            <span :class="LABEL">目前的密碼</span>
            <input v-model="currentPassword" type="password" autocomplete="current-password" required :class="INPUT" />
          </label>
          <label class="block space-y-1.5">
            <span :class="LABEL">新密碼（至少 8 個字元）</span>
            <input v-model="newPassword" type="password" autocomplete="new-password" minlength="8" required :class="INPUT" />
          </label>
          <label class="block space-y-1.5">
            <span :class="LABEL">再輸入一次新密碼</span>
            <input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="8" required :class="INPUT" />
          </label>
          <p v-if="changeError" class="rounded-xl border border-up-hue/20 bg-up-hue-2/10 px-3 py-2 text-body text-up-ink">
            {{ changeError }}
          </p>
          <p v-if="changeDone" class="rounded-xl border border-down-hue/20 bg-down-hue-2/10 px-3 py-2 text-body text-down-ink">
            密碼已更新，其他裝置都已登出；這台會繼續保持登入。
          </p>
          <button
            type="submit"
            :disabled="changing"
            class="w-full cursor-pointer rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-button font-medium text-accent hover:bg-accent-hue/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ changing ? '更新中…' : '更新密碼' }}
          </button>
        </form>
        <p v-else class="text-body leading-7 text-ink-soft">
          這個帳號用 Google 登入，還沒有設定密碼。想加一組密碼的話，到
          <router-link to="/forgot-password" class="text-warn hover:underline">忘記密碼</router-link>
          輸入你的信箱，用寄來的信設定。
        </p>
      </section>

      <!-- 登出所有裝置 -->
      <section :class="CARD">
        <h2 class="text-subtitle font-semibold text-accent">登出所有裝置</h2>
        <p class="text-body leading-7 text-ink-soft">在別人的電腦忘了登出，或懷疑帳號被別人用了，可以把所有裝置（包含這一台）一次登出。</p>
        <p v-if="logoutError" class="text-body text-danger">{{ logoutError }}</p>
        <button
          type="button"
          :disabled="loggingOut"
          class="cursor-pointer rounded-xl border border-danger-hue/40 px-4 py-2 text-button text-danger hover:bg-danger-hue/10 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          @click="onLogoutAll"
        >
          {{ loggingOut ? '登出中…' : '登出所有裝置' }}
        </button>
      </section>

      <!-- 刪除帳號 -->
      <section :class="[CARD, 'border-danger-hue/30']">
        <h2 class="text-subtitle font-semibold text-danger">刪除帳號</h2>
        <p v-if="account.role === 'admin'" class="text-body leading-7 text-ink-soft">管理者帳號不能自己刪除。</p>
        <template v-else>
          <p class="text-body leading-7 text-ink-soft">
            帳號和所有占卜紀錄、AI 解讀、股市追蹤清單、價位提醒、推播設定都會一起刪除，無法復原。
          </p>
          <form v-if="account.loginMethods.password" class="space-y-4" @submit.prevent="submitDelete">
            <label class="block space-y-1.5">
              <span :class="LABEL">輸入密碼確認是你本人</span>
              <input v-model="deletePassword" type="password" autocomplete="current-password" :class="INPUT" />
            </label>
            <p v-if="deleteError" class="text-body text-danger">{{ deleteError }}</p>
            <button
              type="submit"
              :disabled="deleting"
              class="cursor-pointer rounded-xl border border-danger-hue/50 bg-danger-hue/15 px-4 py-2 text-button text-danger hover:bg-danger-hue/25 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ deleting ? '刪除中…' : '刪除帳號' }}
            </button>
          </form>
          <div v-else class="space-y-3">
            <p class="text-body leading-7 text-ink-soft">請用這個帳號綁定的 Google 帳號再登入一次，確認是你本人。</p>
            <GoogleSignInButton :divider="false" @credential="deleteWithGoogle" />
            <p v-if="deleting" class="text-body text-ink-soft">刪除中…</p>
            <p v-if="deleteError" class="text-body text-danger">{{ deleteError }}</p>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>
