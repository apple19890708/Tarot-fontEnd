<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'

import SelectField from '../SelectField.vue'
import CheckboxField from '../CheckboxField.vue'
import { axis, CHART_COLORS, formatNumber, legendOptions } from '../../lib/marketChart'
import type { IncomeItem, IncomeReport } from '../../types'

// 存股試算（v20 階段 8）：純前端的計算機，用使用者輸入的數字算給他看，不存資料、不是預測。
// 殖利率來源：持股組合（扣款後，父元件用後端合計算好給 portfolioYield）或清單裡某一檔台股的現價殖利率；
// 不讓使用者自己輸入殖利率（2026-11-10 使用者要求：選股票就好，避免填出不切實際的數字）。
// 1. 反推：想每月領 X 元，要多少本金（選了某一檔就換算成張數）
// 2. 滾動：每月投入 Y 元、股利再投入，N 年後資產與每月可領多少（每月複利；股價成長率預設 0，只算股利滾入）
const props = defineProps<{ report: IncomeReport }>()

const items = computed<IncomeItem[]>(() => props.report.items)
// 持股組合的殖利率（扣款後，%）：預估一年股利 ÷ 目前市值，都是後端的合計（台幣；美股併不進來時不給）
const portfolioYield = computed(() => {
  const twd = props.report.totals.twd
  if (!twd.usIncluded || twd.value <= 0 || twd.annualNet <= 0) return null
  return Math.round((twd.annualNet / twd.value) * 10000) / 100
})

const STORE_KEY = 'market-income-sim'
interface SimInputs {
  source: string
  monthlyWant: string
  start: string
  monthlyInvest: string
  years: string
  growth: string
  reinvest: boolean
}
const DEFAULTS: SimInputs = { source: 'portfolio', monthlyWant: '10000', start: '0', monthlyInvest: '10000', years: '10', growth: '0', reinvest: true }
function readInputs(): SimInputs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Partial<SimInputs>) }
  } catch {
    return { ...DEFAULTS }
  }
}
const inputs = ref<SimInputs>(readInputs())
watch(
  inputs,
  (value) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(value))
    } catch {
      // 存不了只是下次不記得
    }
  },
  { deep: true },
)

// 可以選的台股（有現價殖利率的）
const stockOptions = computed(() =>
  items.value.filter((item) => item.target.market === 'tw' && item.target.kind === 'stock' && item.currentYield && item.price && item.projection?.annualPerUnit),
)
const sourceOptions = computed(() => [
  ...(portfolioYield.value ? [{ value: 'portfolio', label: `我的持股組合（${formatNumber(portfolioYield.value, 2)}%，扣款後）` }] : []),
  ...stockOptions.value.map((item) => ({
    value: `item:${item.id}`,
    label: `${item.target.name} ${item.target.code}（${formatNumber(item.currentYield, 2)}%）`,
  })),
])
// 記住的來源不在選項裡了（例如那檔被移除）：改成第一個
watch(
  sourceOptions,
  (options) => {
    // 以前存的「自己輸入」也會走到這裡
    if (!options.some((option) => option.value === inputs.value.source)) inputs.value.source = options[0]?.value ?? ''
  },
  { immediate: true },
)
const chosenItem = computed(() => (inputs.value.source.startsWith('item:') ? stockOptions.value.find((item) => `item:${item.id}` === inputs.value.source) ?? null : null))
// 殖利率（%）
const yieldPct = computed(() => {
  if (inputs.value.source === 'portfolio') return portfolioYield.value
  return chosenItem.value?.currentYield ?? null
})

