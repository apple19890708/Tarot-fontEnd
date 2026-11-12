<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import DataTable from '../DataTable.vue'
import HelpTip from '../HelpTip.vue'
import SelectField from '../SelectField.vue'
import CheckboxField from '../CheckboxField.vue'
import DividendStockPicker from './DividendStockPicker.vue'
import { formatNumber } from '../../lib/marketChart'
import { BASIS_OPTIONS, BRACKET_OPTIONS, payoutsOf, simulate, TAX_OPTIONS, yieldOf, type TaxMode, type YieldBasis } from '../../lib/incomeSim'
import type { DividendProfile, IncomeFrequency, IncomeSettings } from '../../types'

// 存股試算的「比較兩檔」（2026-11-11 使用者要求：左右兩個框，選兩支股票、自行設定條件比較獲利，針對結果算優劣）。
// - 條件自己一套（一開始有、每月投入、存幾年、再投入、通膨、所得稅、殖利率基準），和上面的試算分開
//   （2026-11-11 使用者：「上下分開，不要混為一談」；原本沿用上面的設定，看的人找不到在哪裡改）
// - 兩檔共用這一套條件，比較才公平；每一檔各自的假設只有股價年漲幅、股利年成長（不同股票的成長性不同）
// - 結果用同一個 simulate（lib/incomeSim.ts）算；優劣是拿兩邊的數字比，不是預測
// settings：二代健保與美股預扣（後端的扣款設定）
const props = defineProps<{ settings: IncomeSettings }>()

// 比較用的共同條件（存在自己的 key，不讀寫試算的 market-income-sim）
interface CompareInputs {
  start: string
  monthlyInvest: string
  years: string
  inflationOn: boolean
  inflation: string
  reinvest: boolean
  yieldBasis: YieldBasis
  taxMode: TaxMode
  taxBracket: string
}
const INPUTS_KEY = 'market-income-compare-inputs'
const INPUT_DEFAULTS: CompareInputs = {
  start: '0',
  monthlyInvest: '10000',
  years: '10',
  inflationOn: true,
  inflation: '2',
  reinvest: true,
  yieldBasis: 'average',
  taxMode: 'none',
  taxBracket: '0.12',
}
function readInputs(): CompareInputs {
  try {
    return { ...INPUT_DEFAULTS, ...(JSON.parse(localStorage.getItem(INPUTS_KEY) || '{}') as Partial<CompareInputs>) }
  } catch {
    return { ...INPUT_DEFAULTS }
  }
}
const inputs = ref<CompareInputs>(readInputs())
watch(
  inputs,
  (value) => {
    try {
      localStorage.setItem(INPUTS_KEY, JSON.stringify(value))
    } catch {
      // 存不了只是下次不記得
    }
  },
  { deep: true },
)

interface SideInput {
  market: 'tw' | 'us'
  query: string
  priceGrowth: string
  dividendGrowth: string
}
const STORE_KEY = 'market-income-compare'
const EMPTY: SideInput = { market: 'tw', query: '', priceGrowth: '0', dividendGrowth: '0' }
function readSides(): [SideInput, SideInput] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') as Partial<SideInput>[]
    return [{ ...EMPTY, ...saved[0] }, { ...EMPTY, ...saved[1] }]
  } catch {
    return [{ ...EMPTY }, { ...EMPTY }]
  }
}
const sides = ref<[SideInput, SideInput]>(readSides())
watch(
  sides,
  (value) => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(value))
    } catch {
      // 存不了只是下次不記得
    }
  },
  { deep: true },
)
const profiles = ref<[DividendProfile | null, DividendProfile | null]>([null, null])
const LABELS = ['A', 'B'] as const

const num = (text: string, min: number, max: number) => {
  const value = Number(String(text).replace(/,/g, ''))
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}
const FREQUENCY_LABELS: Record<IncomeFrequency, string> = { monthly: '月配', quarterly: '季配', semiannual: '半年配', annual: '年配', none: '沒有配息' }

