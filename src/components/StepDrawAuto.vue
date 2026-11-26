<script setup lang="ts">
// 抽牌步驟的「自動抽牌」（2026-11-26 前端優化 9，從 StepDraw 拆出來）：
// 按下之後要等後端回傳才知道抽到什麼，所以先洗牌佔住這段等待；
// 結果回來後再一張一張從牌堆飛到牌陣位置上翻開，看起來像是當場發牌。
// 切去別的抽牌方式時這個元件會卸載，切回來從頭開始
import { gsap } from 'gsap'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import SpreadSlots from './SpreadSlots.vue'
import { motionDuration, prefersReducedMotion, type CardPose } from '../lib/motion'
import { slotPose, useCardFlights } from '../lib/useCardFlights'
import type { AutoDealResult, SlotCard, SpreadShape } from '../types'

const props = defineProps<{
  spread: SpreadShape | null
  targetCount: number
  positionLabels: string[]
  hasOrientation: boolean
  isLoading: boolean
  // 自動抽牌的結果。拿到之後才知道抽到什麼，動畫才有牌可以發；跑完通知外層進結果頁
  autoResult: AutoDealResult | null
}>()

const emit = defineEmits<{
  autoDraw: []
  autoDealDone: []
}>()

const { landingIds, launch } = useCardFlights()

const autoSlotsRef = ref<InstanceType<typeof SpreadSlots> | null>(null)

type AutoPhase = 'idle' | 'shuffling' | 'dealing' | 'done'

const autoPhase = ref<AutoPhase>('idle')
const autoDeckEl = ref<HTMLElement | null>(null)
// 已經發到位置上的牌；飛行途中就先放進來，位置格會等替身抵達才顯示
const autoLanded = ref<(SlotCard | undefined)[]>([])

let autoShuffle: gsap.core.Timeline | null = null

function stopAutoShuffle() {
  autoShuffle?.kill()
  autoShuffle = null
  // 牌堆一直掛在畫面上，停在擺動到一半的角度會看起來歪掉，收回正中
  const el = autoDeckEl.value
  if (el) {
    gsap.to(el, { x: 0, y: 0, rotation: 0, duration: motionDuration(0.2), ease: 'steps(5)', overwrite: 'auto' })
  }
}

// 還沒按「抽牌」時，牌堆緩緩上下浮動、微微擺頭，讓人知道這疊牌在等著被抽
function startAutoIdle() {
  autoShuffle?.kill()
  autoShuffle = null
  const el = autoDeckEl.value
  if (!el || prefersReducedMotion()) {
    return
  }
  autoShuffle = gsap
    .timeline({ repeat: -1, yoyo: true })
    .to(el, { y: -8, rotation: 2, duration: 1.6, ease: 'steps(8)' })
    .to(el, { y: 0, rotation: -2, duration: 1.6, ease: 'steps(8)' })
}

watch([autoDeckEl, autoPhase], ([el, phase]) => {
  if (el && phase === 'idle') {
    startAutoIdle()
  }
})

function startAutoShuffle() {
  stopAutoShuffle()
  const el = autoDeckEl.value
  if (!el || prefersReducedMotion()) {
    return
  }
  // 左右擺動並微微傾斜，表示牌還在洗
  autoShuffle = gsap
    .timeline({ repeat: -1, yoyo: true })
    .to(el, { x: -7, rotation: -4, duration: 0.26, ease: 'steps(5)' })
    .to(el, { x: 7, rotation: 4, duration: 0.52, ease: 'steps(5)' })
}

function autoDeckPose(): CardPose | null {
  const el = autoDeckEl.value
  if (!el) {
    return null
  }
  const rect = el.getBoundingClientRect()
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: el.offsetWidth,
    height: el.offsetHeight,
    rotation: 0,
  }
}

function delay(seconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, motionDuration(seconds) * 1000))
}

function onAutoDraw() {
  if (autoPhase.value !== 'idle') {
    return
  }
  autoLanded.value = []
  autoPhase.value = 'shuffling'
  emit('autoDraw')
  void nextTick(startAutoShuffle)
}

