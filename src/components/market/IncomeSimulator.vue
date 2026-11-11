<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'

import DataTable from '../DataTable.vue'
import HelpTip from '../HelpTip.vue'
import SelectField from '../SelectField.vue'
import CheckboxField from '../CheckboxField.vue'
import DividendStockPicker from './DividendStockPicker.vue'
import IncomeCompare from './IncomeCompare.vue'
import { axis, CHART_COLORS, formatNumber, legendOptions } from '../../lib/marketChart'
import { ROW_TINT } from '../../lib/table'
import { annualNet, capitalFor, payoutsOf, priceTwdOf, simulate, yieldOf, type YieldBasis, type SimDeductions, type SimHolding, type SimParams, type TaxMode } from '../../lib/incomeSim'
import type { DividendProfile, IncomeItem, IncomeReport } from '../../types'

// 存股試算 2.0（v20 2.9.9，2026-11-11 使用者要求「全部做」）：純前端的計算機，用使用者輸入的假設算給他看，不存資料、不是預測。
// 計算在 lib/incomeSim.ts；這裡負責把報表換成「持股組合／單一檔」、輸入與排版。
// - 殖利率：預設用多年平均（後端 dividendAverage），可切近 12 個月；都從未扣款出發，扣款在試算裡依規則算（口徑一致）
// - 持股組合：依目前各檔市值比例拆開，各用自己的殖利率、配息頻率、市場
// - 假設：股價年漲幅、股利年成長分開；通膨換算；保守／基準／樂觀三個情境
const props = defineProps<{ report: IncomeReport }>()

const items = computed<IncomeItem[]>(() => props.report.items)

