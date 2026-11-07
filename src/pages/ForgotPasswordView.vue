<script setup lang="ts">
import { ref } from 'vue'

import { forgotPasswordRequest } from '../lib/api'

// 忘記密碼（v17 規格 I）：輸入註冊時的信箱，後端核對有這個帳號才寄重設信；沒有就直接說
const email = ref('')
const loading = ref(false)
const error = ref('')
// 寄出後顯示的信箱（後端回的、已整理過大小寫）
const sentTo = ref('')

async function submit() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await forgotPasswordRequest(email.value.trim())
    sentTo.value = result.email
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : '寄送失敗，請稍後再試。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="space-y-5 rounded-[1.75rem] border border-white/10 bg-[#0f1526] p-7">
      <div class="space-y-1">
        <h1 class="text-xl font-semibold">忘記密碼</h1>
        <p class="text-sm text-stone-300">輸入註冊時用的信箱，我們會寄一封重設密碼的信給你。</p>
      </div>

      <!-- 寄出之後 -->
      <div v-if="sentTo" class="space-y-3">
        <p class="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
          重設信已經寄到 <span class="font-medium">{{ sentTo }}</span>。請在 30 分鐘內打開信裡的連結設定新密碼。
        </p>
        <p class="text-sm text-stone-300">沒收到的話，先看看垃圾郵件匣；5 分鐘後可以再寄一次。</p>
        <button
          type="button"
          class="w-full cursor-pointer rounded-xl border border-white/15 px-4 py-2 text-sm text-stone-200 hover:bg-white/10 active:bg-white/15"
          @click="sentTo = ''"
        >
          換一個信箱
        </button>
      </div>

      <form v-else class="space-y-5" @submit.prevent="submit">
        <label class="block space-y-1.5">
          <span class="text-sm text-stone-300">註冊時的信箱</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
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
          class="w-full cursor-pointer rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-200/20 active:bg-amber-200/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ loading ? '寄送中…' : '寄重設密碼信' }}
        </button>
      </form>

      <p class="text-center text-sm text-stone-300">
        想起來了？
        <router-link to="/login" class="text-amber-200 hover:underline">回登入</router-link>
      </p>
    </div>
  </div>
</template>
