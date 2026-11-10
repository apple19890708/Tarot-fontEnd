<script setup lang="ts">
import { computed, ref } from 'vue'

import { createWatch, screenMarket } from '../../lib/api'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { useCooldown } from '../../lib/useCooldown'
import SkeletonBlock from '../SkeletonBlock.vue'
import CheckboxField from '../CheckboxField.vue'
import type { MarketScreenFilters, MarketScreenResult, MarketScreenRow, MarketScreenSort } from '../../types'

// 選股：用估值、營收、籌碼、價量、技術面條件從全市場（上市＋上櫃）篩選。篩選與排序在後端做，
// 這裡只負責條件表單與結果表格；結果可以直接加入自訂追蹤
type NumberKey = Exclude<keyof MarketScreenFilters, 'includeEtf' | 'aboveMa60' | 'bullishMa' | 'sort'>

// 輸入框用字串，送出前轉數字（空白就不篩）
const numbers = ref<Record<NumberKey, string>>({
  peMax: '',
  yieldMin: '',
  pbMax: '',
  revenueYoyMin: '',
  revenueCumYoyMin: '',
  foreignStreakMin: '',
  trustStreakMin: '',
  priceMin: '',
  priceMax: '',
  volumeMin: '',
  rsiMin: '',
  rsiMax: '',
})
const flags = ref({ includeEtf: false, aboveMa60: false, bullishMa: false })
const sort = ref<MarketScreenSort>('dividendYield')

const GROUPS: { title: string; fields: { key: NumberKey; label: string; unit: string }[] }[] = [
  {
    title: '估值',
    fields: [
      { key: 'peMax', label: '本益比 ≤', unit: '倍' },
      { key: 'yieldMin', label: '殖利率 ≥', unit: '%' },
      { key: 'pbMax', label: '股價淨值比 ≤', unit: '倍' },
    ],
  },
  {
    title: '月營收',
    fields: [
      { key: 'revenueYoyMin', label: '年增 ≥', unit: '%' },
      { key: 'revenueCumYoyMin', label: '累計年增 ≥', unit: '%' },
    ],
  },
  {
    title: '籌碼',
    fields: [
      { key: 'foreignStreakMin', label: '外資連買 ≥', unit: '日' },
      { key: 'trustStreakMin', label: '投信連買 ≥', unit: '日' },
    ],
  },
  {
    title: '價量',
    fields: [
      { key: 'priceMin', label: '股價 ≥', unit: '元' },
      { key: 'priceMax', label: '股價 ≤', unit: '元' },
      { key: 'volumeMin', label: '成交量 ≥', unit: '張' },
    ],
  },
]

const SORTS: { value: MarketScreenSort; label: string }[] = [
  { value: 'dividendYield', label: '殖利率' },
  { value: 'pe', label: '本益比' },
  { value: 'pb', label: '股價淨值比' },
  { value: 'revenueYoy', label: '營收年增' },
  { value: 'foreignStreak', label: '外資連買' },
  { value: 'volume', label: '成交量' },
  { value: 'changePct', label: '漲跌幅' },
]

// 常用組合：按一下帶入條件
const PRESETS: { label: string; numbers: Partial<Record<NumberKey, string>>; flags?: Partial<typeof flags.value>; sort: MarketScreenSort }[] = [
  { label: '高殖利率存股', numbers: { yieldMin: '5', peMax: '15', revenueYoyMin: '0' }, sort: 'dividendYield' },
  { label: '營收成長', numbers: { revenueYoyMin: '20', revenueCumYoyMin: '10', volumeMin: '500' }, sort: 'revenueYoy' },
  { label: '法人連買', numbers: { foreignStreakMin: '3', volumeMin: '1000' }, flags: { aboveMa60: true }, sort: 'foreignStreak' },
  { label: '低股價淨值比', numbers: { pbMax: '1', peMax: '12' }, sort: 'pb' },
]

function applyPreset(preset: (typeof PRESETS)[number]) {
  for (const key of Object.keys(numbers.value) as NumberKey[]) numbers.value[key] = preset.numbers[key] ?? ''
  flags.value = { includeEtf: false, aboveMa60: false, bullishMa: false, ...preset.flags }
  sort.value = preset.sort
  void run()
}

function reset() {
  for (const key of Object.keys(numbers.value) as NumberKey[]) numbers.value[key] = ''
  flags.value = { includeEtf: false, aboveMa60: false, bullishMa: false }
  sort.value = 'dividendYield'
  result.value = null
  status.value = 'idle'
}

// ---- 篩選 ----
const result = ref<MarketScreenResult | null>(null)
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const error = ref('')
let requestId = 0

// 後端每人每分鐘最多 10 次，前端每次篩選後冷卻 6 秒，常用組合與重試也一樣
const cooldown = useCooldown(6, 'market-screen')
const busy = computed(() => status.value === 'loading' || cooldown.active.value)
function run() {
  if (busy.value) return
  void cooldown.run(doRun)
}