const num = (text: string, { min = 0, max = Infinity } = {}) => {
  const value = Number(String(text).replace(/,/g, ''))
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

// ---- 1. 反推 ----
const reverse = computed(() => {
  const want = num(inputs.value.monthlyWant, { min: 1, max: 1e8 })
  const y = yieldPct.value
  if (!want || !y) return null
  const yearly = want * 12
  const item = chosenItem.value
  if (item && item.projection?.annualPerUnit && item.price) {
    const lots = Math.ceil(yearly / item.projection.annualPerUnit)
    return { lots, capital: lots * item.price * 1000, name: item.target.name }
  }
  return { lots: null, capital: yearly / (y / 100), name: null }
})

// ---- 2. 滾動 ----
const rolling = computed(() => {
  const start = num(inputs.value.start, { max: 1e10 })
  const monthly = num(inputs.value.monthlyInvest, { max: 1e8 })
  const years = num(inputs.value.years, { min: 1, max: 40 })
  const growth = num(inputs.value.growth, { min: -20, max: 30 })
  const y = yieldPct.value
  if (start === null || monthly === null || !years || growth === null || !y) return null
  const monthlyGrowth = (1 + growth / 100) ** (1 / 12) - 1
  let value = start
  let invested = start
  let cashOut = 0
  // 第 0 年（一開始）也放進去，曲線從起點畫起
  const rows: { year: number; value: number; invested: number; cashOut: number; monthlyIncome: number }[] = [
    { year: 0, value: start, invested: start, cashOut: 0, monthlyIncome: (start * y) / 100 / 12 },
  ]
  for (let month = 1; month <= Math.round(years) * 12; month += 1) {
    value = value * (1 + monthlyGrowth) + monthly
    invested += monthly
    const dividend = (value * y) / 100 / 12
    if (inputs.value.reinvest) value += dividend
    else cashOut += dividend
    if (month % 12 === 0) rows.push({ year: month / 12, value, invested, cashOut, monthlyIncome: (value * y) / 100 / 12 })
  }
  return { rows, last: rows[rows.length - 1]! }
})

const money = (value: number) => formatNumber(Math.round(value), 0)

// 曲線圖：資產與自己投入（同一個單位、同一個縱軸）；每月可領放在滑過的說明裡。顏色在 computed 裡取，跟著日夜模式換
const chartData = computed(() => {
  const rows = rolling.value?.rows ?? []
  return {
    labels: rows.map((row) => (row.year === 0 ? '現在' : `第 ${row.year} 年`)),
    datasets: [
      { label: '資產', data: rows.map((row) => Math.round(row.value)), borderColor: CHART_COLORS.radar, backgroundColor: CHART_COLORS.radarFill, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
      { label: '自己投入', data: rows.map((row) => Math.round(row.invested)), borderColor: CHART_COLORS.baseline, backgroundColor: CHART_COLORS.baseline, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 },
    ],
  }
})
const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: legendOptions(),
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => `${ctx.dataset.label} ${money(ctx.parsed.y ?? 0)} 元`,
        footer: (items: { dataIndex: number }[]) => {
          const row = rolling.value?.rows[items[0]?.dataIndex ?? -1]
          return row ? `之後每月可領約 ${money(row.monthlyIncome)} 元` : ''
        },
      },
    },
  },
  scales: {
    x: axis({ grid: { display: false }, ticks: { color: CHART_COLORS.text, maxRotation: 0, autoSkip: true, autoSkipPadding: 8, font: { size: 11 } } }),
    y: axis({
      beginAtZero: true,
      ticks: { color: CHART_COLORS.text, maxTicksLimit: 5, font: { size: 11 }, callback: (value: number | string) => `${formatNumber(Number(value) / 10000, 0)} 萬` },
    }),
  },
}))
const INPUT_CLASS =
  'min-w-0 border-2 border-tint/10 bg-tint/5 px-2.5 py-1.5 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40'
</script>

