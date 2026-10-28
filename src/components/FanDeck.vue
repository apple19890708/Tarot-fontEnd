<script setup lang="ts">
import { gsap } from 'gsap'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { motionDuration, prefersReducedMotion, type CardPose } from '../lib/motion'
import type { DeckCard, FanPhase } from '../types'

// 攤成扇形的牌背。使用者看不到是什麼牌，點了才翻到牌陣上。
// 流程：洗牌（代表牌交錯插入）→ 切成兩或三落讓使用者選一落 → 只把那一落發成扇形 → 選牌。
// 牌的順序與正逆位都由外層決定，這裡只決定「顯示哪一落」；對外發出的 index 一律是 deck 裡的位置。
const props = defineProps<{
  deck: DeckCard[]
  // 還能不能再選（選滿牌陣張數就停）
  canPick: boolean
  // 正在飛回扇形的牌（收回時）：飛行期間先藏起來，抵達後再出現
  hiddenIds?: Set<string>
  // 切成幾落（2 或 3），由外層依牌陣決定
  pileCount: 2 | 3
}>()

// phase：階段改變時通知外層（例如切牌結束前先不顯示位置格）
const emit = defineEmits<{ pick: [index: number]; phase: [value: FanPhase] }>()

// 扇形展開的總角度。半徑由 --fan-r 控制，在不同斷點給不同值（見 template）
const FAN_ANGLE = 116

// 指到的牌抬起的高度與放大倍率；左右鄰牌依距離遞減抬起並往兩旁讓開
const LIFT_PX = 26
const HOVER_SCALE = 1.12
const NEIGHBOR_RANGE = 3
const NEIGHBOR_PUSH_PX = 6

// 洗牌只用少量代表牌示意；78 張一起動容易卡頓，也看不出動作
const PROXY_COUNT = 10
// 各落牌的水平位置（相對扇形寬度，0 為正中央）
const pileOffsets = computed(() => (props.pileCount === 2 ? [-0.2, 0.2] : [-0.28, 0, 0.28]))

const phase = ref<FanPhase>('shuffling')
watch(phase, (value) => emit('phase', value), { immediate: true })
const pile = ref<number | null>(null)

// 每一落的張數：三落各 26 張、兩落各 39 張；張數多的牌陣切兩落，攤開時選擇比較多
const pileSize = computed(() => Math.ceil(props.deck.length / pileOffsets.value.length))

// 目前攤開的牌在 deck 裡的位置
const visible = computed(() => {
  if (pile.value === null) {
    return []
  }
  const start = pile.value * pileSize.value
  const end = Math.min(props.deck.length, start + pileSize.value)
  return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset)
})

// 每張攤開的牌的角度：平均分布在 ±(FAN_ANGLE / 2) 之間
const angles = computed(() => {
  const count = visible.value.length
  if (count <= 1) {
    return [0]
  }
  const step = FAN_ANGLE / (count - 1)
  return visible.value.map((_, position) => -FAN_ANGLE / 2 + step * position)
})

const fanEl = ref<HTMLElement | null>(null)
// 外層負責扇形定位（只在發牌時動），內層牌面負責抬起與讓位。
// v-for 裡的 ref 陣列不保證順序，角度換算靠位置，所以用函式 ref 依位置放
const slotEls: HTMLElement[] = []
const faceEls: HTMLElement[] = []
const proxyEls: HTMLElement[] = []
const pileEls: HTMLElement[] = []

function setEl(list: HTMLElement[], index: number, el: unknown) {
  if (el instanceof HTMLElement) {
    list[index] = el
  }
}

// 指到的牌（攤開牌裡的位置，不是 deck index）
const hoverIndex = ref<number | null>(null)
// 手機沒有 hover：點第一下只抬起預覽，記在這裡；再點同一張才抽出
const armedIndex = ref<number | null>(null)
let lastPointerType = 'mouse'

let ctx: gsap.Context | null = null
let activeTimeline: gsap.core.Timeline | null = null

