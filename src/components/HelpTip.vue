<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

import { MARKET_GLOSSARY, type GlossaryKey } from '../lib/marketGlossary'

// 圓圈小「?」：點一下（桌機滑鼠移上去也會）跳出名詞說明，再點一下、點外面或按 Esc 關閉。
// term：單一名詞；terms：一次說明好幾個（例如一整排判讀標籤）；
// entry：不在名詞表裡、由後端給的說明（例如每個策略的白話解釋），和 term／terms 一起給時排在最前面
const props = defineProps<{ term?: GlossaryKey; terms?: GlossaryKey[]; entry?: { title: string; body: string } }>()
// 元件有兩個根（按鈕＋傳送到 body 的說明框），外面給的 class 只套在按鈕上
defineOptions({ inheritAttrs: false })

const entries = computed(() => {
  const keys = props.terms?.length ? props.terms : props.term ? [props.term] : []
  const fromGlossary = keys.map((key) => MARKET_GLOSSARY[key])
  return props.entry?.body ? [props.entry, ...fromGlossary] : fromGlossary
})
const label = computed(() => `說明：${entries.value.map((e) => e.title).join('、')}`)

const open = ref(false)
// 點擊打開的會固定住；滑鼠移上去打開的，移開就關
const pinned = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLDivElement | null>(null)
const position = ref({ top: 0, left: 0 })

const PANEL_WIDTH = 288
const GAP = 6

// 用 fixed 定位放在按鈕下方（下方空間不夠就放上方），左右不超出畫面
async function place() {
  await nextTick()
  const rect = button.value?.getBoundingClientRect()
  if (!rect) return
  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16)
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
  const height = panel.value?.offsetHeight ?? 0
  const below = rect.bottom + GAP
  const top = below + height > window.innerHeight - 8 && rect.top - GAP - height > 8 ? rect.top - GAP - height : below
  position.value = { top, left }
}

function show(byClick: boolean) {
  if (byClick) pinned.value = true
  if (open.value) return
  open.value = true
  void place()
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', follow)
}

function hide() {
  open.value = false
  pinned.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', follow)
}

// 頁面捲動、視窗大小改變（手機網址列收合也會觸發）時跟著「?」重新定位，不關閉；
// 「?」整個捲出畫面才關。說明框自己裡面的捲動不理會
function follow() {
  const rect = button.value?.getBoundingClientRect()
  if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
    hide()
    return
  }
  void place()
}
function onScroll(event: Event) {
  if (event.target instanceof Node && panel.value?.contains(event.target)) return
  follow()
}

function toggle() {
  if (open.value && pinned.value) hide()
  else show(true)
}

function onOutside(event: PointerEvent) {
  const target = event.target as Node | null
  if (target && (button.value?.contains(target) || panel.value?.contains(target))) return
  hide()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    hide()
    button.value?.focus()
  }
}

// 只有滑鼠（不含觸控）才用移上去顯示；觸控裝置點一下就好
// 從「?」移到說明框之間有一點空隙：離開後稍等一下再關，移進說明框就取消
let leaveTimer: ReturnType<typeof setTimeout> | null = null
function onEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  if (leaveTimer) clearTimeout(leaveTimer)
  leaveTimer = null
  show(false)
}
function onLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || pinned.value) return
  leaveTimer = setTimeout(() => {
    leaveTimer = null
    if (!pinned.value) hide()
  }, 150)
}

onBeforeUnmount(() => {
  if (leaveTimer) clearTimeout(leaveTimer)
  hide()
})
</script>

<template>
  <!-- 沒有可以說明的名詞就不顯示 -->
  <button
    v-if="entries.length"
    v-bind="$attrs"
    ref="button"
    type="button"
    class="inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-ink-muted/60 align-middle text-[10px] leading-none text-ink-muted transition hover:border-accent-hue/70 hover:text-accent"
    :aria-label="label"
    :aria-expanded="open"
    @click.stop="toggle"
    @pointerenter="onEnter"
    @pointerleave="onLeave"
  >
    ?
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      role="tooltip"
      class="fixed z-[70] max-h-[60vh] overflow-y-auto border-2 border-frame bg-surface p-3 text-left shadow-[4px_4px_0_var(--c-shade)]"
      :style="{ top: `${position.top}px`, left: `${position.left}px`, width: `${PANEL_WIDTH}px`, maxWidth: 'calc(100vw - 16px)' }"
      @pointerenter="onEnter"
      @pointerleave="onLeave"
    >
      <div v-for="entry in entries" :key="entry.title" class="space-y-1 [&+&]:mt-3 [&+&]:border-t [&+&]:border-tint/10 [&+&]:pt-3">
        <p class="text-body font-semibold text-accent">{{ entry.title }}</p>
        <p class="whitespace-pre-line text-body text-ink-muted">{{ entry.body }}</p>
      </div>
    </div>
  </Teleport>
</template>
