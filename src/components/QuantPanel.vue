<script setup lang="ts">
import {
  Chart as ChartJS,
  Filler,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
} from 'chart.js'
import { computed } from 'vue'
import { Radar } from 'vue-chartjs'

import { CHART_COLORS } from '../lib/chartPalette'

import type { AnalysisQuant, QuantDimension, QuantLevel, QuantLevels, ReadingCard } from '../types'

// 只註冊雷達圖需要的模組，其餘不註冊以利 tree-shaking
ChartJS.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip)

const props = defineProps<{
  quant: AnalysisQuant
  cards: ReadingCard[]
}>()

// 必須和後端 ruleConfig.js 的 DIMENSION_LABELS 一致，quant.text 會用同一組詞。
// 後端刻意不用「情感／思維」：那是花色的領域名，混用會讀成自相矛盾。
const DIMENSION_LABELS: Record<QuantDimension, string> = {
  action: '行動',
  emotion: '感受',
  logic: '想法',
  material: '現實',
}

const DIMENSION_ORDER: QuantDimension[] = ['action', 'emotion', 'logic', 'material']

const DIRECTION_STYLES: Record<string, string> = {
  strongPositive: 'border-down-hue/40 bg-down-hue/15 text-down-ink',
  positive: 'border-down-hue/30 bg-down-hue/10 text-down-ink',
  neutral: 'border-tint/15 bg-tint/5 text-ink-soft',
  negative: 'border-danger-hue/30 bg-danger-hue/10 text-danger',
  strongNegative: 'border-danger-hue/40 bg-danger-hue/15 text-danger',
}

// DI 介於 -100~100，換算成 0~100% 的指針位置。數字本身不顯示給使用者
const pointerPercent = computed(() => ((props.quant.di + 100) / 2).toFixed(1))

const radarData = computed(() => ({
  labels: DIMENSION_ORDER.map((key) => DIMENSION_LABELS[key]),
  datasets: [
    {
      label: '能量分布',
      data: DIMENSION_ORDER.map((key) => props.quant.energy[key]),
      backgroundColor: CHART_COLORS.radarFill,
      borderColor: CHART_COLORS.radar,
      pointBackgroundColor: CHART_COLORS.radar,
      pointBorderColor: CHART_COLORS.radarPointBorder,
      borderWidth: 2,
    },
  ],
}))

// 座標軸要貼合實際值域。energy 實務上落在 0～0.3，寫死 max: 1 會讓四個點
// 永遠擠在圓心，看起來像「每個面向都很弱」，與文字描述對不起來。
const radarMax = computed(() => {
  const peak = Math.max(...DIMENSION_ORDER.map((key) => props.quant.energy[key] ?? 0))
  // 留 30% 餘裕，並設下限避免全為 0 時整張圖塌掉
  return Math.max(0.2, Math.ceil(peak * 1.3 * 20) / 20)
})

const radarOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    r: {
      min: 0,
      max: radarMax.value,
      angleLines: { color: CHART_COLORS.grid },
      grid: { color: CHART_COLORS.grid },
      pointLabels: { color: CHART_COLORS.text, font: { size: 12 } },
      ticks: { display: false, stepSize: radarMax.value / 4 },
    },
  },
}))

// 傾向條的三格等級。
// 原本叫「使不使得上力」「推進順不順」，兩個名稱聽起來像在問同一件事，
// 而且名稱是問句、數值是答句，看的人要自己對起來。改成名詞＋一行說明。
// tone 決定格子顏色：阻力格數多是壞事，不能和推力用同一個顏色，否則看不出多是好是壞。
type Meter = {
  name: string
  hint: string
  level: QuantLevel
  labels: [string, string, string]
  tone: 'good' | 'bad' | 'neutral'
}

const METER_FILL: Record<Meter['tone'], string> = {
  good: 'bg-down-hue/70',
  bad: 'bg-up-hue/70',
  neutral: 'bg-accent-hue/80',
}

// 焦點集中度不放在這裡，改成雷達圖下方的說明：它描述的就是雷達圖的形狀，
// 分開放會出現「圖看起來很集中、格子卻寫普通」的落差。
const meters = computed<Meter[]>(() => [
  {
    name: '推力',
    hint: '站在你這邊的力量有多少',
    level: levelOf('momentum', props.quant.momentum),
    labels: ['幾乎沒有', '有一些', '相當充足'],
    tone: 'good',
  },
  {
    name: '阻力',
    hint: '卡住你的力量有多少',
    level: levelOf('resistance', props.quant.resistance),
    labels: ['很小', '有一些', '相當大'],
    tone: 'bad',
  },
  {
    name: '可信度',
    hint: '牌面訊號越雜，越只能當參考',
    level: levelOf('confidence', props.quant.confidence),
    labels: ['偏低', '普通', '高'],
    tone: 'neutral',
  },
])