<template>
  <div class="space-y-4 text-body">
      <div class="flex flex-wrap items-center gap-2">
        <span class="shrink-0 text-ink-muted">股票</span>
        <SelectField v-if="sourceOptions.length" v-model="inputs.source" :options="sourceOptions" label="股票" variant="pixel" hide-label class="min-w-0 flex-[1_1_14rem]" />
        <span v-else class="text-caption text-ink-muted">清單裡還沒有算得出殖利率的台股，先加一檔進來。</span>
      </div>
      <p class="text-caption text-ink-muted">括號裡是現價殖利率（近 12 個月的股利 ÷ 現價）；持股組合是扣掉健保補充保費後的。</p>

      <!-- 1. 反推 -->
      <section class="space-y-2">
        <p class="font-semibold text-ink">想每月領多少？</p>
        <label class="flex flex-wrap items-center gap-2">
          <span class="text-ink-muted">每月</span>
          <input v-model="inputs.monthlyWant" inputmode="numeric" :class="INPUT_CLASS" class="w-32" aria-label="每月想領多少元" />
          <span class="text-ink-muted">元</span>
        </label>
        <p v-if="reverse" class="text-ink-soft">
          <template v-if="reverse.lots !== null">
            要買 <span class="tabular-nums text-accent">{{ formatNumber(reverse.lots, 0) }}</span> 張{{ reverse.name }}，以現價約
            <span class="tabular-nums text-accent">{{ money(reverse.capital) }}</span> 元
          </template>
          <template v-else>大約要 <span class="tabular-nums text-accent">{{ money(reverse.capital) }}</span> 元的本金</template>
        </p>
        <p v-else class="text-caption text-ink-muted">選一檔股票、填入金額就會算出來。</p>
      </section>

      <!-- 2. 滾動 -->
      <section class="space-y-2">
        <p class="font-semibold text-ink">每月存多少，N 年後會怎樣？</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <label class="flex items-center gap-2"><span class="w-[6em] shrink-0 text-ink-muted">一開始有</span><input v-model="inputs.start" inputmode="numeric" :class="INPUT_CLASS" class="flex-1" /><span class="text-ink-muted">元</span></label>
          <label class="flex items-center gap-2"><span class="w-[6em] shrink-0 text-ink-muted">每月投入</span><input v-model="inputs.monthlyInvest" inputmode="numeric" :class="INPUT_CLASS" class="flex-1" /><span class="text-ink-muted">元</span></label>
          <label class="flex items-center gap-2"><span class="w-[6em] shrink-0 text-ink-muted">存幾年</span><input v-model="inputs.years" inputmode="numeric" :class="INPUT_CLASS" class="flex-1" /><span class="text-ink-muted">年</span></label>
          <label class="flex items-center gap-2"><span class="w-[6em] shrink-0 text-ink-muted">股價每年</span><input v-model="inputs.growth" inputmode="decimal" :class="INPUT_CLASS" class="flex-1" /><span class="text-ink-muted">%</span></label>
        </div>
        <CheckboxField v-model="inputs.reinvest">領到的股利再投入（不領出來花）</CheckboxField>
        <template v-if="rolling">
          <p class="text-ink-soft">
            {{ rolling.last.year }} 年後資產約 <span class="tabular-nums text-accent">{{ money(rolling.last.value) }}</span> 元（自己投入
            {{ money(rolling.last.invested) }} 元），之後每月大約能領
            <span class="tabular-nums text-accent">{{ money(rolling.last.monthlyIncome) }}</span> 元<template v-if="!inputs.reinvest">；這段期間已經領出 {{ money(rolling.last.cashOut) }} 元</template>。
          </p>
          <!-- 曲線圖（使用者要求）：資產與自己投入；滑過看每月可領 -->
          <div class="h-56 sm:h-64">
            <Line :data="chartData" :options="chartOptions as never" />
          </div>
          <details>
            <summary class="cursor-pointer text-caption text-ink-muted marker:text-ink-soft hover:text-ink">看每一年的數字</summary>
            <div class="mt-1 overflow-x-auto">
              <table class="w-full min-w-[22rem] text-left text-caption tabular-nums">
                <thead class="text-ink-muted">
                  <tr>
                    <th class="py-1 pr-3 font-normal">第幾年</th>
                    <th class="py-1 pr-3 text-right font-normal">資產</th>
                    <th class="py-1 pr-3 text-right font-normal">自己投入</th>
                    <th class="py-1 text-right font-normal">每月可領</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in rolling.rows" :key="row.year" class="border-t border-tint/10">
                    <td class="py-1 pr-3 text-ink-soft">{{ row.year === 0 ? '現在' : row.year }}</td>
                    <td class="py-1 pr-3 text-right text-ink-soft">{{ money(row.value) }}</td>
                    <td class="py-1 pr-3 text-right text-ink-muted">{{ money(row.invested) }}</td>
                    <td class="py-1 text-right text-accent">{{ money(row.monthlyIncome) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </template>
        <p v-else class="text-caption text-ink-muted">金額要是數字、年數 1～40、股價成長率 −20～30%。</p>
      </section>

      <p class="text-caption text-ink-muted">
        試算不是預測：殖利率和股價都會變，配息也可能減少。股利以每月平均入帳簡化計算，台股單筆 2 萬元以上的健保補充保費沒有另外扣。
      </p>
  </div>
</template>