const STORE_KEY = 'market-income-sim'
interface SimInputs {
  // portfolio：我的持股組合；custom：自選一檔（customMarket＋customQuery 記住代號）
  source: string
  customMarket: 'tw' | 'us'
  customQuery: string
  yieldBasis: YieldBasis
  monthlyWant: string
  start: string
  monthlyInvest: string
  years: string
  priceGrowth: string
  dividendGrowth: string
  inflationOn: boolean
  inflation: string
  taxMode: TaxMode
  taxBracket: string
  reinvest: boolean
}
const DEFAULTS: SimInputs = {
  source: 'portfolio',
  customMarket: 'tw',
  customQuery: '',
  yieldBasis: 'average',
  monthlyWant: '10000',
  start: '0',
  monthlyInvest: '10000',
  years: '10',
  priceGrowth: '0',
  dividendGrowth: '0',
  inflationOn: true,
  inflation: '2',
  taxMode: 'none',
  taxBracket: '0.12',
  reinvest: true,
}
function readInputs(): SimInputs {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Partial<SimInputs> & { growth?: string }
    // 1.0 的「股價每年」（growth）搬到「假設股價年漲幅」
    if (saved.growth !== undefined && saved.priceGrowth === undefined) saved.priceGrowth = saved.growth
    delete saved.growth
    return { ...DEFAULTS, ...saved }
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

const num = (text: string, { min = 0, max = Infinity } = {}) => {
  const value = Number(String(text).replace(/,/g, ''))
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

// 持股組合：有持股、有市值的股票；美股用匯率換成台幣，取不到匯率時不算進來
const portfolio = computed(() => {
  const fx = props.report.usdTwd
  let excludedUs = 0
  const rows = items.value
    .filter((item) => item.target.kind === 'stock' && (item.position?.marketValue ?? 0) > 0)
    .map((item) => {
      if (item.target.market === 'us' && !fx) {
        excludedUs += 1
        return null
      }
      return { item, value: item.position!.marketValue! * (item.target.market === 'us' ? fx! : 1) }
    })
    .filter((row): row is { item: IncomeItem; value: number } => row !== null)
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  return { rows, total, excludedUs }
})
// 沒有持股時只能自選一檔（舊版存的 item:xxx 也改成自選）
watch(
  () => portfolio.value.total,
  (total) => {
    if (inputs.value.source !== 'portfolio' && inputs.value.source !== 'custom') inputs.value.source = 'custom'
    if (inputs.value.source === 'portfolio' && total <= 0) inputs.value.source = 'custom'
  },
  { immediate: true },
)

// ---- 自選一檔（2026-11-11 使用者要求「輸入代號自選，跟加入追蹤一樣」）：搜尋與查詢在 DividendStockPicker ----
const profile = ref<DividendProfile | null>(null)
// 自選那一檔的台幣價格（美股乘匯率）；美股取不到匯率時是 null
const customPriceTwd = computed(() => (profile.value ? priceTwdOf(profile.value) : null))

// 要試算的那一籃：自選是一筆；持股組合依市值比例拆開
const basket = computed<{ holdings: SimHolding[]; yieldPct: number; note: string } | null>(() => {
  const basis = inputs.value.yieldBasis
  if (inputs.value.source === 'custom') {
    const pf = profile.value
    if (!pf || !customPriceTwd.value) return null
    const y = yieldOf(pf, basis)
    if (!y) return null
    const fallback = basis === 'average' && !pf.dividendAverage?.yieldPct ? '；股利紀錄不滿 1 年，用近 12 個月' : ''
    return {
      holdings: [{ weight: 1, yieldPct: y.pct, payouts: payoutsOf(pf.frequency), market: pf.target.market }],
      yieldPct: y.pct,
      note: `殖利率 ${formatNumber(y.pct, 2)}%（${y.label}，扣款前）${fallback}`,
    }
  }
  if (portfolio.value.total <= 0) return null
  const { rows, total } = portfolio.value
  const holdings = rows.map(({ item, value }) => ({
    weight: value / total,
    yieldPct: yieldOf(item, basis)?.pct ?? 0,
    payouts: payoutsOf(item.projection?.frequency),
    market: item.target.market,
  }))
  const yieldPct = holdings.reduce((sum, h) => sum + h.weight * h.yieldPct, 0)
  const fallback = basis === 'average' ? rows.filter(({ item }) => !item.dividendAverage?.yieldPct).length : 0
  const notes = [`${rows.length} 檔依市值比例，加權殖利率 ${formatNumber(yieldPct, 2)}%（扣款前）`]
  if (fallback) notes.push(`${fallback} 檔股利紀錄不滿 1 年或後端還沒更新，用近 12 個月`)
  if (portfolio.value.excludedUs) notes.push(`${portfolio.value.excludedUs} 檔美股取不到匯率，沒算進來`)
  return { holdings, yieldPct, note: notes.join('；') }
})
const deductions = computed<SimDeductions>(() => ({
  ...props.report.settings,
  taxMode: inputs.value.taxMode,
  taxBracket: Number(inputs.value.taxBracket) || 0.12,
}))

const TAX_OPTIONS: { value: TaxMode; label: string }[] = [
  { value: 'none', label: '不計' },
  { value: 'combined', label: '合併計稅' },
  { value: 'separate', label: '分離課稅 28%' },
]
const BRACKET_OPTIONS = ['0.05', '0.12', '0.2', '0.3', '0.4'].map((value) => ({ value, label: `級距 ${Math.round(Number(value) * 100)}%` }))
const BASIS_OPTIONS: { value: YieldBasis; label: string }[] = [
  { value: 'average', label: '多年平均' },
  { value: 'recent', label: '近 12 個月' },
]

// ---- 1. 反推：每月想領多少（扣款後）----
const reverse = computed(() => {
  const want = num(inputs.value.monthlyWant, { min: 1, max: 1e8 })
  const b = basket.value
  if (!want || !b || b.yieldPct <= 0) return null
  const capital = capitalFor(want, b.holdings, deductions.value)
  if (capital === null) return null
  const pf = inputs.value.source === 'custom' ? profile.value : null
  if (pf && customPriceTwd.value) {
    // 換成張數（台股 1 張 1000 股）或股數（美股），無條件進位；跨過健保門檻時扣款變多，再補到夠
    const unitPrice = customPriceTwd.value * (pf.target.market === 'tw' ? 1000 : 1)
    const monthlyOf = (units: number) => annualNet([(units * unitPrice * b.yieldPct) / 100], b.holdings, deductions.value) / 12
    let units = Math.max(1, Math.ceil(capital / unitPrice))
    for (let i = 0; i < 20 && monthlyOf(units) < want; i += 1) units += 1
    return { units, unit: pf.target.market === 'tw' ? '張' : '股', capital: units * unitPrice, name: pf.target.name }
  }
  return { units: null, unit: '', capital, name: null }
})

// ---- 2. 滾動：三個情境 ----
// 共用條件（試算與「比較兩檔」都用）：金額、年數、通膨、再投入、扣款；不合法是 null
const sharedParams = computed(() => {
  const start = num(inputs.value.start, { max: 1e10 })
  const monthly = num(inputs.value.monthlyInvest, { max: 1e8 })
  const years = num(inputs.value.years, { min: 1, max: 40 })
  const inflation = inputs.value.inflationOn ? num(inputs.value.inflation, { min: 0, max: 20 }) : 0
  if (start === null || monthly === null || !years || inflation === null) return null
  return { start, monthly, years, inflation, reinvest: inputs.value.reinvest, deductions: deductions.value }
})
const params = computed<SimParams | null>(() => {
  const shared = sharedParams.value
  const priceGrowth = num(inputs.value.priceGrowth, { min: -20, max: 30 })
  const dividendGrowth = num(inputs.value.dividendGrowth, { min: -20, max: 30 })
  const b = basket.value
  if (!shared || priceGrowth === null || dividendGrowth === null || !b) return null
  return { ...shared, holdings: b.holdings, priceGrowth, dividendGrowth }
})
const scenarios = computed(() => {
  const p = params.value
  if (!p) return null
  const base = simulate(p)
  // 兩個假設一起往同一個方向調：只調股價的話，股價漲、股利不變，再投入買到的股數變少，「樂觀」反而領得比基準少
  const low = simulate({ ...p, priceGrowth: p.priceGrowth - 1, dividendGrowth: p.dividendGrowth - 1, holdings: p.holdings.map((h) => ({ ...h, yieldPct: h.yieldPct * 0.8 })) })
  const high = simulate({ ...p, priceGrowth: p.priceGrowth + 1, dividendGrowth: p.dividendGrowth + 1 })
  return { base, low, high, last: base[base.length - 1]! }
})
const scenarioRows = computed(() => {
  const s = scenarios.value
  if (!s) return []
  return [
    { key: 'low', label: '保守', row: s.low[s.low.length - 1]! },
    { key: 'base', label: '基準', row: s.last },
    { key: 'high', label: '樂觀', row: s.high[s.high.length - 1]! },
  ]
})

const money = (value: number) => formatNumber(Math.round(value), 0)

// 曲線圖：基準的資產與自己投入；保守、樂觀用細虛線。顏色在 computed 裡取，跟著日夜模式換
const chartData = computed(() => {
  const s = scenarios.value
  const rows = s?.base ?? []
  const thin = { borderWidth: 1, borderDash: [3, 3], pointRadius: 0, pointHoverRadius: 3, tension: 0.2, fill: false }
  return {
    labels: rows.map((row) => (row.year === 0 ? '現在' : `第 ${row.year} 年`)),
    datasets: [
      { label: '資產（基準）', data: rows.map((row) => Math.round(row.value)), borderColor: CHART_COLORS.radar, backgroundColor: CHART_COLORS.radarFill, fill: true, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2 },
      { label: '保守', data: (s?.low ?? []).map((row) => Math.round(row.value)), borderColor: CHART_COLORS.neutral, backgroundColor: CHART_COLORS.neutral, ...thin },
      { label: '樂觀', data: (s?.high ?? []).map((row) => Math.round(row.value)), borderColor: CHART_COLORS.up, backgroundColor: CHART_COLORS.up, ...thin },
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
          const row = scenarios.value?.base[items[0]?.dataIndex ?? -1]
          return row ? `基準：之後每月可領約 ${money(row.monthlyIncome)} 元（扣款後）` : ''
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
const LABEL_CLASS = 'inline-flex w-[8.5em] shrink-0 items-center gap-1 text-ink-muted'
</script>

<template>
  <div class="space-y-4 text-body">
    <!-- 試算對象與共同假設：每一項標題在上（含 ? 說明）、選單在下、補充說明最後（2026-11-11 使用者要求） -->
    <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div class="min-w-0 space-y-1.5 sm:col-span-2">
        <p class="text-ink-muted">股票</p>
        <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="試算哪些股票">
          <button
            v-for="option in [{ value: 'portfolio', label: '我的持股組合' }, { value: 'custom', label: '自選一檔' }]"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="inputs.source === option.value"
            :disabled="option.value === 'portfolio' && portfolio.total <= 0"
            class="cursor-pointer border-2 px-3 py-1.5 text-button transition font-pixel disabled:cursor-not-allowed disabled:opacity-40"
            :class="inputs.source === option.value ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
            :title="option.value === 'portfolio' && portfolio.total <= 0 ? '還沒有記錄持股' : undefined"
            @click="inputs.source = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <!-- 自選一檔：和「加入追蹤」一樣，選市場、打代號或名稱（DividendStockPicker，比較也用同一個） -->
        <DividendStockPicker
          v-if="inputs.source === 'custom'"
          v-model:market="inputs.customMarket"
          v-model:query="inputs.customQuery"
          v-model:profile="profile"
        />
      </div>
      <div class="min-w-0 space-y-1">
        <p class="flex items-center gap-1 text-ink-muted">殖利率用哪一段<HelpTip term="simYieldBasis" /></p>
        <SelectField v-model="inputs.yieldBasis" :options="BASIS_OPTIONS" label="殖利率用哪一段" variant="pixel" hide-label />
        <p v-if="basket" class="text-caption text-ink-muted">{{ basket.note }}</p>
      </div>
      <div class="min-w-0 space-y-1">
        <p class="flex items-center gap-1 text-ink-muted">股利所得稅<HelpTip term="simDeduction" /></p>
        <div class="flex gap-2">
          <SelectField v-model="inputs.taxMode" :options="TAX_OPTIONS" label="股利所得稅" variant="pixel" hide-label class="min-w-0 flex-1" />
          <SelectField v-if="inputs.taxMode === 'combined'" v-model="inputs.taxBracket" :options="BRACKET_OPTIONS" label="合併計稅級距" variant="pixel" hide-label class="min-w-0 flex-1" />
        </div>
        <p class="text-caption text-ink-muted">
          二代健保（台股單次 {{ money(report.settings.nhiThreshold) }} 元以上扣 {{ formatNumber(report.settings.nhiRate * 100, 2) }}%）{{ report.settings.nhi ? '' : '目前設定為不扣' }}、美股預扣
          {{ formatNumber(report.settings.usWithholding * 100, 0) }}%，沿用扣款設定。
        </p>
      </div>
    </section>

    <!-- 1. 反推 -->
    <section class="space-y-2">
      <p class="font-semibold text-ink">想每月領多少？（扣款後）</p>
      <label class="flex flex-wrap items-center gap-2">
        <span class="text-ink-muted">每月</span>
        <input v-model="inputs.monthlyWant" inputmode="numeric" :class="INPUT_CLASS" class="w-32" aria-label="每月想領多少元" />
        <span class="text-ink-muted">元</span>
      </label>
      <p v-if="reverse" class="text-ink-soft">
        <template v-if="reverse.units !== null">
          要買 <span class="tabular-nums text-accent">{{ formatNumber(reverse.units, 0) }}</span> {{ reverse.unit }}{{ reverse.name }}，以現價約
          <span class="tabular-nums text-accent">{{ money(reverse.capital) }}</span> 元
        </template>
        <template v-else>依目前持股比例，大約要 <span class="tabular-nums text-accent">{{ money(reverse.capital) }}</span> 元的本金</template>
      </p>
      <p v-else class="text-caption text-ink-muted">選持股組合或自選一檔、填入金額就會算出來。</p>
    </section>

    <!-- 2. 滾動 -->
    <section class="space-y-2">
      <p class="font-semibold text-ink">每月存多少，N 年後會怎樣？</p>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">一開始有</span><input v-model="inputs.start" inputmode="numeric" :class="INPUT_CLASS" class="w-0 flex-1" /><span class="w-[1em] text-ink-muted">元</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">每月投入</span><input v-model="inputs.monthlyInvest" inputmode="numeric" :class="INPUT_CLASS" class="w-0 flex-1" /><span class="w-[1em] text-ink-muted">元</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">存幾年</span><input v-model="inputs.years" inputmode="numeric" :class="INPUT_CLASS" class="w-0 flex-1" /><span class="w-[1em] text-ink-muted">年</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">假設股價年漲幅<HelpTip term="simGrowth" /></span><input v-model="inputs.priceGrowth" inputmode="decimal" :class="INPUT_CLASS" class="w-0 flex-1" /><span class="w-[1em] text-ink-muted">%</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">假設股利年成長<HelpTip term="simDividendGrowth" /></span><input v-model="inputs.dividendGrowth" inputmode="decimal" :class="INPUT_CLASS" class="w-0 flex-1" /><span class="w-[1em] text-ink-muted">%</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">每年通膨<HelpTip term="simInflation" /></span><input v-model="inputs.inflation" inputmode="decimal" :disabled="!inputs.inflationOn" :class="INPUT_CLASS" class="w-0 flex-1 disabled:opacity-50" /><span class="w-[1em] text-ink-muted">%</span></label>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <CheckboxField v-model="inputs.reinvest">領到的股利再投入（不領出來花）</CheckboxField>
        <CheckboxField v-model="inputs.inflationOn">換算成今天的錢</CheckboxField>
      </div>

      <template v-if="scenarios">
        <p class="text-ink-soft">
          基準：{{ scenarios.last.year }} 年後資產約 <span class="tabular-nums text-accent">{{ money(scenarios.last.value) }}</span> 元（自己投入
          {{ money(scenarios.last.invested) }} 元），之後每月大約能領 <span class="tabular-nums text-accent">{{ money(scenarios.last.monthlyIncome) }}</span> 元（扣款後）<template
            v-if="inputs.inflationOn"
            >，約等於今天的 <span class="tabular-nums">{{ money(scenarios.last.realMonthlyIncome) }}</span> 元</template
          ><template v-if="!inputs.reinvest">；這段期間已經領出 {{ money(scenarios.last.cashOut) }} 元</template>。
        </p>

        <!-- 三個情境 -->
        <div class="space-y-1">
          <p class="flex items-center gap-1 text-caption text-ink-muted">三個情境<HelpTip term="simScenario" /></p>
          <DataTable table-class="min-w-[30rem]">
            <template #head>
              <tr>
                <th>情境</th>
                <th>{{ scenarios.last.year }} 年後資產</th>
                <th>之後每月可領（扣款後）</th>
                <th v-if="inputs.inflationOn">每月可領（今天的錢）</th>
              </tr>
            </template>
            <tr v-for="s in scenarioRows" :key="s.key" :class="s.key === 'base' ? ROW_TINT : ''">
              <th scope="row" :class="s.key === 'base' ? 'font-semibold text-ink' : 'text-ink-soft'">{{ s.label }}</th>
              <td class="whitespace-nowrap text-ink-soft">{{ money(s.row.value) }}</td>
              <td class="whitespace-nowrap text-accent">{{ money(s.row.monthlyIncome) }}</td>
              <td v-if="inputs.inflationOn" class="whitespace-nowrap text-ink-muted">{{ money(s.row.realMonthlyIncome) }}</td>
            </tr>
          </DataTable>
        </div>

        <!-- 曲線圖：基準的資產與自己投入，保守／樂觀用細線；滑過看每月可領 -->
        <div class="h-56 sm:h-64">
          <Line :data="chartData" :options="chartOptions as never" />
        </div>

        <details>
          <summary class="cursor-pointer text-caption text-ink-muted marker:text-ink-soft hover:text-ink">看每一年的數字（基準）</summary>
          <DataTable variant="compact" class="mt-1" table-class="min-w-[40rem]">
            <template #head>
              <tr>
                <th>第幾年</th>
                <th>資產</th>
                <th>自己投入</th>
                <th>當年股利（扣款前）</th>
                <th>扣掉的健保與稅</th>
                <th>之後每月可領</th>
                <th v-if="inputs.inflationOn">今天的錢</th>
              </tr>
            </template>
            <tr v-for="row in scenarios.base" :key="row.year">
              <td class="text-ink-soft">{{ row.year === 0 ? '現在' : row.year }}</td>
              <td class="text-ink-soft">{{ money(row.value) }}</td>
              <td class="text-ink-muted">{{ money(row.invested) }}</td>
              <td class="text-ink-soft">{{ row.year === 0 ? '—' : money(row.dividendsGross) }}</td>
              <td :class="row.deducted < 0 ? 'text-down' : 'text-ink-muted'">{{ row.year === 0 ? '—' : row.deducted < 0 ? `退 ${money(-row.deducted)}` : money(row.deducted) }}</td>
              <td class="text-accent">{{ money(row.monthlyIncome) }}</td>
              <td v-if="inputs.inflationOn" class="text-ink-muted">{{ money(row.realMonthlyIncome) }}</td>
            </tr>
          </DataTable>
        </details>
      </template>
      <p v-else-if="!basket" class="text-caption text-ink-muted">先選持股組合，或自選一檔股票。</p>
      <p v-else class="text-caption text-ink-muted">金額要是數字、年數 1～40、股價漲幅與股利成長 −20～30%、通膨 0～20%。</p>
    </section>

    <!-- 3. 比較兩檔（2026-11-11 使用者要求）：共用上面的條件 -->
    <IncomeCompare :base="sharedParams" :yield-basis="inputs.yieldBasis" />

    <p class="text-caption text-ink-muted">
      試算不是預測：殖利率、股價、配息都會變，配息也可能減少。股利依配息頻率入帳，當月新投入的錢下個月才開始領；沒算手續費與匯率變動。所得稅以國稅局為準。
    </p>
  </div>
</template>
