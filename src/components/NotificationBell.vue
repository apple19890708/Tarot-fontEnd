<script setup lang="ts">
// 頂欄的通知鈴鐺（v26 計畫 5）：放在會員頭像左邊，顯示未讀數（超過 99 顯示 99+）。
// 點了打開通知面板：桌機從鈴鐺往下展開，手機是底部彈窗（背景壓暗、不能捲）。
// 照 ui-check 彈出層規則：點外面、Esc、換頁都會關；確認彈窗（清除已讀）開著時不算點外面，Esc 也只關確認彈窗
// 焦點：手機的底部彈窗是真的彈窗（背景壓暗、不能捲），用 useDialogFocus 把焦點移進去、Tab 不跑出去、關掉後還回鈴鐺；
// 桌機是鈴鐺下面的小面板（不擋頁面、點外面就關），不困住 Tab，只做 Esc 關閉並把焦點還給鈴鐺
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { confirmState } from '../lib/confirm'
import { badgeText, refreshUnreadNotifications, unreadNotifications } from '../lib/notifications'
import { useDialogFocus } from '../lib/useDialogFocus'
import NotificationPanel from './NotificationPanel.vue'

const props = defineProps<{ wide: boolean }>()

const route = useRoute()
const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

useDialogFocus(panelEl, { active: computed(() => open.value && !props.wide), onEscape: () => close(true) })

function toggle() {
  open.value = !open.value
}

function close(focusButton = false) {
  if (!open.value) return
  open.value = false
  if (focusButton) buttonEl.value?.focus()
}

// 換頁就收起來（點一則通知前往相關頁面也是換頁）；每次換頁也順便查未讀數（有間隔限制）
watch(
  () => route.fullPath,
  () => {
    close()
    void refreshUnreadNotifications()
  },
)

// 桌機的小面板才在這裡處理 Esc；手機底部彈窗的 Esc 交給 useDialogFocus（確認彈窗疊在上面時它只讓最上層處理）
function onKeydown(event: KeyboardEvent) {
  if (!open.value || !props.wide || event.key !== 'Escape' || confirmState.value) return
  event.stopPropagation()
  close(true)
}

function onPointerDown(event: PointerEvent) {
  if (!open.value || confirmState.value) return
  if (!rootEl.value?.contains(event.target as Node)) close()
}

watch(open, (value) => {
  if (value) {
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeydown, true)
  } else {
    document.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('keydown', onKeydown, true)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div ref="rootEl" class="sm:relative">
    <button
      ref="buttonEl"
      type="button"
      class="relative flex h-8 w-8 cursor-pointer items-center justify-center border-2 border-transparent text-ink-soft transition hover:border-tint/20 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
      :class="open ? 'border-tint/30 bg-tint/10 text-ink' : ''"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-label="unreadNotifications ? `通知（${unreadNotifications} 則未讀）` : '通知'"
      title="通知"
      @click="toggle"
    >
      <svg viewBox="0 0 16 16" class="h-5 w-5" aria-hidden="true" shape-rendering="crispEdges">
        <path d="M7 1h2v1h2v1h1v5h1v2h1v2H2v-2h1V8h1V3h1V2h2zM6 13h4v2H6z" fill="currentColor" />
      </svg>
      <span
        v-if="unreadNotifications"
        class="absolute -right-2 -top-2 min-w-[1.5em] rounded-full border-2 border-surface bg-danger-hue px-1 text-center text-caption font-semibold leading-tight tabular-nums text-surface"
        aria-hidden="true"
      >
        {{ badgeText(unreadNotifications) }}
      </span>
    </button>

    <!-- 手機：底部彈窗，背景壓暗；點背景關（背景在 rootEl 裡，點外面的判斷抓不到，所以自己接 click） -->
    <Transition enter-active-class="transition-opacity duration-200 motion-reduce:transition-none" enter-from-class="opacity-0" leave-active-class="transition-opacity duration-150 motion-reduce:transition-none" leave-to-class="opacity-0">
      <div v-if="open && !wide" class="fixed inset-0 z-40 bg-sink/50" aria-hidden="true" @click="close(true)" />
    </Transition>

    <Transition
      enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
      :enter-from-class="wide ? '-translate-y-1 opacity-0' : 'translate-y-4 opacity-0'"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      :leave-to-class="wide ? '-translate-y-1 opacity-0' : 'translate-y-4 opacity-0'"
    >
      <div
        v-if="open"
        ref="panelEl"
        role="dialog"
        :aria-modal="wide ? undefined : 'true'"
        aria-label="通知"
        class="z-50 flex flex-col border-frame bg-surface"
        :class="
          wide
            ? 'absolute right-0 top-[calc(100%+0.5rem)] max-h-[min(34rem,calc(100vh-6rem))] w-[24rem] border-2 shadow-[6px_6px_0_var(--c-shade)]'
            : 'fixed inset-x-0 bottom-0 max-h-[80vh] border-t-4 shadow-[0_-6px_0_var(--c-shade)]'
        "
      >
        <NotificationPanel :sheet="!wide" @close="close(true)" />
      </div>
    </Transition>
  </div>
</template>