function runTimeline(build: (tl: gsap.core.Timeline) => void, onComplete: () => void) {
  activeTimeline?.kill()
  if (!ctx) {
    onComplete()
    return
  }
  ctx.add(() => {
    const tl = gsap.timeline({ onComplete })
    build(tl)
    activeTimeline = tl
  })
}

function resetPointer() {
  hoverIndex.value = null
  armedIndex.value = null
}

// 代表牌疊成整齊一落的狀態（洗牌每一輪的起點，也是切牌前收攏的終點）
const stackedState = {
  x: 0,
  y: (i: number) => -i * 0.6,
  rotation: 0,
  zIndex: (i: number) => i,
}

// ---- 一、洗牌：代表牌分成兩疊、交錯插回，一直循環到使用者按「切牌」 ----
async function startShuffle() {
  resetPointer()
  pile.value = null
  phase.value = 'shuffling'
  await nextTick()

  const fan = fanEl.value
  const proxies = proxyEls.slice(0, PROXY_COUNT)
  if (!fan || proxies.length === 0) {
    return
  }
  const spread = Math.min(80, fan.clientWidth * 0.16)
  const half = Math.ceil(proxies.length / 2)
  const left = proxies.slice(0, half)
  const right = proxies.slice(half)
  // 交錯插入的順序：左、右、左、右…
  const riffle = left.flatMap((card, i) => (right[i] ? [card, right[i]] : [card]))

  // 減少動態效果：不循環播放（時間為 0 的動畫無限重播會卡住），只擺一落牌等使用者按按鈕
  if (prefersReducedMotion()) {
    activeTimeline?.kill()
    ctx?.add(() => gsap.set(proxies, { xPercent: -50, yPercent: -50, opacity: 1, ...stackedState }))
    return
  }

  runTimeline(
    (tl) => {
      tl.repeat(-1).repeatDelay(0.25)
      tl.set(proxies, { xPercent: -50, yPercent: -50, opacity: 1, ...stackedState })
      // 分成左右兩疊
      tl.to(left, { x: -spread, rotation: -10, duration: 0.28, ease: 'power2.out' }, 0)
      tl.to(right, { x: spread, rotation: 10, duration: 0.28, ease: 'power2.out' }, 0)
      // 一張一張交錯插回中間
      riffle.forEach((card, order) => {
        tl.to(
          card,
          { x: 0, rotation: 0, y: -order * 0.6, zIndex: 20 + order, duration: 0.14, ease: 'power1.in' },
          0.34 + order * 0.055,
        )
      })
      // 敲齊，回到下一輪的起點
      tl.to(proxies, { ...stackedState, duration: 0.14 }, '+=0.05')
    },
    () => {},
  )
}

// ---- 二、切牌：收攏後切成兩或三落，等使用者選一落 ----
function startCut() {
  if (phase.value !== 'shuffling') {
    return
  }
  const fan = fanEl.value
  const proxies = proxyEls.slice(0, PROXY_COUNT)
  if (!fan || proxies.length === 0) {
    phase.value = 'cutting'
    return
  }
  const width = fan.clientWidth
  const t = motionDuration
  phase.value = 'splitting'
  runTimeline(
    (tl) => {
      // 洗牌可能停在一半，先收攏敲齊
      tl.to(proxies, { ...stackedState, duration: t(0.2), ease: 'power2.out' })
      // 所有代表牌同時往各自那一落移動
      tl.to(proxies, {
        x: (i: number) => {
          const group = Math.min(pileOffsets.value.length - 1, Math.floor((i * pileOffsets.value.length) / proxies.length))
          return (pileOffsets.value[group] ?? 0) * width
        },
        duration: t(0.4),
        ease: 'power2.inOut',
      })
    },
    () => {
      phase.value = 'cutting'
    },
  )
}

// ---- 三、選一落：其他兩落淡出，選中的那落滑到中央 ----
function choosePile(index: number) {
  if (phase.value !== 'cutting') {
    return
  }
  const fan = fanEl.value
  const chosen = pileEls[index]
  const others = pileEls.filter((_, i) => i !== index)
  const t = motionDuration
  runTimeline(
    (tl) => {
      tl.to(others, { opacity: 0, scale: 0.9, duration: t(0.22) }, 0)
      if (chosen && fan) {
        tl.to(chosen, { x: -(pileOffsets.value[index] ?? 0) * fan.clientWidth, duration: t(0.3), ease: 'power2.inOut' }, 0)
      }
    },
    () => {
      pile.value = index
      startDeal()
    },
  )
}

