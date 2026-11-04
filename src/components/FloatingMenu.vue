<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { cardStyle, setCardStyle, type CardStyle } from '../lib/cardStyle'
import { sectionNav, type SectionNavItem } from '../lib/sectionNav'

// 浮在畫面右上的選單：像素水晶球按鈕，打開後可以換牌面風格；
// 在結果頁時多一區「跳到段落」，內容很長時用來快速移動。

const open = ref(false)
const items = ref<SectionNavItem[]>([])
const rootEl = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)
const route = useRoute()

const STYLE_OPTIONS: { value: CardStyle; label: string }[] = [
  { value: 'original', label: '原版' },
  { value: 'pixel', label: '像素' },
]

// 每次打開都重新收集：AI 解讀可能是後來才出現的
function refreshItems() {
  items.value = sectionNav.value?.items() ?? []
}

watch(open, (isOpen) => {
  if (isOpen) refreshItems()
})
// 打開著的時候換到別的結果（例如紀錄頁點另一筆），清單跟著換
watch(sectionNav, () => {
  if (open.value) refreshItems()
})
watch(
  () => route.fullPath,
  () => (open.value = false),
)

function jump(item: SectionNavItem) {
  open.value = false
  item.go()
}

// 點選單外面、或按 Esc 就收起來；Esc 時把焦點還給按鈕，鍵盤使用者不會迷路
function onPointerDown(event: PointerEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(event.target as Node)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    buttonEl.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- z-20 低於手機導覽選單（z-30），選單展開時會蓋過它；位置沿用原本的牌面開關 -->
  <div ref="rootEl" class="fixed right-4 top-20 z-20 md:right-8">
    <button
      ref="buttonEl"
      type="button"
      class="flex h-11 w-11 cursor-pointer items-center justify-center border-2 border-[#3b2618] bg-[#0f1526] shadow-[3px_3px_0_rgba(0,0,0,0.5)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      :class="open ? 'text-amber-200' : 'text-violet-200/80 hover:text-amber-200'"
      :aria-expanded="open"
      aria-controls="floating-menu"
      aria-label="選單"
      title="選單"
      @click="open = !open"
    >
      <!--
        12×12 的像素水晶球：球身用 currentColor（打開時變琥珀色），左上一塊高光、
        木頭底座；打開時旁邊冒出兩顆星星。crispEdges 讓邊緣不被柔化
      -->
      <svg viewBox="0 0 12 12" class="h-7 w-7" shape-rendering="crispEdges" aria-hidden="true">
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
        <g v-if="open" fill="#fde68a">
          <rect x="11" y="0" width="1" height="1" />
          <rect x="0" y="3" width="1" height="1" />
        </g>
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-200 [transition-timing-function:steps(4)] motion-reduce:transition-none"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 [transition-timing-function:steps(3)] motion-reduce:transition-none"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="open"
        id="floating-menu"
        class="absolute right-0 top-full mt-2 max-h-[calc(100dvh-8rem)] w-60 overflow-y-auto border-2 border-[#3b2618] bg-[#0f1526] p-3 shadow-[4px_4px_0_rgba(0,0,0,0.5)]"
      >
        <!-- 牌面風格：所有畫面的牌面一起換，選擇記在這台瀏覽器 -->
        <section>
          <p class="text-xs text-amber-100/70">牌面風格</p>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <button
              v-for="option in STYLE_OPTIONS"
              :key="option.value"
              type="button"
              class="cursor-pointer border-2 px-2 py-1 text-sm transition active:translate-x-[2px] active:translate-y-[2px]"
              :class="
                cardStyle === option.value
                  ? 'border-amber-200/60 bg-amber-200/15 text-amber-50'
                  : 'border-white/15 text-stone-300 hover:bg-white/10'
              "
              :aria-pressed="cardStyle === option.value"
              @click="setCardStyle(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <!-- 只有結果頁會登記段落，其他頁面這區不出現 -->
        <nav v-if="items.length > 0" aria-label="跳到段落" class="mt-3 border-t-2 border-white/10 pt-3">
          <p class="text-xs text-amber-100/70">跳到段落</p>
          <ul class="mt-2 space-y-0.5">
            <li v-for="(item, index) in items" :key="`${index}-${item.label}`">
              <button
                type="button"
                class="w-full cursor-pointer px-2 py-1 text-left transition hover:bg-white/10 hover:text-amber-100"
                :class="item.level === 2 ? 'pl-5 text-xs text-stone-300/80' : 'text-sm text-stone-100'"
                @click="jump(item)"
              >
                <span v-if="item.level === 2" class="mr-1 text-stone-500" aria-hidden="true">·</span>{{ item.label }}
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </Transition>
  </div>
</template>
