<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// 「我的紀錄」左欄清單的外框（塔羅、股票分析、財經新聞分析共用，長相與行為一致）：
// - 桌機：黏在畫面左邊，可收合成窄欄（收合狀態記在 localStorage，各分頁分開記）
// - 手機：平常隱藏，打開時從左邊滑入滿版；打開時背景不能捲動；選了一筆由父元件關掉（v-model:open）
// 清單內容放在預設 slot（通常是 RecordIndex）
const props = defineProps<{
  // 標題（例如「紀錄清單」「分析清單」）
  label: string
  // 總筆數（收合時直排顯示）
  count: number
  // 收合狀態記在 localStorage 的 key
  collapseKey: string
}>()
const open = defineModel<boolean>('open', { default: false })

const desktopQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 64rem)') : null
const isDesktop = ref(desktopQuery?.matches ?? true)
const isCollapsed = ref(readCollapsed())
const showRail = computed(() => isDesktop.value && isCollapsed.value)

// 無痕視窗或封鎖儲存時 localStorage 會丟例外，當成沒有偏好（展開）
function readCollapsed() {
  try {
    return localStorage.getItem(props.collapseKey) === '1'
  } catch {
    return false
  }
}

function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
  try {
    localStorage.setItem(props.collapseKey, isCollapsed.value ? '1' : '0')
  } catch {
    // 存不了只是下次不記得，不影響功能
  }
}

function onDesktopChange(event: MediaQueryListEvent) {
  isDesktop.value = event.matches
  if (event.matches) open.value = false
}

// 手機清單滿版時，背後的頁面不要跟著捲
watch(
  () => open.value && !isDesktop.value,
  (locked) => document.body.classList.toggle('overflow-hidden', locked),
)

onMounted(() => desktopQuery?.addEventListener('change', onDesktopChange))
onBeforeUnmount(() => {
  desktopQuery?.removeEventListener('change', onDesktopChange)
  document.body.classList.remove('overflow-hidden')
})
</script>

<template>
  <!--
    收合時寬度用 transition 縮放（右欄是 flex-1，會跟著平順變寬），內容則先淡出再換成窄欄；
    展開的內容固定寬度，縮放途中被裁掉而不是擠成一團。
    手機一直掛著，關閉時移到畫面左外側並隱藏，打開時從左邊滑入；lg 以上的 class 把這些全部蓋回來
  -->
  <aside
    class="fixed inset-0 z-40 flex flex-col bg-surface p-5 lg:border-4 lg:border-r-0 lg:border-frame transition-[translate,opacity,visibility] duration-300 ease-out motion-reduce:transition-none lg:sticky lg:inset-auto lg:top-5 lg:z-auto lg:visible lg:max-h-[calc(100vh-2.5rem)] lg:shrink-0 lg:translate-x-0 lg:overflow-hidden lg:shadow-[6px_6px_0_var(--c-shade)] lg:opacity-100 lg:backdrop-blur-none lg:transition-[width,padding] lg:pointer-events-auto"
    :class="[
      open ? 'visible translate-x-0 opacity-100' : 'pointer-events-none invisible -translate-x-full opacity-0',
      showRail ? 'lg:w-14 lg:p-2' : 'lg:w-72 lg:py-4 lg:pl-2 lg:pr-0',
    ]"
    :aria-label="label"
  >
    <Transition
      mode="out-in"
      enter-active-class="transition-opacity duration-150 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div v-if="showRail" key="rail" class="flex flex-col items-center">
        <button
          type="button"
          class="cursor-pointer border-2 border-tint/30 px-1.5 py-0.5 font-pixel text-button text-cream/85 transition hover:border-accent-hue/60 hover:text-warn active:translate-x-[2px] active:translate-y-[2px]"
          :title="`展開${label}`"
          :aria-label="`展開${label}`"
          @click="toggleCollapsed"
        >
          »
        </button>
        <span class="mt-3 text-caption text-cream/85 [writing-mode:vertical-rl]">共 {{ count }} 筆</span>
      </div>

      <!-- 寬度＝展開時 w-72 扣掉左邊框與 pl-2（右側不留，標籤才貼得到菜單），收合途中內容不會重新排版 -->
      <div v-else key="panel" class="flex min-h-0 flex-1 flex-col lg:w-[17.25rem]">
        <div class="mb-4 flex items-center justify-between gap-3 lg:pr-3">
          <p class="font-pixel text-[12px] tracking-[0.2em] text-warn">{{ label }}</p>
          <button
            type="button"
            class="hidden cursor-pointer border-2 border-tint/30 px-2 py-0.5 font-pixel text-button text-cream/85 transition hover:border-accent-hue/60 hover:text-warn active:translate-x-[2px] active:translate-y-[2px] lg:block"
            @click="toggleCollapsed"
          >
            « 收合
          </button>
          <button
            type="button"
            class="cursor-pointer border-2 border-tint/30 px-2 py-0.5 font-pixel text-button text-cream/85 transition hover:border-accent-hue/60 hover:text-warn active:translate-x-[2px] active:translate-y-[2px] lg:hidden"
            @click="open = false"
          >
            關閉
          </button>
        </div>
        <slot />
      </div>
    </Transition>
  </aside>
</template>