// ---- 四、發牌：從中央那一落逐張轉開成扇形 ----
async function startDeal() {
  resetPointer()
  phase.value = 'dealing'
  await nextTick()

  const fan = fanEl.value
  const slots = slotEls.slice(0, visible.value.length)
  const first = slots[0]
  if (!fan || !first) {
    phase.value = 'ready'
    return
  }
  // 起點對齊切牌時那一落的位置（扇形區的垂直中央），看起來是同一落牌被攤開
  const startY = fan.clientHeight / 2 - first.offsetHeight / 2 - first.offsetTop
  const t = motionDuration
  runTimeline(
    (tl) => {
      tl.set(faceEls.slice(0, slots.length), { x: 0, y: 0, scale: 1 })
      tl.fromTo(
        slots,
        { xPercent: -50, rotation: 0, y: startY, opacity: (i: number) => (i < 4 ? 1 : 0) },
        {
          xPercent: -50,
          rotation: (i: number) => angles.value[i] ?? 0,
          y: 0,
          opacity: 1,
          duration: t(0.5),
          ease: 'power2.out',
          stagger: t(0.02),
        },
      )
    },
    () => {
      phase.value = 'ready'
    },
  )
}

// 進來時已經有選過的牌（例如切到別的模式再切回來）：直接攤開那張牌所在的那一落，不用再切一次
function start() {
  const pickedIndex = props.deck.findIndex((card) => card.picked)
  if (pickedIndex >= 0) {
    pile.value = Math.floor(pickedIndex / pileSize.value)
    startDeal()
  } else if (props.deck.length > 0) {
    startShuffle()
  }
}

onMounted(() => {
  ctx = gsap.context(() => {}, fanEl.value ?? undefined)
  start()
})

onBeforeUnmount(() => {
  activeTimeline?.kill()
  ctx?.revert()
  ctx = null
})

// 重新洗牌時牌堆整個換掉（長度相同但內容不同），用第一張的 id 當作換牌的訊號
watch(
  () => [props.deck.length, props.deck[0]?.id].join(':'),
  () => {
    if (props.deck.length > 0) {
      startShuffle()
    }
  },
)

// ---- 指到哪張牌：用游標相對扇形圓心的角度換算 ----
// 牌與牌只差幾度，讓每張牌各自偵測 hover 會在相鄰兩張之間來回跳；
// 改成整個扇形只有一個命中層，用角度算出最近的那張，換牌時只會平順地往左右移動。
function fanRadius() {
  const el = fanEl.value
  if (!el) {
    return 0
  }
  return Number.parseFloat(getComputedStyle(el).getPropertyValue('--fan-r')) || 0
}

function indexFromPointer(clientX: number, clientY: number): number | null {
  const el = fanEl.value
  const first = slotEls[0]
  const count = visible.value.length
  if (!el || !first || count === 0) {
    return null
  }
  const rect = el.getBoundingClientRect()
  const radius = fanRadius()
  // 圓心：扇形水平中央、牌頂往下 --fan-r 的位置（牌的 transform-origin）
  const cx = rect.left + rect.width / 2
  const cy = rect.top + first.offsetTop + radius
  const dx = clientX - cx
  const dy = clientY - cy
  const distance = Math.hypot(dx, dy)
  const cardHeight = first.offsetHeight
  // 只在牌所在的環帶上才算指到。
  // 被指到的牌會沿自己的軸向往外移 LIFT_PX 再放大，牌頂會跑到 radius + LIFT_PX 之外，
  // 外緣要連那一段一起算進來，否則點在抬起那張牌的上半部會被當成沒點到牌。
  const outerEdge = radius + LIFT_PX + (cardHeight * (HOVER_SCALE - 1)) / 2
  if (distance < radius - cardHeight || distance > outerEdge) {
    return null
  }
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
  // 半張牌寬在這個半徑上對應的角度（越靠近圓心，同樣的寬度角度越大）
  const halfWidth = (Math.atan(first.offsetWidth / 2 / distance) * 180) / Math.PI
  const firstEdge = (angles.value[0] ?? 0) - halfWidth
  const lastEdge = (angles.value[count - 1] ?? 0) + halfWidth
  if (angle < firstEdge || angle > lastEdge) {
    return null
  }
  if (count === 1) {
    return 0
  }
  // 後面的牌疊在前面的牌上，每張露出來的是「自己的左緣到下一張的左緣」那一條，
  // 不是以牌的中心為準；最上面那張完整露出，所以超過範圍的都算它
  const step = FAN_ANGLE / (count - 1)
  return Math.min(count - 1, Math.floor((angle - firstEdge) / step))
}

