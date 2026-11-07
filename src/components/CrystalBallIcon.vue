<script setup lang="ts">
import { theme } from '../lib/theme'

// 12×12 的像素選單圖示（浮動選單、彈窗的「跳到段落」共用）：黑夜是水晶球，白天是太陽（2026-11-08 使用者決定）。
// 主體用 currentColor（顏色由呼叫端的 text-orb／text-orb-glow 決定）；sparkle 時旁邊冒出兩顆星星。crispEdges 讓邊緣不被柔化
defineProps<{ sparkle?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
    <template v-if="theme === 'day'">
      <!-- 太陽：上下左右四道光、四角斜光、中間圓圈 -->
      <g fill="currentColor">
        <rect x="5" y="0" width="2" height="2" />
        <rect x="5" y="10" width="2" height="2" />
        <rect x="0" y="5" width="2" height="2" />
        <rect x="10" y="5" width="2" height="2" />
        <rect x="1" y="1" width="1" height="1" />
        <rect x="2" y="2" width="1" height="1" />
        <rect x="10" y="1" width="1" height="1" />
        <rect x="9" y="2" width="1" height="1" />
        <rect x="1" y="10" width="1" height="1" />
        <rect x="2" y="9" width="1" height="1" />
        <rect x="10" y="10" width="1" height="1" />
        <rect x="9" y="9" width="1" height="1" />
        <rect x="5" y="3" width="2" height="1" />
        <rect x="4" y="4" width="4" height="4" />
        <rect x="3" y="5" width="1" height="2" />
        <rect x="8" y="5" width="1" height="2" />
        <rect x="5" y="8" width="2" height="1" />
      </g>
      <!-- 高光 -->
      <rect x="5" y="4" width="1" height="1" fill="#fff" opacity="0.7" />
    </template>
    <template v-else>
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
    </template>
    <!-- 打開時的星星（太陽的四角已經有光，星星放在光與光之間） -->
    <g v-if="sparkle" fill="var(--c-orb-star)">
      <rect :x="theme === 'day' ? 8 : 11" y="0" width="1" height="1" />
      <rect x="0" y="3" width="1" height="1" />
    </g>
  </svg>
</template>
