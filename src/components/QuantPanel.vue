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

import type { AnalysisQuant, QuantDimension, ReadingCard } from '../types'

// 只註冊雷達圖需要的模組，其餘不註冊以利 tree-shaking
ChartJS.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip)

const props = defineProps<{
  quant: AnalysisQuant
  cards: ReadingCard[]
}>()

const DIMENSION_LABELS: Record<QuantDimension, string> = {
  action: '行動',
  emotion: '情感',
  logic: '思維',
  material: '物質',
}

const DIMENSION_ORDER: QuantDimension[] = ['action', 'emotion', 'logic', 'material']

const DIRECTION_STYLES: Record<string, string> = {
  strongPositive: 'border-emerald-200/40 bg-emerald-300/15 text-emerald-100',
  positive: 'border-emerald-200/30 bg-emerald-300/10 text-emerald-100',
  neutral: 'border-white/15 bg-white/5 text-stone-200',
  negative: 'border-rose-200/30 bg-rose-300/10 text-rose-100',
  strongNegative: 'border-rose-200/40 bg-rose-300/15 text-rose-100',
}

// DI 介於 -100~100，換算成 0~100% 的指針位置。數字本身不顯示給使用者
const pointerPercent = computed(() => ((props.quant.di + 100) / 2).toFixed(1))

const radarData = computed(() => ({
  labels: DIMENSION_ORDER.map((key) => DIMENSION_LABELS[key]),
  datasets: [
    {
      label: '能量分布',
      data: DIMENSION_ORDER.map((key) => props.quant.energy[key]),
      backgroundColor: 'rgba(252, 211, 77, 0.18)',
      borderColor: 'rgba(252, 211, 77, 0.8)',
      pointBackgroundColor: 'rgba(252, 211, 77, 1)',
      pointBorderColor: 'rgba(15, 23, 42, 1)',
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
      angleLines: { color: 'rgba(255,255,255,0.1)' },
      grid: { color: 'rgba(255,255,255,0.1)' },
      pointLabels: { color: 'rgba(231,229,228,0.8)', font: { size: 12 } },
      ticks: { display: false, stepSize: radarMax.value / 4 },
    },
  },
}))

// 傾向條的三格等級。
// 原本叫「使不使得上力」「推進順不順」，兩個名稱聽起來像在問同一件事，
// 而且名稱是問句、數值是答句，看的人要自己對起來。改成名詞＋一行說明。
type Meter = { name: string; hint: string; value: number; labels: [string, string, string] }

// 傾向條的三格等級。
// 原本叫「使不使得上力」「推進順不順」，兩個名稱聽起來像在問同一件事，
// 而且名稱是問句、數值是答句，看的人要自己對起來。改成名詞＋一行說明。
const meters = computed<Meter[]>(() => {
  const list: Meter[] = [
    {
      name: '推力',
      hint: '站在你這邊的力量有多少',
      value: props.quant.momentum,
      labels: ['幾乎沒有', '有一些', '相當充足'],
    },
    {
      name: '阻力',
      hint: '擋路的、或是使不出來的有多少',
      value: props.quant.resistance,
      labels: ['很小', '有一些', '相當大'],
    },
  ]

  // 舊版後端沒有 focus，那一格整格不顯示
  if (typeof props.quant.focus === 'number') {
    list.push({
      name: '焦點集中度',
      hint: '力氣壓在少數面向，還是平均攤開',
      value: props.quant.focus,
      labels: ['很分散', '普通', '很集中'],
    })
  }

  list.push({
    name: '訊息明朗度',
    hint: '這組牌的訊號清不清楚，越低越只能當參考',
    value: props.quant.confidence,
    labels: ['偏模糊', '普通', '相當清楚'],
  })

  return list
})

function meterLevel(value: number) {
  if (value >= 0.5) return 3
  if (value >= 0.3) return 2
  return 1
}

// 只顯示有實際份量的牌，依帶動幅度排序
const topContributions = computed(() =>
  props.quant.contributions.filter((item) => Math.abs(item.share) >= 0.01).slice(0, 5),
)

function cardName(index: number) {
  return props.cards[index]?.card.nameZh ?? `第 ${index + 1} 張`
}

// share 的正負在接近 0 時只是雜訊（曾經有張逆位牌的投影值是 +0.03，
// 卻因此被標成「推動」，和正文「卡」「使不出來」正面衝突）。
// 低於死區一律不分正負；逆位也要標出來，不能只看符號。
const SHARE_DEAD_ZONE = 0.1

function shareLabel(item: { index: number; share: number }) {
  const reversed = props.cards[item.index]?.orientation === 'reversed'
  const base =
    Math.abs(item.share) < SHARE_DEAD_ZONE ? '影響有限' : item.share > 0 ? '帶動' : '拖住'

  return reversed ? `${base}・逆位` : base
}