// 分級門檻由後端依實際分布決定（quant.levels），前端不自己定。
// 只有舊版後端沒回傳 levels 時，才退回舊的固定門檻。
function levelOf(key: keyof QuantLevels, value: number): QuantLevel {
  const fromServer = props.quant.levels?.[key]
  if (fromServer) return fromServer
  if (value >= 0.5) return 3
  if (value >= 0.3) return 2
  return 1
}

// 雷達圖的主軸：取能量最高的面向，第二名夠接近（≥ 峰值 70%）才一起列。
// 這只是把 energy 排序當標籤，不是解讀文字。
const MAIN_AXIS_RATIO = 0.7
const mainAxes = computed(() => {
  const sorted = [...DIMENSION_ORDER].sort((a, b) => (props.quant.energy[b] ?? 0) - (props.quant.energy[a] ?? 0))
  const top = sorted[0]
  const peak = top ? (props.quant.energy[top] ?? 0) : 0
  if (peak <= 0) return []
  return sorted
    .slice(0, 2)
    .filter((key, i) => i === 0 || (props.quant.energy[key] ?? 0) >= peak * MAIN_AXIS_RATIO)
    .map((key) => DIMENSION_LABELS[key])
})

// 舊版後端沒有 focus，就不顯示集中度
const focusLabel = computed(() =>
  typeof props.quant.focus === 'number'
    ? ['很分散', '普通', '很集中'][levelOf('focus', props.quant.focus) - 1]
    : null,
)

// 只顯示有實際份量的牌，依帶動幅度排序
const topContributions = computed(() =>
  props.quant.contributions.filter((item) => Math.abs(item.share) >= 0.01).slice(0, 5),
)

function cardName(index: number) {
  return props.cards[index]?.card.nameZh ?? `第 ${index + 1} 張`
}

// share 的正負在接近 0 時只是雜訊（曾經有張逆位牌的投影值是 +0.03，
// 卻因此被標成「推動」，和正文「卡」「使不出來」正面衝突）。
// 低於死區一律不分正負。
// 用「往順利／往不順」而不是「帶動／拖住」：share 是上方指針（DI）的拆解，
// 用同一組詞才看得出兩者的關係，也不會和「推力」那格混在一起。
// 逆位標在牌名旁，不接在方向後面：「往順利・逆位」讀起來像逆位造成順利，
// 實際上逆位只是把力道打折，方向不變。
const SHARE_DEAD_ZONE = 0.1

function shareLabel(item: { index: number; share: number }) {
  return Math.abs(item.share) < SHARE_DEAD_ZONE ? '影響有限' : item.share > 0 ? '往順利' : '往不順'
}

function isReversed(index: number) {
  return props.cards[index]?.orientation === 'reversed'
}

function shareStyle(item: { index: number; share: number }) {
  if (Math.abs(item.share) < SHARE_DEAD_ZONE) {
    return 'text-ink-muted'
  }
  return item.share > 0 ? 'text-down-ink' : 'text-danger'
}

// 牌數太少時 DI 幾乎必然落在中間，這個指標沒什麼資訊量
const TOO_FEW_FOR_DIRECTION = 4
const directionUnreliable = computed(() => props.cards.length < TOO_FEW_FOR_DIRECTION)
</script>