// 兩檔共用的條件；輸入不合法是 null
const base = computed(() => {
  const v = inputs.value
  const start = num(v.start, 0, 1e10)
  const monthly = num(v.monthlyInvest, 0, 1e8)
  const years = num(v.years, 1, 40)
  const inflation = v.inflationOn ? num(v.inflation, 0, 20) : 0
  if (start === null || monthly === null || !years || inflation === null) return null
  const deductions = { ...props.settings, taxMode: v.taxMode, taxBracket: Number(v.taxBracket) || 0.12 }
  return { start, monthly, years, inflation, reinvest: v.reinvest, deductions }
})

// 每一邊的試算結果；選了股票、條件合法才有
const results = computed(() =>
  sides.value.map((side, index) => {
    const pf = profiles.value[index]
    const shared = base.value
    if (!pf || !shared) return null
    const y = yieldOf(pf, inputs.value.yieldBasis)
    const priceGrowth = num(side.priceGrowth, -20, 30)
    const dividendGrowth = num(side.dividendGrowth, -20, 30)
    if (!y || priceGrowth === null || dividendGrowth === null) return null
    if (!pf.price || (pf.target.market === 'us' && !pf.usdTwd)) return null
    const rows = simulate({ ...shared, priceGrowth, dividendGrowth, holdings: [{ weight: 1, yieldPct: y.pct, payouts: payoutsOf(pf.frequency), market: pf.target.market }] })
    const last = rows[rows.length - 1]!
    const gross = rows.reduce((sum, row) => sum + row.dividendsGross, 0)
    const deducted = rows.reduce((sum, row) => sum + row.deducted, 0)
    const ending = last.value + last.cashOut
    // 近一年殖利率比多年平均高多少（相對 %）：高很多代表近一年是高點，拿來試算容易高估
    const average = pf.dividendAverage?.yieldPct ?? null
    const recentGap = average && pf.currentYield ? ((pf.currentYield - average) / average) * 100 : null
    return {
      name: pf.target.name,
      code: pf.target.code || pf.target.symbol || '',
      market: pf.target.market,
      yield: y,
      frequency: pf.frequency,
      last,
      gross,
      deducted,
      deductRate: gross > 0 ? (deducted / gross) * 100 : 0,
      ending,
      gain: ending - last.invested,
      gainPct: last.invested > 0 ? ((ending - last.invested) / last.invested) * 100 : null,
      recentGap,
      priceGrowth,
    }
  }),
)
type Result = NonNullable<(typeof results.value)[number]>
const both = computed(() => (results.value[0] && results.value[1] ? ([results.value[0], results.value[1]] as [Result, Result]) : null))

const money = (value: number) => formatNumber(Math.round(value), 0)
const pct = (value: number | null, digits = 1) => (value === null ? '—' : `${formatNumber(value, digits)}%`)

// 比較表：每一列兩邊的值；better 決定誰比較好（higher：大的好、lower：小的好、null：不比）
const rows = computed(() => {
  const pair = both.value
  if (!pair) return []
  const [a, b] = pair
  const line = (label: string, av: number, bv: number, text: (v: number) => string, better: 'higher' | 'lower' | null) => {
    const winner = better === null || Math.abs(av - bv) < 1e-9 ? null : (better === 'higher' ? av > bv : av < bv) ? 0 : 1
    return { label, values: [text(av), text(bv)], winner }
  }
  const years = a.last.year
  return [
    line('殖利率（扣款前）', a.yield.pct, b.yield.pct, (v) => pct(v, 2), null),
    line(`${years} 年後資產`, a.last.value, b.last.value, money, 'higher'),
    ...(base.value?.reinvest ? [] : [line('這段期間領出', a.last.cashOut, b.last.cashOut, money, 'higher')]),
    line('總報酬（扣掉自己投入）', a.gain, b.gain, money, 'higher'),
    line('總報酬率', a.gainPct ?? 0, b.gainPct ?? 0, (v) => pct(v), 'higher'),
    line('期間領到的股利（扣款前）', a.gross, b.gross, money, 'higher'),
    line('被扣的健保與稅', a.deducted, b.deducted, money, 'lower'),
    line('之後每月可領（扣款後）', a.last.monthlyIncome, b.last.monthlyIncome, money, 'higher'),
    ...(base.value && base.value.inflation > 0 ? [line('每月可領（今天的錢）', a.last.realMonthlyIncome, b.last.realMonthlyIncome, money, 'higher')] : []),
  ]
})

