<script setup lang="ts">
// 頂欄的「占卜」選單（v27，2026-11-25 使用者要求）：選塔羅（/）或雷諾曼（/lenormand）。
// 只有能用雷諾曼的人（admin 或開通 lenormandAccess）才會看到這個選單；其他人（含訪客）在 App 裡維持原本的單一「占卜」連結，
// 不會出現只有一個選項的選單。
// 操作照會員選單（MemberMenu）的作法：點外面、Esc、選了項目都會關；方向鍵上下、Home／End 移動；目前所在的那一項亮起
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

const ITEMS = [
  { name: 'home', path: '/', label: '塔羅' },
  { name: 'lenormand', path: '/lenormand', label: '雷諾曼' },
] as const

// 在塔羅或雷諾曼頁時，「占卜」本身也亮起（和其他頂欄連結一樣變琥珀色）
const inDivination = computed(() => ITEMS.some((item) => item.name === route.name))

function items() {
  return [...(panelEl.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    // 打開時把焦點放在目前所在的那一項，沒有就放第一項
    const list = items()
    ;(list.find((el) => el.getAttribute('aria-current') === 'page') ?? list[0])?.focus()
  }
}

function close(focusButton = false) {
  open.value = false
  if (focusButton) buttonEl.value?.focus()
}

// 換頁就收起來（點了選單裡的項目也是換頁；點目前這頁不會換頁，由 click 關）
watch(() => route.fullPath, () => close())

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.stopPropagation()
    close(true)
    return
  }
  const list = items()
  if (!list.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const index = list.indexOf(document.activeElement as HTMLElement)
  const next =
    event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : event.key === 'ArrowDown' ? (index + 1) % list.length : (index - 1 + list.length) % list.length
  list[next]?.focus()
}

function onPointerDown(event: PointerEvent) {
  if (open.value && !rootEl.value?.contains(event.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeydown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('keydown', onKeydown, true)
})

const ITEM = 'flex w-full items-center gap-2 px-4 py-2 text-left font-pixel text-[12px] transition hover:bg-tint/10 focus:bg-tint/10 focus:outline-none active:bg-tint/15'
</script>

<template>
  <div ref="rootEl" class="relative">
    <!-- 觸控目標至少 44px 高（2026-11-26 前端優化 10）；頂欄高度本來就超過 44px，版面不變 -->
    <!-- check-rules-ignore-next-line 頂欄的像素字和旁邊的連結一樣固定 12px，這次只改高度 -->
    <button
      ref="buttonEl"
      type="button"
      class="flex min-h-11 cursor-pointer items-center gap-1 border-2 border-transparent px-2 font-pixel text-[12px] transition hover:border-tint/20 active:translate-x-[1px] active:translate-y-[1px]"
      :class="[inDivination ? 'text-warn' : 'text-ink-soft hover:text-warn', open ? 'border-tint/30 bg-tint/10' : '']"
      aria-haspopup="menu"
      :aria-expanded="open"
      aria-controls="divination-menu"
      @click="toggle"
    >
      占卜
      <span class="text-caption transition motion-reduce:transition-none" :class="open ? 'rotate-180' : ''" aria-hidden="true">▾</span>
    </button>

    <Transition
      enter-active-class="transition duration-200 ease-out motion-reduce:transition-none"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-150 ease-in motion-reduce:transition-none"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="open"
        id="divination-menu"
        ref="panelEl"
        class="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-36 border-2 border-frame bg-surface py-1.5 shadow-[4px_4px_0_var(--c-shade)]"
        role="menu"
        aria-label="占卜"
      >
        <router-link
          v-for="item in ITEMS"
          :key="item.name"
          :to="item.path"
          role="menuitem"
          :class="[ITEM, route.name === item.name ? 'bg-selected text-on-selected' : 'text-ink-soft']"
          :aria-current="route.name === item.name ? 'page' : undefined"
          @click="close()"
        >
          {{ item.label }}
        </router-link>
      </div>
    </Transition>
  </div>
</template>