// 依目前指到的牌，更新附近牌面的抬起與讓位；只動受影響的那幾張
function applyHover(next: number | null, previous: number | null) {
  const affected = new Set<number>()
  for (const center of [next, previous]) {
    if (center === null) {
      continue
    }
    for (let i = center - NEIGHBOR_RANGE - 1; i <= center + NEIGHBOR_RANGE + 1; i += 1) {
      if (i >= 0 && i < visible.value.length) {
        affected.add(i)
      }
    }
  }
  affected.forEach((position) => {
    const face = faceEls[position]
    if (!face) {
      return
    }
    let y = 0
    let x = 0
    let scale = 1
    if (next !== null) {
      const distance = Math.abs(position - next)
      if (distance === 0) {
        y = -LIFT_PX
        scale = HOVER_SCALE
      } else if (distance <= NEIGHBOR_RANGE) {
        const weight = (NEIGHBOR_RANGE + 1 - distance) / (NEIGHBOR_RANGE + 1)
        y = -LIFT_PX * 0.45 * weight
        x = Math.sign(position - next) * NEIGHBOR_PUSH_PX * weight * 2
      }
    }
    gsap.to(face, { x, y, scale, duration: motionDuration(0.22), ease: 'power2.out', overwrite: 'auto' })
  })
}

watch(hoverIndex, (next, previous) => applyHover(next, previous ?? null))

function cardAt(position: number) {
  const deckIndex = visible.value[position]
  return deckIndex === undefined ? undefined : props.deck[deckIndex]
}

function isPickable(position: number) {
  const card = cardAt(position)
  return props.canPick && phase.value === 'ready' && Boolean(card) && !card?.picked
}

function onPointerMove(event: PointerEvent) {
  // 觸控沒有 hover，抬起交給點擊處理
  if (phase.value !== 'ready' || event.pointerType !== 'mouse') {
    return
  }
  hoverIndex.value = indexFromPointer(event.clientX, event.clientY)
}

function onPointerDown(event: PointerEvent) {
  lastPointerType = event.pointerType
}

function onPointerLeave(event: PointerEvent) {
  // 觸控放開手指也會觸發 leave，那時要保留預覽中的牌
  if (event.pointerType === 'mouse') {
    hoverIndex.value = null
  }
}

// 點到的是不是「目前抬起的那張牌」。牌與牌只差幾度，用角度換算時手指差幾個 px 就會算成隔壁張；
// 抬起的牌已經放大並浮在最上層，看起來就是一張獨立的牌，所以改用它實際的範圍判斷。
function hitsArmedCard(clientX: number, clientY: number) {
  const face = armedIndex.value === null ? null : faceEls[armedIndex.value]
  if (!face) {
    return false
  }
  const rect = face.getBoundingClientRect()
  const pad = 10
  return (
    clientX >= rect.left - pad && clientX <= rect.right + pad && clientY >= rect.top - pad && clientY <= rect.bottom + pad
  )
}

