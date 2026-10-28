<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { prefersReducedMotion } from '../lib/motion'

// 結果頁在手機上很長，捲過整頁一半才浮出這顆按鈕，點了回到最上面。
const visible = ref(false)

function update() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  visible.value = max > 0 && window.scrollY > max / 2
}

function toTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

onMounted(() => {
  update()
  // 捲動事件很密集，用 passive 讓瀏覽器不必等這裡處理完才捲
  window.addEventListener('scroll', update, { passive: true })
  // 轉向或視窗改變時整頁高度會變，門檻要重算
  window.addEventListener('resize', update)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', update)
  window.removeEventListener('resize', update)
})
</script>

<template>
  <!-- 外層卡片有 backdrop-blur，fixed 會被困在那張卡片裡，所以掛到 body 底下 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <button
        v-if="visible"
        type="button"
        class="fixed bottom-20 right-4 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-orange-200/50 bg-orange-400 text-white shadow-lg shadow-orange-400/30 transition hover:scale-105 md:hidden"
        aria-label="回到頂端"
        @click="toTop"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
    </Transition>
  </Teleport>
</template>