async function runAutoDeal(result: AutoDealResult) {
  stopAutoShuffle()
  autoPhase.value = 'dealing'
  // 等位置格畫出來才量得到終點
  await nextTick()

  const cards: SlotCard[] = result.cards.map((entry, index) => ({
    // 同一次占卜不會有重複的牌，但位置才是這裡的身分，所以把 index 一起帶上
    id: `${entry.card.id}-${index}`,
    nameZh: entry.card.nameZh,
    image: entry.card.image ?? '',
    orientation: entry.orientation ?? 'upright',
  }))

  for (const [index, card] of cards.entries()) {
    launch(card, autoDeckPose(), slotPose(autoSlotsRef.value, index, card, 0), true)
    // 量不到位置時 launch 會略過動畫，這裡照樣把牌放上去，不要卡住流程
    autoLanded.value = cards.slice(0, index + 1)
    await delay(0.17)
  }
  // 最後一張飛完再停一下，讓人看清楚整個牌陣
  await delay(0.9)
  finishAutoDeal()
}

function finishAutoDeal() {
  autoPhase.value = 'done'
  emit('autoDealDone')
}

function resetAuto() {
  stopAutoShuffle()
  autoPhase.value = 'idle'
  autoLanded.value = []
}

watch(
  () => props.autoResult,
  (result) => {
    if (!result || autoPhase.value === 'dealing' || autoPhase.value === 'done') {
      return
    }
    if (prefersReducedMotion()) {
      finishAutoDeal()
      return
    }
    void runAutoDeal(result)
  },
)

// 抽牌失敗：沒有結果、也不在載入中，就把牌堆收起來讓使用者再按一次
watch(
  () => props.isLoading,
  (loading) => {
    if (!loading && autoPhase.value === 'shuffling' && !props.autoResult) {
      resetAuto()
    }
  },
)

onBeforeUnmount(stopAutoShuffle)
</script>

<template>
  <!--
    牌堆、牌陣空位、按鈕從一開始就排好：按下後牌堆洗牌等後端回應，
    結果回來再一張一張飛到牌陣位置上翻開。各階段版面不變，畫面不會跳。
  -->
  <div class="flex flex-1 flex-col space-y-4">
    <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
    <p class="border-2 border-tint/10 bg-tint/5 px-4 py-3 text-sm leading-7 text-ink-soft">
      由系統抽出 {{ targetCount }} 張牌{{ hasOrientation ? '並決定正逆位' : '' }}，直接填入{{ spread?.name }}的各個位置。
    </p>

    <div class="flex flex-1 flex-col justify-center space-y-4 sm:space-y-5">
      <div class="flex h-24 items-center justify-center sm:h-[7.5rem]">
        <div ref="autoDeckEl" class="relative h-[4.5rem] w-12">
          <!-- 等待抽牌時牌堆後面一圈淡淡的光暈，跟著呼吸明暗 -->
          <span
            v-if="autoPhase === 'idle'"
            class="absolute -inset-3 animate-pulse bg-accent-hue/15 motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span
            v-for="layer in 3"
            :key="layer"
            class="absolute inset-0 border-2 border-accent-hue/20 [background-image:var(--pixel-card-back)] [background-size:100%_100%] [image-rendering:pixelated]"
            :style="{ transform: `translateY(${(3 - layer) * 2}px)` }"
          />
          <span
            class="relative flex h-full w-full items-center justify-center border-2 border-accent-hue/30 [background-image:var(--pixel-card-back)] [background-size:100%_100%] [image-rendering:pixelated] shadow-lg shadow-black/50"
          >
            <!-- check-rules-ignore-next-line 從 StepDraw 原樣搬過來（優化 9 拆檔），樣式沒動，避免塔羅畫面跟著變 -->
            <span class="text-[13px] leading-none text-warn/50">✦</span>
          </span>
        </div>
      </div>

      <SpreadSlots
        ref="autoSlotsRef"
        :labels="positionLabels"
        :cards="autoLanded"
        :hidden-ids="landingIds"
        :show-orientation="hasOrientation"
        :grid="spread?.grid"
        :layouts="spread?.positions.map((position) => position.layout)"
      />
    </div>

    <!-- 按下後按鈕留在原地改顯示進度，版面高度不變 -->
    <button
      class="w-full cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 py-3 text-[14px] font-medium text-accent transition hover:bg-accent-hue/25 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
      type="button"
      :disabled="isLoading || autoPhase !== 'idle'"
      aria-live="polite"
      @click="onAutoDraw"
    >
      {{ autoPhase === 'idle' ? '抽牌' : autoPhase === 'shuffling' ? '洗牌中…' : '正在把牌放上牌陣' }}
    </button>
  </div>
</template>