function onClick(event: MouseEvent) {
  if (phase.value !== 'ready') {
    return
  }
  const position = indexFromPointer(event.clientX, event.clientY)

  if (lastPointerType === 'mouse') {
    if (position === null) {
      resetPointer()
    } else if (isPickable(position)) {
      pick(position)
    }
    return
  }

  // 觸控：第一下抬起預覽，第二下才抽出。
  // 已經有牌抬起時，點在它身上、點到它、或點在牌堆外的空白處都當成確認，
  // 只有明確點到別張才改預覽那張；抬起的牌凸出扇形、又和鄰牌只差幾度，
  // 要求第二下再精準命中同一張的話，最外側那幾張幾乎按不出來。
  const armed = armedIndex.value
  if (armed !== null) {
    if (position === null || position === armed || hitsArmedCard(event.clientX, event.clientY)) {
      if (isPickable(armed)) {
        pick(armed)
      } else {
        resetPointer()
      }
      return
    }
  } else if (position === null) {
    resetPointer()
    return
  }

  // 點到別張：改成預覽那一張
  armedIndex.value = position
  hoverIndex.value = position
}

function pick(position: number) {
  const deckIndex = visible.value[position]
  resetPointer()
  if (deckIndex !== undefined) {
    emit('pick', deckIndex)
  }
}

// 鍵盤：左右鍵換牌、Enter／空白鍵選取
function onKeydown(event: KeyboardEvent) {
  if (phase.value !== 'ready' || visible.value.length === 0) {
    return
  }
  const last = visible.value.length - 1
  const current = hoverIndex.value ?? Math.floor(last / 2)
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? -1 : 1
    hoverIndex.value = hoverIndex.value === null ? current : Math.min(last, Math.max(0, current + delta))
  } else if ((event.key === 'Enter' || event.key === ' ') && hoverIndex.value !== null) {
    event.preventDefault()
    if (isPickable(hoverIndex.value)) {
      pick(hoverIndex.value)
    }
  }
}

// 給飛牌動畫當起點／終點：牌面目前在畫面上的中心、尺寸與角度（參數是 deck index）
function cardPose(deckIndex: number): CardPose | null {
  const position = visible.value.indexOf(deckIndex)
  const face = faceEls[position]
  if (position < 0 || !face) {
    return null
  }
  const rect = face.getBoundingClientRect()
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    width: face.offsetWidth,
    height: face.offsetHeight,
    rotation: angles.value[position] ?? 0,
  }
}

// cut：「切牌」按鈕放在扇形區外面（由外層排版），按下後呼叫這個
defineExpose({ cardPose, cut: startCut })

const hintText = computed(() => {
  if (phase.value === 'cutting') {
    return '選一落牌'
  }
  if (phase.value === 'ready' && armedIndex.value !== null && isPickable(armedIndex.value)) {
    return '再點一次抽出這張'
  }
  return ''
})

const statusText = computed(() => {
  if (hoverIndex.value === null) {
    return hintText.value
  }
  return cardAt(hoverIndex.value)?.picked ? `第 ${hoverIndex.value + 1} 張，已選取` : `第 ${hoverIndex.value + 1} 張`
})
</script>

