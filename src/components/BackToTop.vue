<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { smoothScrollTo } from '../lib/motion'

// 結果頁很長，往下捲超過一個畫面高就浮出這顆按鈕，點了回到最上面。
const visible = ref(false)

function update() {
  visible.value = window.scrollY > window.innerHeight
}

function toTop() {
  smoothScrollTo(0)
}

onMounted(() => {
  update()
  // 捲動事件很密集，用 passive 讓瀏覽器不必等這裡處理完才捲
  window.addEventListener('scroll', update, { passive: true })
  // 轉向或視窗改變時畫面高度會變，門檻要重算
  window.addEventListener('resize', update)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', update)
  window.removeEventListener('resize', update)
})
</script>

<template>
  <!-- 掛到 body 底下：外層只要有 transform（步驟切換的 Transition），fixed 就會被困在裡面 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 [transition-timing-function:steps(4)] motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 [transition-timing-function:steps(3)] motion-reduce:transition-none"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-2"
    >
      <!--
        像素風按鈕（計畫書 v01 2.7.1）：方塊、深色描邊、硬邊投影；
        內側左上亮、右下暗做出立體感。滑過浮起一格，按下時沉下去、投影縮小
      -->
      <button
        v-if="visible"
        type="button"
        class="fixed bottom-20 right-4 z-40 md:bottom-8 md:right-8 flex h-12 w-12 cursor-pointer items-center justify-center border-2 border-[#3a1a08] bg-orange-400 text-white shadow-[inset_3px_3px_0_#fdba74,inset_-3px_-3px_0_#c2410c,4px_4px_0_#3a1a08] transition-transform [transition-timing-function:steps(2)] hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[inset_3px_3px_0_#fdba74,inset_-3px_-3px_0_#c2410c,2px_2px_0_#3a1a08]"
        aria-label="回到頂端"
        @click="toTop"
      >
        <!-- 12×12 格的像素箭頭：三角形箭頭加兩格寬的箭身，crispEdges 讓邊緣不被柔化 -->
        <svg class="h-6 w-6" viewBox="0 0 12 12" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">
          <rect x="5" y="1" width="2" height="1" />
          <rect x="4" y="2" width="4" height="1" />
          <rect x="3" y="3" width="6" height="1" />
          <rect x="2" y="4" width="8" height="1" />
          <rect x="5" y="5" width="2" height="6" />
        </svg>
      </button>
    </Transition>
  </Teleport>
</template>
