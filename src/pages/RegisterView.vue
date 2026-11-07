<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import GoogleSignInButton from '../components/GoogleSignInButton.vue'
import { loginWithGoogle, register } from '../lib/auth'

const PASSWORD_MIN = 8

const router = useRouter()

const email = ref('')
const password = ref('')
const confirm = ref('')
const displayName = ref('')
const loading = ref(false)
const error = ref('')

// 用 Google 註冊：後端有同信箱的帳號就直接登入，沒有就建立
async function googleSignUp(credential: string) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await loginWithGoogle(credential)
    void router.replace('/')
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Google 註冊失敗，請稍後再試。'
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (loading.value) {
    return
  }

  // 兩次密碼不一致在前端就擋掉，不必往後端跑一趟
  if (password.value !== confirm.value) {
    error.value = '兩次輸入的密碼不一樣。'
    return
  }
  if (password.value.length < PASSWORD_MIN) {
    error.value = `密碼至少 ${PASSWORD_MIN} 個字元。`
    return
  }

  loading.value = true
  error.value = ''

  try {
    await register(email.value.trim(), password.value, displayName.value.trim() || undefined)
    // 註冊後端直接回 token，不必再登入一次
    router.replace('/')
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : '註冊失敗，請稍後再試。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <form
      class="space-y-5 rounded-[1.75rem] border border-tint/10 bg-surface p-7"
      @submit.prevent="submit"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">註冊</h1>
        <p class="text-sm text-ink-muted">只需要 email 和密碼，註冊完直接就是登入狀態。</p>
      </div>

      <label class="block space-y-1.5">
        <span class="text-sm text-ink-muted">Email</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full rounded-xl border border-tint/10 bg-sink/20 px-3 py-2 text-sm outline-none focus:border-accent-hue/40"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm text-ink-muted">顯示名稱（選填）</span>
        <input
          v-model="displayName"
          type="text"
          maxlength="40"
          class="w-full rounded-xl border border-tint/10 bg-sink/20 px-3 py-2 text-sm outline-none focus:border-accent-hue/40"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm text-ink-muted">密碼（至少 {{ PASSWORD_MIN }} 個字元）</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          class="w-full rounded-xl border border-tint/10 bg-sink/20 px-3 py-2 text-sm outline-none focus:border-accent-hue/40"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm text-ink-muted">再輸入一次密碼</span>
        <input
          v-model="confirm"
          type="password"
          autocomplete="new-password"
          required
          class="w-full rounded-xl border border-tint/10 bg-sink/20 px-3 py-2 text-sm outline-none focus:border-accent-hue/40"
        />
      </label>

      <p v-if="error" class="rounded-xl border border-up-hue/20 bg-up-hue-2/10 px-3 py-2 text-sm text-up-ink">
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full cursor-pointer rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent-hue/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ loading ? '註冊中…' : '建立帳號' }}
      </button>

      <GoogleSignInButton mode="signup" @credential="googleSignUp" />

      <p class="text-center text-sm text-ink-muted">
        已經有帳號了？
        <router-link to="/login" class="text-warn hover:underline">去登入</router-link>
      </p>
    </form>
  </div>
</template>
