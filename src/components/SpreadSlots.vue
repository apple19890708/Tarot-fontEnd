<script setup lang="ts">
import { computed } from 'vue'

import { imageUrl } from '../lib/api'
import type { CardPose } from '../lib/motion'
import type { PositionLayout, SlotCard } from '../types'

// 牌陣的位置格：每個位置一格，抽到的牌落在上面。
// 自動抽牌與手動抽牌共用這個元件，飛牌動畫的終點也從這裡量。
const props = defineProps<{
  labels: string[]
  // 依位置排好的牌，還沒抽到的位置留 undefined
  cards: (SlotCard | undefined)[]
  // 正在飛過來的牌：飛行期間先不顯示，替身抵達後才出現
  hiddenIds?: Set<string>
  // 給了網格與每個位置的座標，就照牌陣的實際形狀排；否則排成一列
  grid?: { cols: number; rows: number }
  layouts?: (PositionLayout | undefined)[]
}>()

const isGrid = computed(
  () => Boolean(props.grid) && props.labels.every((_, index) => Boolean(props.layouts?.[index])),
)

// 網格模式：每欄最寬 4rem（sm 以上 4.25rem），放不下就整排一起等比縮小，不會撐出橫向捲軸
const gridStyle = computed(() =>
  isGrid.value && props.grid
    ? {
        gridTemplateColumns: `repeat(${props.grid.cols}, minmax(0, var(--slot-max)))`,
        gridTemplateRows: `repeat(${props.grid.rows}, auto)`,
      }
    : undefined,
)

function cellStyle(index: number) {
  const layout = props.layouts?.[index]
  return isGrid.value && layout ? { gridColumn: layout.col, gridRow: layout.row } : undefined
}

// v-for 裡的 ref 陣列不保證順序，依 index 放
const boxes: HTMLElement[] = []

function setBox(index: number, el: unknown) {
  if (el instanceof HTMLElement) {
    boxes[index] = el
  }
}

// 給飛牌動畫當終點：這一格目前在畫面上的中心與尺寸。旋轉由呼叫端決定（逆位要轉半圈）
function poseOf(index: number): CardPose | null {
  const box = boxes[index]
  if (!box) {
    return null
  }
  const rect = box.getBoundingClientRect()
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: box.offsetWidth,
    height: box.offsetHeight,
    rotation: 0,
  }
}

defineExpose({ poseOf })
</script>

<template>
  <!--
    一列模式：手機每格固定佔四分之一寬（扣掉 gap），張數再多都只會往下排、不會把版面撐開；
    sm 以上改回依內容決定寬度。每格尺寸固定：選牌前後高度不變，下方的按鈕才不會跟著跳。
    網格模式：照牌陣形狀擺，牌寬跟著欄寬縮放；只框牌位本身，外面不再包一層。
  -->
  <ul
    :class="
      isGrid
        ? 'grid w-full justify-center gap-1.5 [--slot-max:4rem] sm:gap-2.5 sm:[--slot-max:4.25rem]'
        : 'flex flex-wrap justify-center gap-1.5 sm:justify-start sm:gap-2'
    "
    :style="gridStyle"
  >
    <li
      v-for="(label, index) in labels"
      :key="label + index"
      class="flex min-w-0 flex-col items-center gap-0.5 text-center sm:gap-1"
      :class="
        isGrid
          ? ''
          : [
              'w-[calc(25%-0.3rem)] rounded-xl border px-1 py-1.5 sm:w-auto sm:min-w-[4.5rem] sm:rounded-2xl sm:px-2 sm:py-2',
              props.cards[index] ? 'border-amber-200/40 bg-amber-100/8' : 'border-dashed border-white/15 bg-black/10',
            ]
      "
      :style="cellStyle(index)"
    >
      <span class="w-full truncate text-[9px] text-stone-400 sm:text-[11px]">{{ index + 1 }}. {{ label }}</span>
      <!-- 佔位點與牌圖疊在同一個固定大小的框裡，替換時不會有兩個同時撐開版面 -->
      <span
        :ref="(el) => setBox(index, el)"
        class="relative"
        :class="[
          isGrid ? 'aspect-[2/3] w-full' : 'h-9 w-6 sm:h-12 sm:w-8',
          props.cards[index] && hiddenIds?.has(props.cards[index]!.id) ? 'invisible' : '',
        ]"
      >
        <span
          v-if="!props.cards[index]"
          class="absolute inset-0 flex items-center justify-center text-stone-600"
          :class="isGrid ? 'rounded-md border border-dashed border-white/20 bg-black/10 text-xs' : ''"
        >
          {{ isGrid ? index + 1 : '·' }}
        </span>
        <!-- 剛落下的牌淡入並放大一下，讓人看得出牌是飛到哪個位置 -->
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="opacity-0 scale-50"
          enter-to-class="opacity-100 scale-100"
        >
          <img
            v-if="props.cards[index] && imageUrl(props.cards[index]!.image)"
            :src="imageUrl(props.cards[index]!.image)"
            :alt="props.cards[index]!.nameZh"
            class="absolute inset-0 h-full w-full rounded object-cover"
            :class="{ 'rotate-180': props.cards[index]!.orientation === 'reversed' }"
          />
        </Transition>
      </span>
      <!-- 牌名與正逆位兩行，沒有牌時也先佔好高度 -->
      <span class="h-[1.4rem] w-full text-[9px] leading-tight text-stone-300 sm:h-[1.6rem] sm:text-[10px]">
        <template v-if="props.cards[index]">
          <span class="block truncate">{{ props.cards[index]!.nameZh }}</span>
          <span class="block text-stone-500">
            {{ props.cards[index]!.orientation === 'upright' ? '正位' : '逆位' }}
          </span>
        </template>
      </span>
    </li>
  </ul>
</template>