<template>
  <div class="min-w-0 space-y-4 rounded-[1.5rem] border border-tint/10 bg-sink/45 p-4 sm:space-y-5 sm:rounded-[1.75rem] sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-[10px] uppercase tracking-[0.2em] text-ink-muted sm:text-xs sm:tracking-[0.3em]">Direction Analysis</p>
      <span class="rounded-full border border-tint/10 bg-tint/5 px-3 py-1 text-xs text-ink-muted">
        {{ quant.domainLabel }}{{ quant.domainResolvedFrom === 'user' ? '（你指定）' : '' }}
      </span>
    </div>

    <!-- 指向儀表：只給分級與指針位置，不顯示分數 -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <h3 class="text-base font-semibold text-ink sm:text-lg">整體看起來</h3>
        <span class="rounded-full border px-2.5 py-0.5 text-xs font-medium sm:px-3 sm:py-1 sm:text-sm" :class="DIRECTION_STYLES[quant.direction]">
          {{ quant.directionLabel }}
        </span>
      </div>

      <div class="pt-1">
        <div class="relative h-2 rounded-full bg-gradient-to-r from-up-hue-2/40 via-tint/15 to-down-hue-2/40">
          <span class="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-tint/30" />
          <span
            class="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sink bg-accent-hue shadow"
            :style="{ left: `${pointerPercent}%` }"
          />
        </div>
        <div class="mt-2 flex justify-between text-xs text-ink-muted">
          <span>不順</span>
          <span>參半</span>
          <span>順利</span>
        </div>
        <!-- 牌數少的時候這根指針幾乎必然落在中間，講清楚免得被當成結論 -->
        <p v-if="directionUnreliable" class="mt-2 text-xs leading-5 text-ink-muted">
          這次只有 {{ cards.length }} 張牌，這根指針很容易停在中間，參考就好。
        </p>
      </div>

      <!-- confidenceLow 的提醒句已在 quant.text 結尾（後端產生），這裡不再另外顯示一次 -->
      <p class="text-sm leading-7 text-ink-soft/85">{{ quant.text }}</p>
    </section>

    <!-- 四軸能量 -->
    <section class="space-y-2">
      <h3 class="text-base font-semibold text-ink sm:text-lg">這次的重心落在哪</h3>
      <p class="text-xs text-ink-muted">牌面的能量集中在哪些面向（只看分布，不代表好壞）</p>
      <div class="relative h-56 w-full min-w-0">
        <Radar :data="radarData" :options="radarOptions" />
      </div>
      <!-- 圖的刻度會跟著峰值縮放，形狀容易看起來比實際集中，用文字補上實際程度 -->
      <p v-if="mainAxes.length > 0 || focusLabel" class="text-center text-xs text-ink-muted">
        <template v-if="mainAxes.length > 0">
          主軸：<span class="text-accent">{{ mainAxes.join('、') }}</span>
        </template>
        <template v-if="mainAxes.length > 0 && focusLabel">｜</template>
        <template v-if="focusLabel">
          集中度：<span class="text-accent">{{ focusLabel }}</span>
        </template>
      </p>
    </section>

    <!-- 推力、阻力、可信度 -->
    <section class="grid min-w-0 gap-3 sm:grid-cols-3">
      <div
        v-for="meter in meters"
        :key="meter.name"
        class="min-w-0 rounded-2xl border border-tint/10 bg-tint/5 px-4 py-3"
      >
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="text-ink-muted">{{ meter.name }}</span>
          <span class="font-medium text-accent">{{ meter.labels[meter.level - 1] }}</span>
        </div>
        <p class="mt-0.5 text-xs leading-5 text-ink-muted">{{ meter.hint }}</p>
        <div class="mt-2 flex gap-1.5">
          <span
            v-for="step in 3"
            :key="step"
            class="h-1.5 flex-1 rounded-full"
            :class="step <= meter.level ? METER_FILL[meter.tone] : 'bg-tint/10'"
          />
        </div>
      </div>
    </section>

    <!-- 貢獻排行 -->
    <section v-if="topContributions.length > 0" class="space-y-2">
      <h3 class="text-base font-semibold text-ink sm:text-lg">每張牌往哪邊拉</h3>
      <!-- share 是除以總和後的佔比，再弱的組合也一定有長條，要講清楚免得和「推力」對不上 -->
      <p class="text-xs leading-5 text-ink-muted">
        長條越長，這張牌對結果的影響越大。顏色淡的是逆位，力道比較弱。
      </p>
      <!-- 刻度：和指針用同一組「不順／順利」 -->
      <div class="flex items-center gap-2 text-[10px] text-ink-muted sm:gap-3 sm:text-xs">
        <span class="w-20 flex-shrink-0 sm:w-28" />
        <span class="flex flex-1 justify-between">
          <span class="text-danger">← 往不順</span>
          <span class="text-down-ink">往順利 →</span>
        </span>
        <span class="w-12 flex-shrink-0 sm:w-16" />
      </div>
      <ul class="space-y-2">
        <li
          v-for="item in topContributions"
          :key="item.index"
          class="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm"
        >
          <span class="flex w-20 flex-shrink-0 items-baseline gap-1 sm:w-28">
            <span class="truncate text-ink-soft">{{ cardName(item.index) }}</span>
            <span v-if="isReversed(item.index)" class="flex-shrink-0 text-[10px] text-ink-muted">逆位</span>
          </span>
          <!-- 中線為 0，向右往順利、向左往不順 -->
          <span class="relative h-2 flex-1 rounded-full bg-tint/5">
            <span class="absolute left-1/2 top-0 h-full w-px bg-tint/20" />
            <span
              class="absolute top-0 h-full rounded-full"
              :class="[item.share >= 0 ? 'bg-down-hue/70' : 'bg-up-hue/70', isReversed(item.index) ? 'opacity-45' : '']"
              :style="
                item.share >= 0
                  ? { left: '50%', width: `${Math.abs(item.share) * 50}%` }
                  : { right: '50%', width: `${Math.abs(item.share) * 50}%` }
              "
            />
          </span>
          <span class="w-12 flex-shrink-0 text-right text-[10px] sm:w-16 sm:text-xs" :class="shareStyle(item)">
            {{ shareLabel(item) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
