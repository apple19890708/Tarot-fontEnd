<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import type { DeckCard } from '../types'

// 攤成扇形的牌背。使用者看不到是什麼牌，點了才翻到牌陣上。
const props = defineProps<{
  deck: DeckCard[]
  // 還能不能再選（選滿牌陣張數就停）
  canPick: boolean
}>()

const emit = defineEmits<{ pick: [index: number] }>()

// 扇形展開的總角度。半徑由 --fan-r 控制，在不同斷點給不同值（見 template）
const FAN_ANGLE = 116

// 發牌動畫：從中央疊成一落，再逐張轉開成扇形
const DEAL_STEP_MS = 10

// 每張牌的角度：平均分布在 ±(FAN_ANGLE / 2) 之間
const angles = computed(() => {
  const count = props.deck.length
  if (count <= 1) {
    return [0]
  }
  const step = FAN_ANGLE / (count - 1)
  return props.deck.map((_, index) => -FAN_ANGLE / 2 + step * index)
})

// false 時所有牌疊在中央，切成 true 才轉開；重新洗牌會再播一次
const dealt = ref(false)
const hoverIndex = ref<number | null>(null)

async function playDeal() {
  dealt.value = false
  hoverIndex.value = null
  // 先讓瀏覽器畫出疊牌的狀態，下一幀再轉開，否則不會有過渡
  await nextTick()
  requestAnimationFrame(() => {
    dealt.value = true
  })
}

onMounted(playDeal)

// 重新洗牌時牌堆整個換掉（長度相同但內容不同），用第一張的 id 當作換牌的訊號
watch(
  () => [props.deck.length, props.deck[0]?.id].join(':'),
  () => {
    if (props.deck.length > 0) {
      playDeal()
    }
  },
)

function onEnter(index: number) {
  if (props.canPick && !props.deck[index]?.picked) {
    hoverIndex.value = index
  }
}

function onLeave(index: number) {
  if (hoverIndex.value === index) {
    hoverIndex.value = null
  }
}

// 按鈕本身只負責扇形定位，發牌完成後就固定不動——它同時是滑鼠的命中區。
// 牌與牌重疊得很密，如果讓命中區跟著 hover 一起位移或放大，游標會在
// 「牌移開 → 離開 → 牌歸位 → 又進入」之間來回彈跳，所以抬起與放大一律做在內層牌面上。
function cardStyle(index: number) {
  const base = angles.value[index] ?? 0

  return {
    transform: dealt.value
      ? `translateX(-50%) rotate(${base}deg)`
      : // 還沒發牌：全部疊在中央、略為下沉
        'translateX(-50%) rotate(0deg) translateY(26px) scale(0.92)',
    // 發牌時依序出現；發完就取消延遲
    transitionDelay: dealt.value ? '0ms' : `${index * DEAL_STEP_MS}ms`,
    opacity: dealt.value ? undefined : 0,
    zIndex: hoverIndex.value === index ? 60 : index,
  }
}

function onPick(index: number) {
  if (!props.canPick || props.deck[index]?.picked) {
    return
  }
  hoverIndex.value = null
  emit('pick', index)
}
</script>

<template>
  <!--
    扇形排列：每張牌的 transform-origin 設在卡片下方 --fan-r 的位置，
    旋轉時就會沿著弧線擺開。半徑越大、弧越平；手機半徑小，牌會疊得比較密。
  -->
  <div
    class="relative mx-auto w-full select-none [--fan-r:190px] sm:[--fan-r:260px] lg:[--fan-r:330px]"
    :class="'h-[180px] sm:h-[240px] lg:h-[300px]'"
    @mouseleave="hoverIndex = null"
  >
    <button
      v-for="(card, index) in deck"
      :key="card.id"
      type="button"
      class="absolute left-1/2 top-2 w-[38px] origin-[50%_var(--fan-r)] transition-[transform,opacity] duration-300 ease-out focus:outline-none motion-reduce:transition-none sm:w-[50px] lg:w-[62px]"
      :class="[
        card.picked ? 'pointer-events-none' : canPick ? 'cursor-pointer' : 'cursor-not-allowed',
        // 發牌動畫期間不接受滑鼠，免得牌還在飛就被判定成 hover
        dealt ? '' : 'pointer-events-none',
      ]"
      :style="cardStyle(index)"
      :aria-label="card.picked ? `第 ${index + 1} 張，已選取` : `選第 ${index + 1} 張牌`"
      :disabled="card.picked || !canPick"
      @mouseenter="onEnter(index)"
      @mouseleave="onLeave(index)"
      @focus="onEnter(index)"
      @blur="onLeave(index)"
      @click="onPick(index)"
    >
      <!-- 牌背：不顯示牌名也不顯示正逆位。被指到時抬起、放大，邊框與花紋一起亮起來。
           這一層不接受滑鼠事件，hover 的判定永遠落在上層固定不動的按鈕上。 -->
      <span
        class="pointer-events-none flex aspect-[2/3] items-center justify-center rounded-md border bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 shadow-lg shadow-black/50 transition duration-300 ease-out motion-reduce:transition-none"
        :class="[
          card.picked ? 'border-white/10 opacity-25 scale-90' : 'border-amber-200/25',
          hoverIndex === index
            ? '-translate-y-5 scale-110 border-amber-200/70 shadow-xl shadow-amber-200/20 ring-2 ring-amber-200/40'
            : '',
        ]"
      >
        <span
          class="text-[13px] leading-none transition duration-300 motion-reduce:transition-none"
          :class="hoverIndex === index ? 'scale-125 text-amber-200/90' : 'text-amber-200/35'"
        >
          ✦
        </span>
      </span>
    </button>
  </div>
</template>
