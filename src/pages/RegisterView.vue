<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { register } from '../lib/auth'

const PASSWORD_MIN = 8

const router = useRouter()

const email = ref('')
const password = ref('')
const confirm = ref('')
const displayName = ref('')
const loading = ref(false)
const error = ref('')

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
      class="space-y-5 rounded-[1.75rem] border border-white/10 bg-white/5 p-7"
      @submit.prevent="submit"
    >
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">註冊</h1>
        <p class="text-sm text-stone-300/80">只需要 email 和密碼，註冊完直接就是登入狀態。</p>
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
        <span class="text-sm text-stone-300/80">顯示名稱（選填）</span>
        <input
          v-model="displayName"
          type="text"
          maxlength="40"
          class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm text-stone-300/80">密碼（至少 {{ PASSWORD_MIN }} 個字元）</span>
        <input
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-amber-200/40"
        />
      </label>

      <label class="block space-y-1.5">
        <span class="text-sm text-stone-300/80">再輸入一次密碼</span>
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
        :disabled="loading"
        class="w-full cursor-pointer rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ loading ? '註冊中…' : '建立帳號' }}
      </button>

      <p class="text-center text-sm text-stone-300/70">
        已經有帳號了？
        <router-link to="/login" class="text-amber-200 hover:underline">去登入</router-link>
      </p>
    </form>
  </div>
</template>
