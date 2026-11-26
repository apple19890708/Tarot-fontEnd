<script setup lang="ts">
// 點牌放大（2026-11-26 使用者要求）：結果頁的排列圖點一張牌，滿版放大這張牌。
// - 牌放到畫面裝得下的最大尺寸、保持 7:12 比例；先顯示正面（原圖，逆位倒過來）
// - 點牌就翻面（3D 翻轉），背面是這個位置代表什麼；再點一次翻回正面。減少動態效果時直接切換，不做動畫
// - 點空白處或按 Esc 關閉，焦點回到原本點的那張牌（useDialogFocus）；開著時背景不能捲動（useScrollLock）
// 塔羅與雷諾曼的排列圖（SpreadLayout）共用，紀錄頁、日記頁也是同一個元件
import { ref } from 'vue'

import { CARD_IMAGE_HEIGHT, CARD_IMAGE_WIDTH } from '../lib/cardStyle'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useScrollLock } from '../lib/useScrollLock'

const props = defineProps<{
  // 牌面原圖的網址（不是縮圖）；空字串表示沒有圖，改顯示牌名
  image: string
  name: string
  reversed: boolean
  // 背面：位置名稱與這個位置代表什麼
  label: string
  prompt: string
  // 一打開就是背面（例如排列圖上這張已經翻到背面）
  startFlipped?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const flipped = ref(Boolean(props.startFlipped))
const failed = ref(false)
const panelEl = ref<HTMLElement | null>(null)
const cardEl = ref<HTMLButtonElement | null>(null)

useScrollLock()
useDialogFocus(panelEl, { initialFocus: cardEl, onEscape: () => emit('close') })
</script>

<template>
  <Teleport to="body">
    <!--
      背景固定是深色半透明（不跟日夜模式變淡）：放大看牌要讓牌面最突出，白天模式的淡遮罩會讓牌看起來灰。
      點背景（不是牌）就關閉
    -->
    <div
      ref="panelEl"
      class="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-8"
      style="background: rgb(0 0 0 / 0.82)"
      role="dialog"
      aria-modal="true"
      :aria-label="`${label}：${name}`"
      @click.self="emit('close')"
    >
      <div class="flex max-h-full flex-col items-center gap-3" @click.self="emit('close')">
        <!-- 牌：寬高取「畫面寬」與「畫面高扣掉下面一行字」比較小的那個，保持 7:12 -->
        <button
          ref="cardEl"
          type="button"
          class="relative block cursor-pointer [perspective:1600px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-hue"
          style="width: min(calc(100vw - 2rem), calc((100dvh - 6rem) * 7 / 12), 32rem); aspect-ratio: 7 / 12"
          :aria-pressed="flipped"
          :aria-label="flipped ? `${label}的含意，點一下翻回正面` : `${name}，點一下翻到背面看這個位置代表什麼`"
          @click="flipped = !flipped"
        >
          <span
            class="relative block h-full w-full transition-transform duration-700 ease-out [transform-style:preserve-3d] motion-reduce:transition-none"
            :class="flipped ? '[transform:rotateY(180deg)]' : ''"
          >
            <!-- 正面：原圖，逆位倒過來 -->
            <span class="absolute inset-0 overflow-hidden border-2 border-tint/20 bg-surface shadow-[8px_8px_0_var(--c-shade)] [backface-visibility:hidden]">
              <img
                v-if="image && !failed"
                :src="image"
                :width="CARD_IMAGE_WIDTH" :height="CARD_IMAGE_HEIGHT"
                :alt="name"
                class="h-full w-full object-cover"
                :class="{ 'rotate-180': reversed }"
                decoding="async"
                @error="failed = true"
              />
              <span v-else class="flex h-full w-full items-center justify-center p-4 text-center text-title text-ink">{{ name }}</span>
            </span>
            <!-- 背面：位置名稱與含意 -->
            <span
              class="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto border-2 border-accent-hue/50 bg-surface p-6 text-center shadow-[8px_8px_0_var(--c-shade)] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            >
              <span class="text-title font-semibold text-accent">{{ label }}</span>
              <span class="text-body text-ink-soft">{{ prompt }}</span>
              <span class="mt-2 text-caption text-ink-muted">{{ name }}</span>
            </span>
          </span>
        </button>
        <p class="pointer-events-none text-center text-caption text-ink-soft on-scene">
          點牌翻面・點空白處或按 Esc 關閉
        </p>
      </div>
    </div>
  </Teleport>
</template>
