<script setup lang="ts">
import { computed, reactive, watch } from 'vue'

import { imageUrl } from '../lib/api'
import type { ReadingCard, Spread } from '../types'

// 畫出牌陣的實際排列。cards 省略時為預覽（空格＋位置名稱），帶入時填上實際抽到的牌。
const props = defineProps<{
  spread: Spread
  cards?: ReadingCard[]
}>()

// 已翻到背面的位置。背面顯示這個位置代表什麼，取代原本列在下方的說明。
// 只用點擊切換：滑過就翻會讓整排牌跟著游標亂翻。
const flippedKeys = reactive(new Set<string>())

// 圖片載入失敗的位置，改顯示牌名而不是破圖（OneDrive 雲端檔案偶爾會讀取失敗）
const failedImages = reactive(new Set<string>())

function toggleFlip(key: string) {
  if (flippedKeys.has(key)) {
    flippedKeys.delete(key)
  } else {
    flippedKeys.add(key)
  }
}

const allFlipped = computed(() => props.spread.positions.every((position) => flippedKeys.has(position.key)))

function toggleAll() {
  if (allFlipped.value) {
    flippedKeys.clear()
    return
  }
  props.spread.positions.forEach((position) => flippedKeys.add(position.key))
}

// 換牌陣或重抽時全部翻回正面，否則會留著上一個牌陣的 key
watch(
  () => [props.spread.key, props.cards],
  () => flippedKeys.clear(),
)

const grid = computed(() => props.spread.grid ?? { cols: props.spread.cardCount, rows: 1 })

// 沒有 layout 的牌陣（舊版後端）退回單排橫列
const slots = computed(() =>
  props.spread.positions.map((position, index) => ({
    index,
    position,
    layout: position.layout ?? { col: index + 1, row: 1 },
    card: props.cards?.[index] ?? null,
  })),
)

function orientationLabel(card: ReadingCard | null) {
  if (!card) {
    return ''
  }
  return card.orientation === 'upright' ? '正位' : '逆位'
}
</script>

<template>
  <div class="space-y-3">
    <!--
      牌寬跟著容器縮放（手機最寬 4rem、sm 以上 5rem），盡量一排放得下不用橫向捲動；
      縮到 2.75rem 還放不下時才捲動。justify-center-safe 讓溢出時從左邊開始，不會把左側切掉
    -->
    <div class="-mx-1 overflow-x-auto px-1 pb-1">
      <div
        class="grid w-full justify-center-safe gap-1.5 [--slot-max:4rem] sm:gap-3 sm:[--slot-max:5rem]"
        :style="{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(2.75rem, var(--slot-max)))`,
          gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        }"
      >
        <div
          v-for="slot in slots"
          :key="slot.position.key"
          class="relative"
          :style="{ gridColumn: slot.layout.col, gridRow: slot.layout.row }"
        >
          <button
            type="button"
            class="group block w-full cursor-pointer text-left [perspective:600px]"
            :aria-pressed="flippedKeys.has(slot.position.key)"
            :aria-label="`${slot.position.label}：${slot.position.prompt}`"
            @click="toggleFlip(slot.position.key)"
          >
            <!-- 翻面容器：正反面各自絕對定位疊在一起，整個容器繞 Y 軸轉 -->
            <span
              class="relative block aspect-[2/3] transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none"
              :class="flippedKeys.has(slot.position.key) ? '[transform:rotateY(180deg)]' : ''"
            >
              <!-- 正面：有抽到牌就顯示圖，否則是空格 -->
              <span
                class="absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-white/5 transition-colors [backface-visibility:hidden] group-hover:border-white/25"
              >
                <img
                  v-if="slot.card && imageUrl(slot.card.card.image) && !failedImages.has(slot.position.key)"
                  :src="imageUrl(slot.card.card.image)"
                  :alt="slot.card.card.nameZh"
                  class="h-full w-full object-cover"
                  :class="{ 'rotate-180': slot.card.orientation === 'reversed' }"
                  @error="failedImages.add(slot.position.key)"
                />
                <!-- 圖載不出來時顯示牌名，不要留一個破圖 -->
                <span v-else-if="slot.card" class="px-1 text-center text-[11px] leading-tight text-stone-300">
                  {{ slot.card.card.nameZh }}
                </span>
                <span v-else class="text-lg font-semibold text-stone-500">{{ slot.index + 1 }}</span>
              </span>

              <!-- 背面：這個位置代表什麼。字級隨斷點縮放，最長的 17 字在各尺寸都放得下 -->
              <span
                class="absolute inset-0 flex flex-col justify-center gap-0.5 overflow-hidden rounded-lg border border-amber-200/40 bg-amber-100/8 px-1.5 py-1 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]"
              >
                <span class="font-medium text-amber-100 text-[10px] leading-tight sm:text-[11px] lg:text-xs">
                  {{ slot.position.label }}
                </span>
                <span
                  class="break-words text-stone-200/85 text-[9px] leading-[1.15] sm:text-[10px] sm:leading-tight lg:text-[11px] lg:leading-snug"
                >
                  {{ slot.position.prompt }}
                </span>
              </span>
            </span>

            <span
              class="mt-1 block truncate text-center text-[11px] leading-tight"
              :class="flippedKeys.has(slot.position.key) ? 'text-amber-100' : 'text-stone-400'"
            >
              <template v-if="slot.card">
                {{ slot.card.card.nameZh }}
                <span class="block text-[10px] text-stone-500">{{ orientationLabel(slot.card) }}</span>
              </template>
              <template v-else>{{ slot.index + 1 }}. {{ slot.position.label }}</template>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- 位置說明已經移到卡背，這裡只留操作提示與一次翻完的捷徑 -->
    <div class="flex items-center justify-between gap-3 text-xs text-stone-400">
      <span>點一下牌，翻到背面看這個位置代表什麼。</span>
      <button
        type="button"
        class="shrink-0 rounded-full border border-white/15 px-3 py-1 transition hover:border-amber-200/50 hover:text-amber-100"
        @click="toggleAll"
      >
        {{ allFlipped ? '全部翻回正面' : '全部翻面' }}
      </button>
    </div>
  </div>
</template>
