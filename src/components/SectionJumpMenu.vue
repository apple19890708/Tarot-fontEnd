<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import type { SectionNavItem } from '../lib/sectionNav'
import CrystalBallIcon from './CrystalBallIcon.vue'

// 彈窗用的「跳到段落」：水晶球按鈕，打開才向 items() 要目前的段落（內容可能後來才出現）。
// 彈窗有自己的捲動區，全站右上角的浮動選單管不到，所以彈窗自己放一個（例如個股分析彈窗）
// floating：浮在內容右上角的樣式（深色方框＋像素陰影，和全站右上角的浮動選單一樣）；否則是放在標題列的小按鈕
const props = defineProps<{ items: () => SectionNavItem[]; floating?: boolean }>()

const open = ref(false)
const list = ref<SectionNavItem[]>([])
const rootEl = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    list.value = props.items()
    document.addEventListener('pointerdown', onOutside, true)
    document.addEventListener('keydown', onKeydown, true)
  } else {
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKeydown, true)
  }
})

function onOutside(event: PointerEvent) {
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) open.value = false
}

// Esc 只收起選單，不要讓彈窗也一起關掉
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.stopImmediatePropagation()
  open.value = false
  buttonEl.value?.focus()
}

function jump(item: SectionNavItem) {
  open.value = false
  item.go()
}

onBeforeUnmount(() => {
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <!-- 浮動時外面會給 absolute（它本身就能當選單的定位基準），不要再加 relative 打架 -->
  <div ref="rootEl" :class="floating ? '' : 'relative'">
    <button
      ref="buttonEl"
      type="button"
      class="flex cursor-pointer items-center justify-center border-2 transition active:translate-x-[2px] active:translate-y-[2px]"
      :class="[
        floating
          ? 'h-11 w-11 border-[#3b2618] bg-[#0f1526] shadow-[3px_3px_0_rgba(0,0,0,0.5)] active:shadow-none'
          : 'h-9 w-9 border-white/10 hover:bg-white/10',
        open ? 'text-amber-200' : 'text-violet-200/80 hover:text-amber-200',
      ]"
      :aria-expanded="open"
      aria-label="跳到段落"
      title="跳到段落"
      @click="open = !open"
    >
      <CrystalBallIcon :class="floating ? 'h-7 w-7' : 'h-6 w-6'" :sparkle="open" />
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full z-10 mt-2 max-h-[60vh] w-56 overflow-y-auto border-2 border-[#3b2618] bg-[#0f1526] p-3 shadow-[4px_4px_0_rgba(0,0,0,0.5)]"
    >
      <p class="text-caption text-amber-100/70">跳到段落</p>
      <ul v-if="list.length" class="mt-2 space-y-0.5">
        <li v-for="(item, index) in list" :key="`${index}-${item.label}`">
          <button
            type="button"
            class="w-full cursor-pointer px-2 py-1 text-left transition hover:bg-white/10 hover:text-amber-100"
            :class="item.level === 2 ? 'pl-5 text-caption text-stone-300' : 'text-body text-stone-100'"
            @click="jump(item)"
          >
            <span v-if="item.level === 2" class="mr-1 text-stone-300" aria-hidden="true">·</span>{{ item.label }}
          </button>
        </li>
      </ul>
      <p v-else class="mt-2 text-body text-stone-300">內容還在載入。</p>
    </div>
  </div>
</template>
