<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { checkResetToken, resetPasswordRequest } from '../lib/api'

// 重設密碼（v17 規格 I）：從重設信的連結進來（?token=…）。先問後端連結還能不能用，能用才顯示新密碼表單
const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const status = ref<'checking' | 'valid' | 'invalid' | 'error'>('checking')
const maskedEmail = ref('')

const password = ref('')
const confirm = ref('')
const saving = ref(false)
const error = ref('')

async function check() {
  if (!token.value) {
    status.value = 'invalid'
    return
  }
  status.value = 'checking'
  try {
    const result = await checkResetToken(token.value)
    status.value = result.valid ? 'valid' : 'invalid'
    maskedEmail.value = result.email ?? ''
  } catch {
    status.value = 'error'
  }
}

async function submit() {
  if (saving.value) return
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = '兩次輸入的密碼不一樣。'
    return
  }
  saving.value = true
  try {
    await resetPasswordRequest(token.value, password.value)
    // 成功後回登入頁，用 query 帶一句提示
    void router.replace({ path: '/login', query: { reset: '1' } })
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : '更新失敗，請稍後再試。'
  } finally {
    saving.value = false
  }
}

onMounted(check)
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="space-y-5 rounded-[1.75rem] border border-white/10 bg-[#0f1526] p-7">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">設定新密碼</h1>
        <p v-if="status === 'valid'" class="text-sm text-stone-300">帳號 {{ maskedEmail }}</p>
      </div>

      <!-- 確認連結中：和表單同形狀的骨架 -->
      <div v-if="status === 'checking'" class="space-y-4" aria-busy="true">
        <div v-for="n in 2" :key="n" class="space-y-1.5">
          <div class="h-4 w-20 animate-pulse rounded bg-white/10" />
          <div class="h-9 w-full animate-pulse rounded-xl bg-white/10" />
        </div>
        <div class="h-9 w-full animate-pulse rounded-xl bg-white/10" />
      </div>

      <div v-else-if="status === 'invalid'" class="space-y-3">
        <p class="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          這個重設連結已經失效：可能超過 30 分鐘、已經用過，或你後來又申請了一封新的信。
        </p>
        <router-link
          to="/forgot-password"
          class="block w-full rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-center text-sm font-medium text-amber-100 hover:bg-amber-200/20"
        >
          重新申請重設密碼
        </router-link>
      </div>

      <div v-else-if="status === 'error'" class="space-y-3">
        <p class="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">暫時無法確認連結，請稍後再試。</p>
        <button
          type="button"
          class="w-full cursor-pointer rounded-xl border border-white/15 px-4 py-2 text-sm text-stone-200 hover:bg-white/10 active:bg-white/15"
          @click="check"
        >
          重試
        </button>
      </div>

      <form v-else class="space-y-5" @submit.prevent="submit">
        <label class="block space-y-1.5">
          <span class="text-sm text-stone-300">新密碼（至少 8 個字）</span>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
          />
        </label>
        <label class="block space-y-1.5">
          <span class="text-sm text-stone-300">再輸入一次</span>
          <input
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            required
            class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
          />
        </label>

        <p v-if="error" class="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          {{ error }}
        </p>

        <button
          type="submit"
          :disabled="saving"
          class="w-full cursor-pointer rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-200/20 active:bg-amber-200/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ saving ? '更新中…' : '更新密碼' }}
        </button>
      </form>
    </div>
  </div>
</template>