// 優劣分析：拿上面的數字比，產生幾點結論（不是預測）
const analysis = computed(() => {
  const pair = both.value
  if (!pair) return null
  const [a, b] = pair
  const name = (i: number) => `${LABELS[i]}（${pair[i]!.name}）`
  const points: { tone: 'ok' | 'warn' | 'info'; text: string }[] = []
  const diffText = (x: number, y: number) => `${money(Math.abs(x - y))} 元（${pct(Math.min(x, y) > 0 ? (Math.abs(x - y) / Math.min(x, y)) * 100 : null)}）`

  const endingWinner = a.ending === b.ending ? null : a.ending > b.ending ? 0 : 1
  if (endingWinner !== null) points.push({ tone: 'ok', text: `累積資產：${name(endingWinner)} 期末多 ${diffText(a.ending, b.ending)}。` })
  const incomeWinner = Math.round(a.last.monthlyIncome) === Math.round(b.last.monthlyIncome) ? null : a.last.monthlyIncome > b.last.monthlyIncome ? 0 : 1
  if (incomeWinner !== null) points.push({ tone: 'ok', text: `現金流：${name(incomeWinner)} 之後每月多領 ${diffText(a.last.monthlyIncome, b.last.monthlyIncome)}。` })

  // 扣款比例差很多（美股 30% 預扣、健保門檻）
  if (Math.abs(a.deductRate - b.deductRate) >= 1) {
    const worse = a.deductRate > b.deductRate ? 0 : 1
    const why = pair[worse]!.market === 'us' ? '美股股利預扣稅' : '單次配息超過健保門檻、或所得稅'
    points.push({ tone: 'warn', text: `扣款：${name(worse)} 股利被扣 ${pct(pair[worse]!.deductRate)}，另一檔 ${pct(pair[1 - worse]!.deductRate)}（${why}）。` })
  }
  // 近一年殖利率比平均高很多：用近一年試算容易高估
  pair.forEach((r, i) => {
    if (r.recentGap !== null && r.recentGap >= 15) {
      points.push({ tone: 'warn', text: `${name(i)} 近一年殖利率比多年平均高 ${pct(r.recentGap, 0)}，配息可能正在高點，選「近 12 個月」試算會偏樂觀。` })
    }
    if (r.yield.fallback) points.push({ tone: 'info', text: `${name(i)} 股利紀錄不滿 1 年，只能用近 12 個月，數字比較不穩。` })
  })
  // 公平性：兩檔股價漲幅都填 0 時只比得到股利，殖利率高的一定贏；靠股價成長的股票要填漲幅才公平
  const [hi, lo] = a.yield.pct >= b.yield.pct ? [0, 1] : [1, 0]
  if (a.priceGrowth === 0 && b.priceGrowth === 0 && pair[lo]!.yield.pct > 0 && pair[hi]!.yield.pct / pair[lo]!.yield.pct >= 1.5) {
    points.push({
      tone: 'info',
      text: `兩檔的股價漲幅都填 0，等於只比股利，殖利率高的 ${name(hi)} 一定比較有利；${name(lo)} 如果是靠股價成長的股票，要填上假設的股價漲幅才公平。`,
    })
  }
  if (a.frequency !== b.frequency) {
    points.push({ tone: 'info', text: `配息頻率：A ${FREQUENCY_LABELS[a.frequency]}、B ${FREQUENCY_LABELS[b.frequency]}；配得越頻繁，領出來花的現金流越平均。` })
  }

  let conclusion: string
  if (endingWinner === null && incomeWinner === null) conclusion = '兩檔在這組條件下的結果差不多。'
  else if (endingWinner === incomeWinner || incomeWinner === null) conclusion = `在這組條件下，${name(endingWinner!)} 比較好。`
  else if (endingWinner === null) conclusion = `在這組條件下，${name(incomeWinner)} 比較好。`
  else conclusion = `要累積資產選 ${name(endingWinner)}；要之後月領現金流選 ${name(incomeWinner)}。`
  return { conclusion, points }
})