function shareStyle(item: { index: number; share: number }) {
  if (Math.abs(item.share) < SHARE_DEAD_ZONE) {
    return 'text-stone-400'
  }
  return item.share > 0 ? 'text-emerald-200/80' : 'text-rose-200/80'
}

// 牌數太少時 DI 幾乎必然落在中間，這個指標沒什麼資訊量
const TOO_FEW_FOR_DIRECTION = 4
const directionUnreliable = computed(() => props.cards.length < TOO_FEW_FOR_DIRECTION)
</script>

<template>
  <div class="space-y-5 rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">Direction Analysis</p>
      <span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-stone-300/80">
        {{ quant.domainLabel }}{{ quant.domainResolvedFrom === 'user' ? '（你指定）' : '' }}
      </span>
    </div>

    <!-- 指向儀表：只給分級與指針位置，不顯示分數 -->
    <section class="space-y-3">
      <div class="flex items-center gap-3">
        <h3 class="text-lg font-semibold text-stone-50">整體看起來</h3>
        <span class="rounded-full border px-3 py-1 text-sm font-medium" :class="DIRECTION_STYLES[quant.direction]">
          {{ quant.directionLabel }}
        </span>
      </div>

      <div class="pt-1">
        <div class="relative h-2 rounded-full bg-gradient-to-r from-rose-400/40 via-white/15 to-emerald-400/40">
          <span class="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-white/30" />
          <span
            class="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 bg-amber-200 shadow"
            :style="{ left: `${pointerPercent}%` }"
          />
        </div>
        <div class="mt-2 flex justify-between text-xs text-stone-400">
          <span>不順</span>
          <span>參半</span>
          <span>順利</span>
        </div>
        <!-- 牌數少的時候這根指針幾乎必然落在中間，講清楚免得被當成結論 -->
        <p v-if="directionUnreliable" class="mt-2 text-xs leading-5 text-stone-500">
          這次只有 {{ cards.length }} 張牌，這根指針很容易停在中間，參考就好。
        </p>
      </div>

      <p class="text-sm leading-7 text-stone-200/85">{{ quant.text }}</p>

      <p
        v-if="quant.confidenceLow"
        class="rounded-2xl border border-dashed border-amber-200/25 bg-amber-100/5 px-4 py-2 text-sm leading-6 text-amber-100/80"
      >
        這組牌的訊息比較雜，當參考就好。
      </p>
    </section>

    <!-- 四軸能量 -->
    <section class="space-y-2">
      <h3 class="text-lg font-semibold text-stone-50">這次在講什麼</h3>
      <p class="text-xs text-stone-400">這組牌把力氣花在哪些面向，跟好壞無關</p>
      <div class="h-56">
        <Radar :data="radarData" :options="radarOptions" />
      </div>
    </section>

    <!-- 推力、阻力、集中度、明朗度 -->
    <section class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="meter in meters"
        :key="meter.name"
        class="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
      >
        <div class="flex items-baseline justify-between gap-2 text-sm">
          <span class="text-stone-300/80">{{ meter.name }}</span>
          <span class="font-medium text-amber-50">{{ meter.labels[meterLevel(meter.value) - 1] }}</span>
        </div>
        <p class="mt-0.5 text-[11px] leading-5 text-stone-500">{{ meter.hint }}</p>
        <div class="mt-2 flex gap-1.5">
          <span
            v-for="step in 3"
            :key="step"
            class="h-1.5 flex-1 rounded-full"
            :class="step <= meterLevel(meter.value) ? 'bg-amber-200/80' : 'bg-white/10'"
          />
        </div>
      </div>
    </section>

    <!-- 貢獻排行 -->
    <section v-if="topContributions.length > 0" class="space-y-2">
      <h3 class="text-lg font-semibold text-stone-50">哪張牌份量最重</h3>
      <p class="text-xs text-stone-400">
        這一段算的是每張牌把整體往哪邊帶，和上面的雷達圖是兩套算法，不要互相對照
      </p>
      <ul class="space-y-2">
        <li
          v-for="item in topContributions"
          :key="item.index"
          class="flex items-center gap-3 text-sm"
        >
          <span class="w-24 flex-shrink-0 truncate text-stone-200">{{ cardName(item.index) }}</span>
          <!-- 中線為 0，向右為推動、向左為拉扯 -->
          <span class="relative h-2 flex-1 rounded-full bg-white/5">
            <span class="absolute left-1/2 top-0 h-full w-px bg-white/20" />
            <span
              class="absolute top-0 h-full rounded-full"
              :class="item.share >= 0 ? 'bg-emerald-300/70' : 'bg-rose-300/70'"
              :style="
                item.share >= 0
                  ? { left: '50%', width: `${Math.abs(item.share) * 50}%` }
                  : { right: '50%', width: `${Math.abs(item.share) * 50}%` }
              "
            />
          </span>
          <span class="w-20 flex-shrink-0 text-right text-xs" :class="shareStyle(item)">
            {{ shareLabel(item) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
