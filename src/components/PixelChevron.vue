<script setup lang="ts">
// 收合按鈕用的像素箭頭（10×6 格的倒三角）。open 時轉 180 度朝上。
// 原本用文字「▾」配 text-xs，太小看不清楚，改成 SVG 才能控制大小、邊緣也維持像素感
defineProps<{ open: boolean }>()
</script>

<template>
  <svg
    viewBox="0 0 10 6"
    class="h-[9px] w-[15px] shrink-0 transition-transform duration-300 motion-reduce:transition-none"
    :class="open ? 'rotate-180' : ''"
    fill="currentColor"
    shape-rendering="crispEdges"
    aria-hidden="true"
  >
    <rect x="0" y="0" width="10" height="2" />
    <rect x="2" y="2" width="6" height="2" />
    <rect x="4" y="4" width="2" height="2" />
  </svg>
</template>
