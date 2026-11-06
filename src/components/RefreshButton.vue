<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import type { useCooldown } from '../lib/useCooldown'

// 股市頁的「更新」類按鈕（更新、更新報價、重試）：手機沒有 hover，所以點擊回饋要明顯。
// - 平常：琥珀色外框＋像素陰影，按下去往右下沉、陰影消失（觸控也看得到）
// - 載入中：箭頭轉圈＋「更新中…」
// - 剛更新完（成功）：短暫顯示綠色勾勾＋「已更新」
// - 冷卻中：變灰、顯示剩餘秒數，底下一條會縮短的進度條
const props = withDefaults(
  defineProps<{
    label: string
    loading?: boolean
    loadingLabel?: string
    cooldown: ReturnType<typeof useCooldown>
    // 冷卻以外還要停用的情況（例如另一個請求正在跑）
    disabled?: boolean
    // 這次請求失敗：載入結束時不顯示「已更新」
    failed?: boolean
    tone?: 'default' | 'danger'
  }>(),
  { loading: false, loadingLabel: '更新中…', disabled: false, failed: false, tone: 'default' },
)
const emit = defineEmits<{ click: [] }>()

// 使用者按下後的那次載入結束、而且沒失敗：顯示「已更新」一下子（頁面自己載入、自動更新時不顯示）
const JUST_DONE_MS = 1500
const justDone = ref(false)
let pressed = false
let justDoneTimer: ReturnType<typeof setTimeout> | null = null
function onClick() {
  pressed = true
  emit('click')
}
watch(
  () => props.loading,
  (loading, wasLoading) => {
    if (loading || !wasLoading || !pressed) return
    pressed = false
    // failed 可能和 loading 同一輪才更新，等 DOM 更新後再看
    void nextTick(() => {
      if (props.failed) return
      justDone.value = true
      if (justDoneTimer) clearTimeout(justDoneTimer)
      justDoneTimer = setTimeout(() => (justDone.value = false), JUST_DONE_MS)
    })
  },
)
onBeforeUnmount(() => {
  if (justDoneTimer) clearTimeout(justDoneTimer)
})

const cooling = computed(() => props.cooldown.active.value)
const progress = computed(() =>
  cooling.value ? Math.min(100, (props.cooldown.remaining.value / props.cooldown.seconds) * 100) : 0,
)
const idle = computed(() => !props.loading && !cooling.value && !props.disabled)

const toneClass = computed(() => {
  if (props.loading) return 'border-amber-200/50 bg-amber-200/20 text-amber-50'
  if (justDone.value) return 'border-emerald-300/50 bg-emerald-300/15 text-emerald-100'
  if (cooling.value || props.disabled) return 'border-white/10 bg-white/[0.03] text-stone-500'
  return props.tone === 'danger'
    ? 'border-rose-200/40 bg-rose-300/10 text-rose-50 hover:bg-rose-300/20 active:bg-rose-300/30'
    : 'border-amber-200/40 bg-amber-200/10 text-amber-50 hover:bg-amber-200/20 active:bg-amber-200/30'
})
</script>

<template>
  <!-- @touchstart：iOS Safari 要有觸控事件，:active 的按下效果才會出現 -->
  <button
    type="button"
    class="relative inline-flex shrink-0 cursor-pointer touch-manipulation select-none items-center gap-1.5 overflow-hidden border-2 px-3 py-1 text-[14px] transition-[background-color,border-color,color,transform,box-shadow] duration-100 disabled:cursor-not-allowed font-pixel"
    :class="[
      toneClass,
      idle
        ? 'shadow-[3px_3px_0_rgba(0,0,0,0.55)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none'
        : 'translate-x-[3px] translate-y-[3px] shadow-none',
    ]"
    :disabled="loading || cooling || disabled"
    :aria-busy="loading"
    @touchstart.passive="() => {}"
    @click="onClick"
  >
    <!-- 圖示：載入中轉圈、剛更新完打勾、其他是循環箭頭 -->
    <svg v-if="justDone" class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" stroke-linecap="square" />
    </svg>
    <svg
      v-else
      class="h-3.5 w-3.5"
      :class="loading ? 'animate-spin' : ''"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path d="M13.5 8A5.5 5.5 0 1 1 11.6 3.8" stroke-linecap="square" />
      <path d="M11 1.5v3h3" stroke-linecap="square" />
    </svg>
    <span>
      <template v-if="loading">{{ loadingLabel }}</template>
      <template v-else-if="justDone">已更新</template>
      <template v-else-if="cooling">{{ label }}（{{ cooldown.remaining.value }}）</template>
      <template v-else>{{ label }}</template>
    </span>
    <!-- 冷卻剩餘時間：越來越短，0 秒時消失 -->
    <span
      v-if="cooling && !justDone"
      class="absolute bottom-0 left-0 h-[2px] bg-amber-200/50 transition-[width] duration-1000 ease-linear"
      :style="{ width: `${progress}%` }"
      aria-hidden="true"
    />
  </button>
</template>