const LABEL_CLASS = 'inline-flex w-[8.5em] shrink-0 items-center gap-1 text-ink-muted'
const INPUT_CLASS =
  'min-w-0 w-0 flex-1 border-2 border-tint/10 bg-tint/5 px-2.5 py-1.5 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40'
const TONE_CLASS = { ok: 'text-ok', warn: 'text-warn', info: 'text-ink-soft' } as const
</script>

<template>
  <section class="space-y-3">
    <p class="flex items-center gap-1 font-semibold text-ink">比較兩檔<HelpTip term="simCompare" /></p>
    <p class="text-caption text-ink-muted">這一段的條件自己設定，和上面的試算互不影響。下面的條件兩檔共用；股價漲幅與股利成長每一檔各自填。</p>

    <!-- 兩檔共用的條件（和上面的試算分開存） -->
    <div class="space-y-2 border-2 border-tint/10 bg-tint/5 p-3">
      <p class="text-ink-muted">比較條件</p>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">一開始有</span><input v-model="inputs.start" inputmode="numeric" :class="INPUT_CLASS" aria-label="比較：一開始有多少元" /><span class="w-[1em] text-ink-muted">元</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">每月投入</span><input v-model="inputs.monthlyInvest" inputmode="numeric" :class="INPUT_CLASS" aria-label="比較：每月投入多少元" /><span class="w-[1em] text-ink-muted">元</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">存幾年</span><input v-model="inputs.years" inputmode="numeric" :class="INPUT_CLASS" aria-label="比較：存幾年" /><span class="w-[1em] text-ink-muted">年</span></label>
        <label class="flex items-center gap-2"><span :class="LABEL_CLASS">每年通膨<HelpTip term="simInflation" /></span><input v-model="inputs.inflation" inputmode="decimal" :disabled="!inputs.inflationOn" :class="INPUT_CLASS" class="disabled:opacity-50" aria-label="比較：每年通膨" /><span class="w-[1em] text-ink-muted">%</span></label>
        <div class="flex min-w-0 items-center gap-2">
          <span :class="LABEL_CLASS">殖利率用哪一段<HelpTip term="simYieldBasis" /></span>
          <SelectField v-model="inputs.yieldBasis" :options="BASIS_OPTIONS" label="比較：殖利率用哪一段" variant="pixel" hide-label class="min-w-0 flex-1" />
          <!-- 佔住單位欄的寬度，下拉右緣才和上面輸入框對齊（2026-11-12 使用者回報下拉比輸入框長） -->
          <span class="w-[1em] shrink-0" aria-hidden="true" />
        </div>
        <!-- 合併計稅多一個級距下拉：兩個下拉放不下標籤右邊時（手機）整組換到下一行 -->
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <span :class="LABEL_CLASS">股利所得稅<HelpTip term="simDeduction" /></span>
          <div class="flex min-w-0 flex-1 gap-2" :class="inputs.taxMode === 'combined' ? 'min-w-[13rem]' : ''">
            <SelectField v-model="inputs.taxMode" :options="TAX_OPTIONS" label="比較：股利所得稅" variant="pixel" hide-label class="min-w-0 flex-1" />
            <SelectField v-if="inputs.taxMode === 'combined'" v-model="inputs.taxBracket" :options="BRACKET_OPTIONS" label="比較：合併計稅級距" variant="pixel" hide-label class="min-w-0 flex-1" />
          </div>
          <span class="w-[1em] shrink-0" aria-hidden="true" />
        </div>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <CheckboxField v-model="inputs.reinvest">領到的股利再投入（不領出來花）</CheckboxField>
        <CheckboxField v-model="inputs.inflationOn">換算成今天的錢</CheckboxField>
      </div>
      <p v-if="!base" class="text-caption text-warn">金額要是數字、年數 1～40、通膨 0～20%。</p>
    </div>

    <!-- 左右兩個框（手機上下排） -->
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div v-for="(side, index) in sides" :key="index" class="min-w-0 space-y-2 border-2 border-tint/10 bg-tint/5 p-3">
        <p class="font-pixel text-button text-accent">{{ LABELS[index] }}</p>
        <DividendStockPicker
          v-model:market="side.market"
          v-model:query="side.query"
          :profile="profiles[index] ?? null"
          @update:profile="profiles[index] = $event"
          submit-label="查詢"
        />
        <label class="flex items-center gap-2">
          <span class="inline-flex w-[8.5em] shrink-0 items-center gap-1 text-ink-muted">假設股價年漲幅<HelpTip term="simGrowth" /></span>
          <input v-model="side.priceGrowth" inputmode="decimal" :class="INPUT_CLASS" :aria-label="`${LABELS[index]} 假設股價年漲幅`" />
          <span class="w-[1em] text-ink-muted">%</span>
        </label>
        <label class="flex items-center gap-2">
          <span class="inline-flex w-[8.5em] shrink-0 items-center gap-1 text-ink-muted">假設股利年成長<HelpTip term="simDividendGrowth" /></span>
          <input v-model="side.dividendGrowth" inputmode="decimal" :class="INPUT_CLASS" :aria-label="`${LABELS[index]} 假設股利年成長`" />
          <span class="w-[1em] text-ink-muted">%</span>
        </label>
        <p v-if="results[index]" class="text-caption text-ink-muted">
          {{ FREQUENCY_LABELS[results[index]!.frequency] }}，殖利率 {{ pct(results[index]!.yield.pct, 2) }}（{{ results[index]!.yield.label }}）
        </p>
      </div>
    </div>

    <template v-if="both">
      <DataTable table-class="min-w-[28rem]">
        <template #head>
          <tr>
            <th>項目</th>
            <th>A {{ both[0].name }}</th>
            <th>B {{ both[1].name }}</th>
          </tr>
        </template>
        <tr v-for="row in rows" :key="row.label">
          <th scope="row" class="text-ink-soft">{{ row.label }}</th>
          <td v-for="(value, i) in row.values" :key="i" class="whitespace-nowrap" :class="row.winner === i ? 'font-semibold text-accent' : 'text-ink-soft'">
            {{ value }}<span v-if="row.winner === i" class="ml-1 text-caption" aria-label="比較好">▲</span>
          </td>
        </tr>
      </DataTable>

      <div v-if="analysis" class="space-y-1.5 border-2 border-accent-hue/30 bg-accent-hue/[0.06] px-3 py-2">
        <p class="font-semibold text-ink">{{ analysis.conclusion }}</p>
        <ul class="space-y-1 text-body">
          <li v-for="(point, i) in analysis.points" :key="i" :class="TONE_CLASS[point.tone]">・{{ point.text }}</li>
        </ul>
        <p class="text-caption text-ink-muted">優劣是拿這組條件算出來的數字比較，不是預測；條件一改，結論可能就不同。</p>
      </div>
    </template>
    <p v-else-if="base" class="text-caption text-ink-muted">左右各選一檔股票，就會列出比較。</p>
  </section>
</template>
