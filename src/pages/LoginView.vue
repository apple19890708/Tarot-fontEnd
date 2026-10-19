<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { login } from '../lib/auth'

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
      class="space-y-5 rounded-[1.75rem] border border-white/10 bg-white/5 p-7"
      @submit.prevent="submit"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">登入</h1>
        <p class="text-sm text-stone-300/80">登入後可以使用 AI 解讀，之後也會保留你的占卜紀錄。</p>
      </div>

      <label class="block space-y-1.5">
        <span class="text-sm text-stone-300/80">Email</span>
        <input
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm text-stone-300/80">密碼</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
        />
      </label>

      <p v-if="error" class="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="loading"
        class="w-full cursor-pointer rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ loading ? '登入中…' : '登入' }}
      </button>

      <p class="text-center text-sm text-stone-300/70">
        還沒有帳號？
        <router-link to="/register" class="text-amber-200 hover:underline">註冊一個</router-link>
      </p>
    </form>
  </div>
</template>
