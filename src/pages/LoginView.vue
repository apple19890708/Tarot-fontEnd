<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import GoogleSignInButton from '../components/GoogleSignInButton.vue'
import { login, loginWithGoogle } from '../lib/auth'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

// 被守衛導過來時，原本要去的路徑記在 query.redirect
function afterLogin() {
  const redirect = route.query.redirect
  router.replace(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/')
}

// 從重設密碼頁回來時提示一句
const justReset = route.query.reset === '1'

async function googleSignIn(credential: string) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await loginWithGoogle(credential)
    afterLogin()
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Google 登入失敗，請稍後再試。'
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (loading.value) {
    return
  }

  loading.value = true
  error.value = ''

  try {
    await login(email.value.trim(), password.value)
    afterLogin()
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : '登入失敗，請稍後再試。'
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
        <h1 class="text-xl font-semibold">登入</h1>
        <p class="text-sm text-ink-muted">登入後可以使用 AI 解讀，之後也會保留你的占卜紀錄。</p>
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
        <span class="text-sm text-ink-muted">密碼</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-xl border border-tint/10 bg-sink/20 px-3 py-2 text-sm outline-none focus:border-accent-hue/40"
        />
      </label>

      <p v-if="justReset && !error" class="rounded-xl border border-down-hue/20 bg-down-hue-2/10 px-3 py-2 text-sm text-down-ink">
        密碼已經更新，請用新密碼登入。
      </p>

      <p class="-mt-2 text-right text-sm">
        <router-link to="/forgot-password" class="text-warn hover:underline">忘記密碼？</router-link>
      </p>

      <p v-if="error" class="rounded-xl border border-up-hue/20 bg-up-hue-2/10 px-3 py-2 text-sm text-up-ink">
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full cursor-pointer rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent-hue/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ loading ? '登入中…' : '登入' }}
      </button>

      <GoogleSignInButton @credential="googleSignIn" />

      <p class="text-center text-sm text-ink-muted">
        還沒有帳號？
        <router-link to="/register" class="text-warn hover:underline">註冊一個</router-link>
      </p>
    </form>
  </div>
</template>
