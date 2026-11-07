<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { googleClientId, loadGoogleIdentity } from '../lib/googleIdentity'

// 「使用 Google 登入／註冊」按鈕：按鈕本身由 Google 的腳本畫（規定不能自己畫），這裡只負責載入與接回 credential。
// 沒設定 VITE_GOOGLE_CLIENT_ID 時整個元件不顯示
const props = defineProps<{ mode?: 'signin' | 'signup' }>()
const emit = defineEmits<{ credential: [value: string] }>()

const container = ref<HTMLElement | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')

onMounted(async () => {
  if (!googleClientId || !container.value) return
  try {
    const google = await loadGoogleIdentity()
    google.accounts.id.initialize({
      client_id: googleClientId,
      ux_mode: 'popup',
      callback: (response) => emit('credential', response.credential),
    })
    // 白底（outline）在深色卡片上最清楚；方角和上面的「登入」按鈕一致，不用藥丸形
    google.accounts.id.renderButton(container.value, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: props.mode === 'signup' ? 'signup_with' : 'signin_with',
      // Google 按鈕寬度上限 400px
      width: Math.min(400, container.value.offsetWidth || 320),
      locale: 'zh-TW',
    })
    status.value = 'ready'
  } catch {
    status.value = 'error'
  }
})
</script>

<template>
  <div v-if="googleClientId" class="space-y-3">
    <!-- 「或」分隔線 -->
    <div class="flex items-center gap-3 text-caption text-ink-muted">
      <span class="h-px flex-1 bg-tint/10" />
      或
      <span class="h-px flex-1 bg-tint/10" />
    </div>
    <!-- 載入中先放同高度的佔位，避免版面跳動 -->
    <div class="relative flex min-h-[44px] justify-center">
      <div ref="container" class="flex w-full justify-center" />
      <div v-if="status === 'loading'" class="absolute inset-0 animate-pulse rounded bg-tint/10" />
    </div>
    <p v-if="status === 'error'" class="text-center text-caption text-danger">Google 登入暫時載入不了，請重新整理或改用 email 登入。</p>
  </div>
</template>
