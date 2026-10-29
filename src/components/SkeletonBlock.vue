<script setup lang="ts">
// 載入中的佔位塊。形狀與尺寸一律由使用端的 Tailwind class 指定
// （單一根元素，Vue 會自動把 class 合併進來），目的是做成和真實內容一樣的大小，
// 資料回來時版面才不會跳動。只是視覺佔位，對輔助技術隱藏。
</script>

<template>
  <div class="animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none" aria-hidden="true" />
</template>
