<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-semibold">路由管理</h1>
    <p class="text-sm text-stone-300">此頁面可用來展示或管理前端路由（範例）。</p>

    <div class="rounded-lg border bg-white/5 p-4">
      <p class="text-sm">目前路由清單（靜態範例）:</p>
      <ul class="mt-2 list-disc pl-5 text-sm">
        <li>/ （首頁）</li>
        <li>/routes （路由管理）</li>
      </ul>
    </div>

    <router-link to="/" class="text-amber-300">回到首頁</router-link>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped></style>
