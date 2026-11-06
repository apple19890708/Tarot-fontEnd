<script setup lang="ts">
// 12×12 的像素水晶球（浮動選單、彈窗的「跳到段落」共用）：球身用 currentColor，
// 左上一塊高光、木頭底座；sparkle 時旁邊冒出兩顆星星。crispEdges 讓邊緣不被柔化
defineProps<{ sparkle?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
    <!-- 球身 -->
    <rect x="4" y="0" width="4" height="1" fill="currentColor" />
    <rect x="3" y="1" width="6" height="1" fill="currentColor" />
    <rect x="2" y="2" width="8" height="4" fill="currentColor" />
    <rect x="3" y="6" width="6" height="1" fill="currentColor" />
    <rect x="4" y="7" width="4" height="1" fill="currentColor" />
    <!-- 高光 -->
    <rect x="3" y="2" width="2" height="1" fill="#fff" opacity="0.85" />
    <rect x="3" y="3" width="1" height="1" fill="#fff" opacity="0.85" />
    <!-- 球裡的小閃光 -->
    <rect x="7" y="4" width="1" height="1" fill="#fff" opacity="0.6" />
    <!-- 底座 -->
    <rect x="3" y="8" width="6" height="1" fill="#b7793f" />
    <rect x="2" y="9" width="8" height="2" fill="#8a5528" />
    <rect x="2" y="9" width="8" height="1" fill="#c98a4b" />
    <!-- 打開時的星星 -->
    <g v-if="sparkle" fill="#fde68a">
      <rect x="11" y="0" width="1" height="1" />
      <rect x="0" y="3" width="1" height="1" />
    </g>
  </svg>
</template>