<template>
  <!--
    扇形排列：每張牌的 transform-origin 設在卡片下方 --fan-r 的位置，
    旋轉時就會沿著弧線擺開。半徑越大、弧越平；手機半徑小，牌會疊得比較密。
    整個扇形是唯一的命中層，牌本身不接受滑鼠事件。
  -->
  <div
    ref="fanEl"
    class="relative mx-auto h-[200px] w-full touch-manipulation select-none outline-none [--fan-r:190px] focus-visible:ring-2 focus-visible:ring-amber-200/30 sm:h-[240px] sm:[--fan-r:260px] lg:h-[300px] lg:[--fan-r:330px]"
    :class="hoverIndex !== null && isPickable(hoverIndex) ? 'cursor-pointer' : ''"
    role="group"
    aria-label="牌堆：用左右鍵選牌，Enter 抽出"
    tabindex="0"
    @pointermove="onPointerMove"
    @pointerdown="onPointerDown"
    @pointerleave="onPointerLeave"
    @click="onClick"
    @keydown="onKeydown"
    @blur="resetPointer"
  >
    <!-- 洗牌與切開時用的代表牌 -->
    <template v-if="phase === 'shuffling' || phase === 'splitting'">
      <span
        v-for="n in PROXY_COUNT"
        :key="`proxy-${n}`"
        :ref="(el) => setEl(proxyEls, n - 1, el)"
        class="pointer-events-none absolute left-1/2 top-1/2 flex aspect-[2/3] w-[38px] items-center justify-center rounded-md border border-amber-200/25 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 opacity-0 shadow-lg shadow-black/50 sm:w-[50px] lg:w-[62px]"
      >
        <span class="text-[13px] leading-none text-amber-200/35">✦</span>
      </span>
    </template>

    <!-- 切牌：兩或三落牌，位置與洗牌最後切開的位置相同，看起來是同一批牌 -->
    <template v-else-if="phase === 'cutting'">
      <button
        v-for="(offset, index) in pileOffsets"
        :key="`pile-${index}`"
        :ref="(el) => setEl(pileEls, index, el)"
        type="button"
        class="group absolute top-1/2 w-[38px] -translate-x-1/2 -translate-y-1/2 cursor-pointer sm:w-[50px] lg:w-[62px]"
        :style="{ left: `${50 + offset * 100}%` }"
        :aria-label="`第 ${index + 1} 落`"
        @click.stop="choosePile(index)"
      >
        <span
          v-for="layer in 3"
          :key="layer"
          class="absolute inset-0 rounded-md border border-amber-200/20 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950"
          :style="{ transform: `translateY(${(3 - layer) * 2}px)` }"
        />
        <span
          class="relative flex aspect-[2/3] items-center justify-center rounded-md border border-amber-200/30 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 shadow-lg shadow-black/50 transition group-hover:-translate-y-2 group-hover:border-amber-200/70 group-hover:shadow-amber-200/20 group-focus-visible:-translate-y-2 group-focus-visible:border-amber-200/70"
        >
          <span class="text-[13px] leading-none text-amber-200/50 group-hover:text-amber-200/90">✦</span>
        </span>
      </button>
    </template>

    <!-- 選中的那一落攤成扇形。手機的牌往下留一段（top-7）：被指到的牌會抬起，太貼著上緣會蓋到上面那排按鈕 -->
    <template v-else>
      <div
        v-for="(deckIndex, position) in visible"
        :key="deck[deckIndex]?.id ?? deckIndex"
        :ref="(el) => setEl(slotEls, position, el)"
        class="pointer-events-none absolute left-1/2 top-7 w-[38px] origin-[50%_var(--fan-r)] opacity-0 sm:top-2 sm:w-[50px] lg:w-[62px]"
        :style="{ zIndex: hoverIndex === position ? visible.length + 1 : position }"
      >
        <!-- 牌背：不顯示牌名也不顯示正逆位。位移與縮放交給 GSAP，這裡只處理顏色的過渡 -->
        <span
          :ref="(el) => setEl(faceEls, position, el)"
          class="flex aspect-[2/3] items-center justify-center rounded-md border bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 shadow-lg shadow-black/50 transition-[border-color,box-shadow,opacity] duration-300 motion-reduce:transition-none"
          :class="[
            deck[deckIndex]?.picked ? 'border-white/10 opacity-25' : 'border-amber-200/25',
            deck[deckIndex] && hiddenIds?.has(deck[deckIndex].id) ? 'opacity-0' : '',
            hoverIndex === position && !deck[deckIndex]?.picked
              ? 'border-amber-200/70 shadow-xl shadow-amber-200/20 ring-2 ring-amber-200/40'
              : '',
          ]"
        >
          <span
            class="text-[13px] leading-none transition-colors duration-300 motion-reduce:transition-none"
            :class="hoverIndex === position && !deck[deckIndex]?.picked ? 'text-amber-200/90' : 'text-amber-200/35'"
          >
            ✦
          </span>
        </span>
      </div>
    </template>


    <p
      v-if="hintText"
      class="pointer-events-none absolute inset-x-0 bottom-1 text-center text-xs tracking-[0.2em] text-amber-100/70"
    >
      {{ hintText }}
    </p>
    <p class="sr-only" aria-live="polite">{{ statusText }}</p>
  </div>
</template>