async function doRun() {
  const filters: MarketScreenFilters = { ...flags.value, sort: sort.value }
  for (const [key, value] of Object.entries(numbers.value) as [NumberKey, string][]) {
    if (!value.trim()) continue
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) {
      error.value = '條件只能填 0 以上的數字。'
      status.value = 'error'
      return
    }
    filters[key] = n
  }
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    const { result: data } = await screenMarket(filters)
    if (id !== requestId) return
    result.value = data
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '選股失敗'
    status.value = 'error'
  }
}

// ---- 加入追蹤 ----
const addState = ref<Record<string, 'saving' | 'saved' | string>>({})
async function addToWatchlist(row: MarketScreenRow) {
  addState.value = { ...addState.value, [row.code]: 'saving' }
  try {
    await createWatch({
      market: 'tw',
      query: row.code,
      target: { symbol: `${row.code}.${row.exchange === 'otc' ? 'TWO' : 'TW'}`, code: row.code, exchange: row.exchange, market: 'tw', kind: 'stock', name: row.name },
    })
    addState.value = { ...addState.value, [row.code]: 'saved' }
  } catch (err) {
    addState.value = { ...addState.value, [row.code]: err instanceof Error ? err.message : '加入失敗' }
  }
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}
const streakText = (value: number | null) => (value === null || value === 0 ? '—' : `${value > 0 ? '買' : '賣'} ${Math.abs(value)}`)

const INPUT = 'w-20 min-w-0 border-2 border-tint/10 bg-tint/5 px-2 py-1 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted/50 focus:border-accent-hue/40'
</script>

