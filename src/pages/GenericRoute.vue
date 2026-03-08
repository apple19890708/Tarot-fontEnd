<template>
  <div class="prose max-w-none">
    <h1>動態路由</h1>
    <p>這是由 `RoutesAdmin` 新增的動態路由（占位頁面）。</p>
    <p class="text-sm text-stone-400">Path: {{ $route.path }}</p>
    <p class="text-sm text-stone-400">Name: {{ $route.name }}</p>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped></style>
