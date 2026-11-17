<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { verifyEmailRequest } from '../lib/api'
import { isLoggedIn, markEmailVerified } from '../lib/auth'

// 驗證信箱（v24 3-1）：從驗證信的連結進來（?token=…），一打開就送給後端確認。
// 不需要登入（可能在手機打開電腦註冊的信）；已登入的話順便更新畫面上的狀態
const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const status = ref<'checking' | 'done' | 'invalid' | 'error'>('checking')
const message = ref('')
const maskedEmail = ref('')

async function verify() {
  if (!token.value) {
    status.value = 'invalid'
    message.value = '這個連結少了驗證碼，請直接點信裡的按鈕。'
    return
  }
  status.value = 'checking'
  try {
    const result = await verifyEmailRequest(token.value)
    maskedEmail.value = result.email
    markEmailVerified()
    status.value = 'done'
  } catch (error) {
    // 400 是連結失效（訊息由後端說明）；其他是暫時的錯誤，可以重試
    const text = error instanceof Error ? error.message : ''
    if (text.includes('失效')) {
      status.value = 'invalid'
      message.value = text
    } else {
      status.value = 'error'
      message.value = text || '暫時無法驗證，請稍後再試。'
    }
  }
}
onMounted(verify)
</script>

<template>
  <div class="mx-auto max-w-md">
    <div class="space-y-5 rounded-[1.75rem] border border-tint/10 bg-surface p-7">
      <h1 class="text-title font-semibold">驗證信箱</h1>

      <!-- 確認中：和結果訊息同形狀的骨架 -->
      <div v-if="status === 'checking'" class="space-y-3" aria-busy="true">
        <div class="h-12 w-full animate-pulse rounded-xl bg-tint/10" />
        <div class="h-9 w-full animate-pulse rounded-xl bg-tint/10" />
      </div>

      <div v-else-if="status === 'done'" class="space-y-3">
        <p class="rounded-xl border border-down-hue/20 bg-down-hue-2/10 px-3 py-2 text-body text-down-ink">
          信箱 {{ maskedEmail }} 驗證完成，謝謝！
        </p>
        <router-link
          :to="isLoggedIn ? '/' : '/login'"
          class="block w-full rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-center text-button font-medium text-accent hover:bg-accent-hue/20 active:translate-y-px"
        >
          {{ isLoggedIn ? '回首頁抽牌' : '去登入' }}
        </router-link>
      </div>

      <div v-else-if="status === 'invalid'" class="space-y-3">
        <p class="rounded-xl border border-up-hue/20 bg-up-hue-2/10 px-3 py-2 text-body text-up-ink">{{ message }}</p>
        <router-link
          :to="isLoggedIn ? '/account' : '/login'"
          class="block w-full rounded-xl border border-accent-hue/30 bg-accent-hue/10 px-4 py-2 text-center text-button font-medium text-accent hover:bg-accent-hue/20 active:translate-y-px"
        >
          {{ isLoggedIn ? '到帳號設定頁重寄' : '登入後重寄驗證信' }}
        </router-link>
      </div>

      <div v-else class="space-y-3">
        <p class="rounded-xl border border-up-hue/20 bg-up-hue-2/10 px-3 py-2 text-body text-up-ink">{{ message }}</p>
        <button
          type="button"
          class="w-full cursor-pointer rounded-xl border border-tint/15 px-4 py-2 text-button text-ink-soft hover:bg-tint/10 active:bg-tint/15"
          @click="verify"
        >
          重試
        </button>
      </div>
    </div>
  </div>
</template>
