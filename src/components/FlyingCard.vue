<script setup lang="ts">
import { gsap } from 'gsap'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import type { CardPose } from '../lib/motion'

// 抽牌時在畫面最上層飛行的替身牌：從 from 飛到 to，途中翻面。
// 外層的卡片有 backdrop-blur，fixed 定位會被困在那張卡片裡，所以掛到 body 底下。
const props = defineProps<{
  image: string
  alt: string
  from: CardPose
  to: CardPose
  // true：牌背翻成牌面（抽出）；false：牌面翻回牌背（收回）
  reveal: boolean
}>()

const emit = defineEmits<{ done: [] }>()

const rootEl = ref<HTMLElement | null>(null)
const innerEl = ref<HTMLElement | null>(null)

let ctx: gsap.Context | null = null

onMounted(() => {
  const root = rootEl.value
  const inner = innerEl.value
  if (!root || !inner) {
    emit('done')
    return
  }
  const { from, to } = props
  ctx = gsap.context(() => {
    gsap.set(root, { x: from.cx - from.width / 2, y: from.cy - from.height / 2, rotation: from.rotation })
    gsap.set(inner, { rotationY: props.reveal ? 0 : 180 })

    gsap
      .timeline({ onComplete: () => emit('done') })
      // 先從牌堆裡抽起來，再飛向目的地
      .to(root, { y: `-=${props.reveal ? 28 : 12}`, scale: 1.15, duration: 0.16, ease: 'power2.out' })
      .to(root, {
        x: to.cx - from.width / 2,
        y: to.cy - from.height / 2,
        rotation: to.rotation,
        scale: to.width / from.width,
        duration: 0.55,
        ease: 'power3.inOut',
      })
      .to(inner, { rotationY: props.reveal ? 180 : 0, duration: 0.55, ease: 'power2.inOut' }, '<')
  })
})

onBeforeUnmount(() => {
  ctx?.revert()
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootEl"
      class="pointer-events-none fixed left-0 top-0 z-50 perspective-[800px]"
      :style="{ width: `${from.width}px`, height: `${from.height}px` }"
      aria-hidden="true"
    >
      <div ref="innerEl" class="relative h-full w-full transform-3d">
        <!-- 牌背：和扇形裡的牌背同一套樣式 -->
        <span
          class="absolute inset-0 flex items-center justify-center rounded-md border border-amber-200/40 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 shadow-xl shadow-black/50 backface-hidden"
        >
          <span class="text-[13px] leading-none text-amber-200/60">✦</span>
        </span>
        <!-- 牌面：預先轉 180° 藏在背面，翻過來時才看得到 -->
        <img
          v-if="image"
          :src="image"
          :alt="alt"
          class="absolute inset-0 h-full w-full rounded-md object-cover shadow-xl shadow-black/50 rotate-y-180 backface-hidden"
        />
        <span
          v-else
          class="absolute inset-0 flex items-center justify-center rounded-md border border-amber-200/40 bg-slate-900 px-1 text-center text-[10px] text-amber-50 rotate-y-180 backface-hidden"
        >
          {{ alt }}
        </span>
      </div>
    </div>
  </Teleport>
</template>