<template>
  <section class="space-y-5 border-2 border-tint/10 bg-surface p-4 sm:p-6">
    <div>
      <p class="text-caption uppercase tracking-[0.2em] text-ink-muted sm:tracking-[0.3em]">Screener</p>
      <h2 class="mt-1 text-title font-semibold text-ink">選股</h2>
      <p class="mt-1 text-body text-ink-muted">
        從上市、上櫃全部股票裡，用估值、月營收、籌碼、價量與技術面條件篩選。資料是最新一個交易日的收盤（估值、價量）與最新公布的月營收。
      </p>
    </div>

    <!-- ── 常用組合 ── -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-caption text-ink-muted">常用組合</span>
      <button
        v-for="preset in PRESETS"
        :key="preset.label"
        type="button"
        class="cursor-pointer border border-accent-hue/30 px-2.5 py-1 text-button text-accent transition hover:bg-accent-hue/10 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="busy"
        @click="applyPreset(preset)"
      >
        {{ preset.label }}
      </button>
    </div>

    <!-- ── 條件 ── -->
    <form class="space-y-3" @submit.prevent="run">
      <div class="grid gap-3 sm:grid-cols-2">
        <fieldset v-for="group in GROUPS" :key="group.title" class="space-y-1.5 border border-tint/10 p-2.5">
          <legend class="px-1 text-caption text-ink-muted">{{ group.title }}</legend>
          <label v-for="field in group.fields" :key="field.key" class="flex items-center gap-2 text-body text-ink-muted">
            <span class="w-[7em] shrink-0 whitespace-nowrap">{{ field.label }}</span>
            <input v-model="numbers[field.key]" inputmode="decimal" :class="INPUT" :aria-label="`${group.title}：${field.label}`" />
            <span class="text-ink-muted">{{ field.unit }}</span>
          </label>
        </fieldset>
      </div>
      <fieldset class="space-y-1.5 border border-tint/10 p-2.5">
        <legend class="px-1 text-caption text-ink-muted">技術面（只檢查前 30 檔，會比較慢）</legend>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body text-ink-muted">
          <CheckboxField v-model="flags.aboveMa60">站上季線（MA60）</CheckboxField>
          <CheckboxField v-model="flags.bullishMa">均線多頭排列</CheckboxField>
          <label class="flex items-center gap-1.5">
            RSI
            <input v-model="numbers.rsiMin" inputmode="decimal" :class="INPUT" class="w-14" placeholder="下限" aria-label="RSI 下限" />
            ～
            <input v-model="numbers.rsiMax" inputmode="decimal" :class="INPUT" class="w-14" placeholder="上限" aria-label="RSI 上限" />
          </label>
        </div>
      </fieldset>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-button">
        <CheckboxField v-model="flags.includeEtf">包含 ETF</CheckboxField>
        <div class="flex flex-wrap items-center gap-1">
          <span class="text-ink-muted">排序</span>
          <button
            v-for="option in SORTS"
            :key="option.value"
            type="button"
            class="cursor-pointer border px-2 py-0.5 text-button transition"
            :class="sort === option.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
            @click="sort = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          class="cursor-pointer touch-manipulation border-2 border-accent-hue/40 bg-accent-hue/15 px-4 py-2 text-button text-accent shadow-[3px_3px_0_var(--c-shade)] transition hover:bg-accent-hue/25 active:translate-x-[3px] active:translate-y-[3px] active:bg-accent-hue/30 active:shadow-none disabled:translate-x-[3px] disabled:translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none font-pixel"
          :disabled="busy"
        >
          {{ status === 'loading' ? '篩選中…' : cooldown.active.value ? `開始篩選（${cooldown.remaining.value}）` : '開始篩選' }}
        </button>
        <button type="button" class="cursor-pointer border-2 border-tint/15 px-3 py-2 text-button text-ink-muted transition hover:bg-tint/10 font-pixel" @click="reset">清除條件</button>
      </div>
    </form>

    <!-- ── 結果 ── -->
    <p v-if="status === 'idle'" class="text-body text-ink-muted">設定條件後按「開始篩選」，或直接點上面的常用組合。</p>

    <!-- 載入中：摘要列＋表格 -->
    <div v-else-if="status === 'loading'" class="space-y-2">
      <SkeletonBlock class="h-4 w-72 max-w-full rounded-none" />
      <SkeletonBlock class="h-6 w-full rounded-none opacity-60" />
      <SkeletonBlock v-for="n in 8" :key="n" class="h-7 w-full rounded-none" />
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">
      <span>{{ error }}</span>
      <button type="button" class="cursor-pointer border-2 border-danger-hue/30 px-3 py-1 text-button disabled:opacity-60 font-pixel" :disabled="busy" @click="run">
        {{ cooldown.active.value ? `重試（${cooldown.remaining.value}）` : '重試' }}
      </button>
    </div>

    <template v-else-if="result">
      <p class="text-body text-ink-muted">
        全市場 {{ result.universeSize }} 檔，符合 {{ result.total }} 檔
        <template v-if="result.technicalChecked">，技術面檢查前 {{ result.technicalChecked }} 檔後剩 {{ result.results.length }} 檔</template>
        <template v-else-if="result.total > result.results.length">，顯示前 {{ result.results.length }} 檔</template>。
        <span class="text-ink-muted">價量資料 {{ result.quoteDate }}<template v-if="result.chipDays">，籌碼用最近 {{ result.chipDays }} 個交易日（上櫃只有 1 日）</template></span>
      </p>
      <p v-for="note in result.notes" :key="note" class="text-body text-accent">{{ note }}</p>

      <p v-if="!result.results.length" class="text-body text-ink-muted">沒有符合的股票，試著放寬條件。</p>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[46rem] text-body tabular-nums">
          <thead>
            <tr class="border-b border-tint/10 text-left text-ink-muted">
              <th class="py-1.5 pr-3 font-normal">股票</th>
              <th class="py-1.5 pr-3 text-right font-normal">收盤</th>
              <th class="py-1.5 pr-3 text-right font-normal">漲跌</th>
              <th class="py-1.5 pr-3 text-right font-normal">本益比</th>
              <th class="py-1.5 pr-3 text-right font-normal">殖利率</th>
              <th class="py-1.5 pr-3 text-right font-normal">淨值比</th>
              <th class="py-1.5 pr-3 text-right font-normal">營收年增</th>
              <th class="py-1.5 pr-3 text-right font-normal">外資</th>
              <th class="py-1.5 pr-3 text-right font-normal">成交量</th>
              <th class="py-1.5 font-normal" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.results" :key="row.code" class="border-b border-tint/5 text-ink-soft">
              <td class="py-1.5 pr-3">
                {{ row.name }} <span class="text-ink-muted">{{ row.code }}</span>
                <span v-if="row.exchange === 'otc'" class="ml-1 text-caption text-ink-muted">上櫃</span>
              </td>
              <td class="py-1.5 pr-3 text-right">{{ formatNumber(row.close) }}</td>
              <td class="py-1.5 pr-3 text-right" :class="trendClass(row.changePct)">{{ formatSigned(row.changePct, '%') }}</td>
              <td class="py-1.5 pr-3 text-right">{{ formatNumber(row.pe) }}</td>
              <td class="py-1.5 pr-3 text-right">{{ row.dividendYield === null ? '—' : `${formatNumber(row.dividendYield)}%` }}</td>
              <td class="py-1.5 pr-3 text-right">{{ formatNumber(row.pb) }}</td>
              <td class="py-1.5 pr-3 text-right" :class="trendClass(row.revenueYoy)">{{ formatSigned(row.revenueYoy, '%') }}</td>
              <td class="py-1.5 pr-3 text-right" :class="trendClass(row.foreignStreak)">{{ streakText(row.foreignStreak) }}</td>
              <td class="py-1.5 pr-3 text-right">{{ formatNumber(row.volume, 0) }}</td>
              <td class="py-1.5 text-right">
                <span v-if="addState[row.code] === 'saved'" class="text-down-ink">已加入</span>
                <button
                  v-else
                  type="button"
                  class="cursor-pointer whitespace-nowrap border border-tint/15 px-2 py-0.5 text-button text-ink-muted transition hover:bg-tint/10 disabled:opacity-50"
                  :disabled="addState[row.code] === 'saving'"
                  :title="addState[row.code] && addState[row.code] !== 'saving' ? addState[row.code] : undefined"
                  @click="addToWatchlist(row)"
                >
                  {{ addState[row.code] === 'saving' ? '加入中…' : addState[row.code] ? '重試' : '加入追蹤' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-caption text-ink-muted">篩選結果只是條件比對，不是投資建議。殖利率、本益比來自證交所與櫃買中心公布的資料，個別公司可能有異常值。</p>
    </template>
  </section>
</template>
