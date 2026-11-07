<script setup lang="ts">
import { computed } from 'vue'
import HelpTip from '../HelpTip.vue'

import MarketBacktestChart from './MarketBacktestChart.vue'
import MarketPredictionChart from './MarketPredictionChart.vue'
import MarketStrategyChart from './MarketStrategyChart.vue'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { signalGlossaryKeys } from '../../lib/marketGlossary'
import type { MarketResearch, MarketSignalBacktest, MarketStrategyResult } from '../../types'

// 歷史回測、策略比較、機器學習預測。數字全由後端算好，這裡只排版、貼標籤與上色。
// 用語一律白話（看的人不一定學過技術分析）：年化→平均每年、最大回落→最慘時從高點跌、買進持有→買了一直抱著。
const props = defineProps<{
  research: MarketResearch
}>()

function pct(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? '—' : `${formatNumber(value, digits)}%`
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-soft'
  return value > 0 ? 'text-up' : 'text-down'
}

// ---- 訊號回測：每個訊號的 10 日上漲機率和「隨便挑一天買」比 ----
// 門檻和名詞說明一致：差 5 個百分點以上才算有差（marketGlossary 的 backtest）
type Edge = 'better' | 'same' | 'worse'
const EDGE_LABELS: Record<Edge, string> = { better: '比平常更常漲', same: '跟平常差不多', worse: '比平常更常跌' }
const EDGE_STYLES: Record<Edge, string> = {
  better: 'border-up-hue/40 bg-up-hue/10 text-up-ink',
  same: 'border-tint/15 bg-tint/5 text-ink-soft',
  worse: 'border-down-hue/40 bg-down-hue/10 text-down-ink',
}

const baselineOf = (days: number) => props.research.backtest?.baseline.find((b) => b.days === days) ?? null
const baseline10 = computed(() => baselineOf(10)?.winRate ?? null)

const win10 = (signal: MarketSignalBacktest) => signal.horizons.find((h) => h.days === 10) ?? null

function diffOf(signal: MarketSignalBacktest) {
  const rate = win10(signal)?.winRate
  if (rate === null || rate === undefined || baseline10.value === null) return null
  return rate - baseline10.value
}

function edgeOf(signal: MarketSignalBacktest): Edge | null {
  const diff = diffOf(signal)
  if (diff === null) return null
  if (diff >= 5) return 'better'
  if (diff <= -5) return 'worse'
  return 'same'
}

// 「高 3.2」「低 4」：和平常差幾個百分點
function diffText(signal: MarketSignalBacktest) {
  const diff = diffOf(signal)
  if (diff === null) return ''
  if (Math.abs(diff) < 0.05) return '一樣'
  return `${diff > 0 ? '高' : '低'} ${formatNumber(Math.abs(diff), 1)}`
}

// 平均漲跌：正的寫「漲」、負的寫「跌」
function moveText(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (value === 0) return '持平'
  return `${value > 0 ? '漲' : '跌'} ${formatNumber(Math.abs(value), 2)}%`
}

// 重點整理：只算次數夠多的訊號
const signalCounts = computed(() => {
  const counts: Record<Edge, number> = { better: 0, same: 0, worse: 0 }
  let few = 0
  for (const signal of props.research.backtest?.signals ?? []) {
    const edge = edgeOf(signal)
    if (!signal.sufficient || !edge) few += 1
    else counts[edge] += 1
  }
  return { ...counts, few }
})

// ---- 策略回測：每個照規則買賣的做法和「買了一直抱著」比總報酬 ----
const buyHold = computed(() => props.research.strategies?.strategies.find((s) => s.key === 'buyHold') ?? null)
const activeStrategies = computed(() =>
  [...(props.research.strategies?.strategies ?? [])]
    .filter((s) => s.key !== 'buyHold')
    .sort((a, b) => (b.totalReturn ?? -Infinity) - (a.totalReturn ?? -Infinity)),
)
const bestStrategy = computed(() => activeStrategies.value[0] ?? null)

function beatsBuyHold(strategy: MarketStrategyResult): boolean | null {
  const base = buyHold.value?.totalReturn
  if (strategy.totalReturn === null || base === null || base === undefined) return null
  return strategy.totalReturn > base
}

const BEAT_LABELS = { true: '比一直抱著賺', false: '不如一直抱著' } as const

// ---- 電腦模型：分析成績差多少、今天把機率往上推／往下拉最多的因素 ----
const accuracyGap = computed(() =>
  props.research.prediction ? props.research.prediction.testAccuracy - props.research.prediction.baselineAccuracy : 0,
)
const topFactors = computed(() => {
  const factors = (props.research.prediction?.factors ?? []).filter((f) => f.contribution !== null && f.contribution !== 0)
  const byImpact = [...factors].sort((a, b) => Math.abs(b.contribution!) - Math.abs(a.contribution!))
  return {
    up: byImpact.filter((f) => f.contribution! > 0).slice(0, 3),
    down: byImpact.filter((f) => f.contribution! < 0).slice(0, 3),
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- ── 重點整理 ── -->
    <section class="space-y-2 border-2 border-accent-hue/25 bg-accent-hue/5 p-3 sm:p-4">
      <p class="text-body font-semibold text-accent">重點整理</p>
      <dl class="space-y-2.5 text-body">
        <div v-if="research.backtest" class="space-y-1">
          <dt class="text-ink-muted">現在出現的這些現象，過去出現後多半漲還是跌？</dt>
          <dd class="flex flex-wrap items-center gap-1.5">
            <span v-if="signalCounts.better" class="border px-1.5 text-caption" :class="EDGE_STYLES.better">{{ EDGE_LABELS.better }} {{ signalCounts.better }} 個</span>
            <span v-if="signalCounts.same" class="border px-1.5 text-caption" :class="EDGE_STYLES.same">{{ EDGE_LABELS.same }} {{ signalCounts.same }} 個</span>
            <span v-if="signalCounts.worse" class="border px-1.5 text-caption" :class="EDGE_STYLES.worse">{{ EDGE_LABELS.worse }} {{ signalCounts.worse }} 個</span>
            <span v-if="signalCounts.few" class="text-caption text-ink-muted">次數太少看不出來 {{ signalCounts.few }} 個</span>
          </dd>
        </div>
        <div v-if="bestStrategy" class="space-y-1">
          <dt class="text-ink-muted">照固定規則買賣，有比買了一直抱著好嗎？</dt>
          <dd class="flex flex-wrap items-center gap-1.5">
            <!-- 「最賺」只在照規則買賣的做法裡比，買了一直抱著另外列，避免「最賺卻不如抱著」的矛盾說法 -->
            <span class="text-ink">照規則買賣的做法裡，「{{ bestStrategy.label }}」賺最多</span>
            <span class="tabular-nums" :class="trendClass(bestStrategy.totalReturn)">{{ formatSigned(bestStrategy.totalReturn, '%') }}</span>
            <span v-if="buyHold" class="text-ink">
              ，一直抱著是 <span class="tabular-nums" :class="trendClass(buyHold.totalReturn)">{{ formatSigned(buyHold.totalReturn, '%') }}</span>
            </span>
            <span
              v-if="beatsBuyHold(bestStrategy) !== null"
              class="border px-1.5 text-caption"
              :class="beatsBuyHold(bestStrategy) ? EDGE_STYLES.better : EDGE_STYLES.worse"
            >
              {{ beatsBuyHold(bestStrategy) ? '照規則買賣比較好' : '一直抱著比較好' }}
            </span>
          </dd>
        </div>
        <div v-if="research.prediction" class="space-y-1">
          <dt class="text-ink-muted">電腦預測 {{ research.prediction.horizon }} 天後會漲嗎？</dt>
          <dd class="flex flex-wrap items-center gap-1.5">
            <span class="text-ink">上漲機率</span>
            <span class="tabular-nums text-ink">{{ pct(research.prediction.probabilityUp) }}</span>
            <span class="border px-1.5 text-caption" :class="research.prediction.reliable ? EDGE_STYLES.better : EDGE_STYLES.same">
              {{ research.prediction.reliable ? '模型預測，可以參考' : '模型預測，僅供參考' }}
            </span>
          </dd>
        </div>
      </dl>
    </section>

    <!-- ── 訊號回測 ── -->
    <section v-if="research.backtest" class="space-y-3">
      <div>
        <h4 class="flex items-center gap-1.5 text-subtitle font-semibold text-ink">現象的歷史表現 <HelpTip term="backtest" /></h4>
        <p class="mt-1 text-body text-ink-muted">
          翻這檔股票過去 5 年的紀錄：每次出現下面這些現象之後，股價多半是漲還是跌？再和「隨便挑一天買」比，明顯比較常漲，這個現象才值得參考。
        </p>
      </div>

      <!-- 平常的上漲機率：所有現象的比較基準 -->
      <div class="space-y-1 border-2 border-tint/10 bg-tint/[0.03] px-3 py-2 text-body tabular-nums">
        <p class="text-ink-muted">比較基準：隨便挑一天買，之後上漲的機會</p>
        <p class="flex flex-wrap gap-x-4 gap-y-1 text-ink">
          <span v-for="base in research.backtest.baseline" :key="base.days">{{ base.days }} 天後 {{ pct(base.winRate) }}</span>
        </p>
      </div>

      <ul class="space-y-2">
        <li
          v-for="signal in research.backtest.signals"
          :key="signal.key"
          class="space-y-2.5 border-2 border-tint/10 bg-tint/5 p-3"
          :class="signal.sufficient ? '' : 'opacity-75'"
        >
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-semibold text-ink">{{ signal.label }} {{ signal.value }}</span>
            <HelpTip v-if="signalGlossaryKeys([signal]).length" :terms="signalGlossaryKeys([signal])" />
            <span v-if="edgeOf(signal) && signal.sufficient" class="border px-1.5 text-caption" :class="EDGE_STYLES[edgeOf(signal)!]">
              {{ EDGE_LABELS[edgeOf(signal)!] }}
            </span>
            <span v-if="!signal.sufficient" class="border border-accent-hue/40 px-1.5 text-caption text-accent">次數太少，參考就好</span>
            <span v-if="signal.consistent === false" class="border border-accent-hue/40 px-1.5 text-caption text-accent">早期和近期結果相反</span>
            <span class="ml-auto text-caption tabular-nums text-ink-muted">5 年內出現 {{ signal.occurrences }} 次</span>
          </div>

          <!-- 主要比較：10 天後上漲的機會 vs 平常 -->
          <div>
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 text-body tabular-nums">
              <span class="text-ink-muted">
                出現後 10 天，上漲的機會
                <span class="ml-1 text-subtitle font-semibold text-ink">{{ pct(win10(signal)?.winRate) }}</span>
              </span>
              <span class="text-ink-muted">
                平常是 {{ pct(baseline10) }}
                <span
                  v-if="diffText(signal)"
                  class="ml-1"
                  :class="edgeOf(signal) === 'better' ? 'text-up' : edgeOf(signal) === 'worse' ? 'text-down' : 'text-ink-soft'"
                >
                  （{{ diffText(signal) }}）
                </span>
              </span>
            </div>
            <!-- 長條：這個現象之後的上漲機會；白線：平常 -->
            <div class="relative mt-1.5 h-2.5 bg-tint/10" aria-hidden="true">
              <div class="h-full bg-accent-hue/70" :style="{ width: `${win10(signal)?.winRate ?? 0}%` }" />
              <div v-if="baseline10 !== null" class="absolute -top-1 h-[calc(100%+0.5rem)] w-0.5 bg-ink" :style="{ left: `${baseline10}%` }" />
            </div>
            <p class="mt-1 text-caption text-ink-muted">黃條是這個現象之後的上漲機會，白線是平常；黃條超過白線越多越好。</p>
          </div>

          <!-- 5／10／20 天的細節 -->
          <dl class="grid grid-cols-3 gap-2 text-body tabular-nums">
            <div v-for="h in signal.horizons" :key="h.days" class="border border-tint/10 px-2 py-1.5">
              <dt class="text-caption text-ink-muted">過 {{ h.days }} 天</dt>
              <dd class="text-ink">{{ pct(h.winRate) }} 會漲</dd>
              <dd class="text-caption">平均 <span :class="trendClass(h.avgReturn)">{{ moveText(h.avgReturn) }}</span></dd>
            </div>
          </dl>
          <p class="text-caption tabular-nums text-ink-muted">
            10 天內最慘的一次：<span :class="trendClass(win10(signal)?.worst)">{{ moveText(win10(signal)?.worst) }}</span>
          </p>
          <p v-if="signal.consistent === false && signal.periods" class="text-caption tabular-nums text-accent">
            早期出現後 {{ pct(signal.periods.early.winRate) }} 會漲（當時平常 {{ pct(signal.periods.early.baseline) }}），
            近期變成 {{ pct(signal.periods.late.winRate) }}（當時平常 {{ pct(signal.periods.late.baseline) }}），前後相反，可能只是剛好碰上，不太可靠。
          </p>
        </li>
      </ul>

      <details class="border-2 border-tint/10">
        <summary class="cursor-pointer px-3 py-2 text-body text-ink-soft hover:bg-tint/5">看 5／10／20 天的完整對照圖</summary>
        <div class="p-3">
          <MarketBacktestChart :backtest="research.backtest" />
        </div>
      </details>
    </section>

    <!-- ── 策略回測 ── -->
    <section v-if="research.strategies" class="space-y-3">
      <div>
        <h4 class="flex items-center gap-1.5 text-subtitle font-semibold text-ink">照規則買賣的模擬 <HelpTip term="strategies" /></h4>
        <p class="mt-1 text-body text-ink-muted">
          假設從 {{ research.strategies.from }} 到 {{ research.strategies.to }}（約 {{ research.strategies.years }} 年）都照一套固定規則買賣，最後會賺多少？
          每次買賣都已扣掉手續費和稅（來回約 {{ research.strategies.roundTripCost }}%）。拿來和「買了就一直抱著」（圖上的虛線）比，照規則買賣還賺得比較少，就沒必要這樣操作。
        </p>
      </div>
      <MarketStrategyChart :strategies="research.strategies" />

      <!-- 對照組：買了一直抱著 -->
      <div v-if="buyHold" class="space-y-1 border-2 border-tint/10 bg-tint/[0.03] px-3 py-2 text-body tabular-nums">
        <p class="text-ink-muted">對照組：一開始買進，之後都不賣</p>
        <p class="flex flex-wrap gap-x-4 gap-y-1 text-ink">
          <span>總共 <span :class="trendClass(buyHold.totalReturn)">{{ formatSigned(buyHold.totalReturn, '%') }}</span></span>
          <span>平均每年 <span :class="trendClass(buyHold.annualReturn)">{{ formatSigned(buyHold.annualReturn, '%') }}</span></span>
          <span>最慘時從高點跌了 <span class="text-down">{{ pct(buyHold.maxDrawdown === null ? null : Math.abs(buyHold.maxDrawdown), 2) }}</span></span>
        </p>
      </div>

      <ul class="space-y-2">
        <li v-for="s in activeStrategies" :key="s.key" class="space-y-2.5 border-2 border-tint/10 bg-tint/5 p-3">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-semibold text-ink">{{ s.label }}</span>
            <span v-if="beatsBuyHold(s) !== null" class="border px-1.5 text-caption" :class="beatsBuyHold(s) ? EDGE_STYLES.better : EDGE_STYLES.worse">
              {{ BEAT_LABELS[`${beatsBuyHold(s)!}`] }}
            </span>
            <span v-if="s.robust === true" class="border border-accent-hue/40 px-1.5 text-caption text-accent">前後兩段都比抱著好</span>
            <span class="ml-auto text-caption text-ink-muted">照這規則，現在{{ s.holdingNow ? '應該持有' : '應該空手' }}</span>
          </div>
          <p class="text-body text-ink-soft">{{ s.plain || s.description }}</p>
          <p v-if="s.plain" class="text-caption text-info">規則：{{ s.description }}</p>

          <dl class="grid grid-cols-2 gap-2 text-body tabular-nums sm:grid-cols-4">
            <div class="border border-tint/10 px-2 py-1.5">
              <dt class="text-caption text-ink-muted">總共賺</dt>
              <dd class="font-semibold" :class="trendClass(s.totalReturn)">{{ formatSigned(s.totalReturn, '%') }}</dd>
            </div>
            <div class="border border-tint/10 px-2 py-1.5">
              <dt class="text-caption text-ink-muted">平均每年</dt>
              <dd :class="trendClass(s.annualReturn)">{{ formatSigned(s.annualReturn, '%') }}</dd>
            </div>
            <div class="border border-tint/10 px-2 py-1.5">
              <dt class="text-caption text-ink-muted">最慘時從高點跌了</dt>
              <dd class="text-down">{{ pct(s.maxDrawdown === null ? null : Math.abs(s.maxDrawdown), 2) }}</dd>
            </div>
            <div class="border border-tint/10 px-2 py-1.5">
              <dt class="text-caption text-ink-muted">買賣幾次／幾成有賺</dt>
              <dd class="text-ink">{{ s.trades }} 次／{{ pct(s.tradeWinRate) }}</dd>
            </div>
          </dl>

          <div v-if="s.withStop || s.periods" class="space-y-0.5 text-caption tabular-nums text-ink-muted">
            <p v-if="s.withStop && research.strategies.stopLossPct">
              如果另外設「跌 {{ research.strategies.stopLossPct }}% 就認賠賣出」：總共
              <span :class="trendClass(s.withStop.totalReturn)">{{ formatSigned(s.withStop.totalReturn, '%') }}</span>，最慘時從高點跌了
              <span class="text-down">{{ pct(s.withStop.maxDrawdown === null ? null : Math.abs(s.withStop.maxDrawdown), 2) }}</span>
            </p>
            <p v-if="s.periods && research.strategies.splitDate">
              分成兩段檢查是不是碰巧：{{ research.strategies.splitDate }} 以前
              <span :class="trendClass(s.periods.early.totalReturn)">{{ formatSigned(s.periods.early.totalReturn, '%') }}</span>（一直抱著
              {{ formatSigned(s.periods.early.buyHold, '%') }}），之後
              <span :class="trendClass(s.periods.late.totalReturn)">{{ formatSigned(s.periods.late.totalReturn, '%') }}</span>（一直抱著
              {{ formatSigned(s.periods.late.buyHold, '%') }}）
            </p>
          </div>
        </li>
      </ul>
    </section>

    <!-- ── 機器學習 ── -->
    <section v-if="research.prediction" class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <h4 class="flex items-center gap-1.5 text-subtitle font-semibold text-ink">電腦模型預測 <HelpTip term="prediction" /></h4>
        <span class="border-2 px-2 py-0.5 text-caption" :class="research.prediction.reliable ? EDGE_STYLES.better : EDGE_STYLES.same">
          {{ research.prediction.reliable ? '模型預測，可以參考' : '模型預測，僅供參考' }}
        </span>
      </div>
      <ul class="list-disc space-y-1 pl-5 text-body text-ink-muted marker:text-warn">
        <li>讓電腦看這檔股票過去的走勢資料，學著預測「{{ research.prediction.horizon }} 天後的收盤會不會比今天高」。</li>
        <li>
          再拿電腦沒看過的 {{ research.prediction.testFrom }} 到 {{ research.prediction.testTo }}（{{ research.prediction.testSamples }} 天）來分析，看預測對幾成。
        </li>
        <li>對照組是「每次都預測比較常發生的那一邊」，至少能預測對一半。電腦要比對照組準，它給的機率才有參考價值。</li>
      </ul>

      <div class="grid gap-3 sm:grid-cols-2">
        <!-- 上漲機率：50% 在中間，左邊偏跌、右邊偏漲，白點是電腦給的機率；不可靠時數字變灰變小 -->
        <div class="border-2 border-tint/10 bg-tint/5 p-3">
          <p class="text-body text-ink-muted">電腦認為 {{ research.prediction.horizon }} 天後上漲的機率</p>
          <p
            class="mt-1 font-semibold tabular-nums"
            :class="research.prediction.reliable ? 'text-display text-ink' : 'text-title text-ink-muted'"
          >
            {{ pct(research.prediction.probabilityUp) }}
          </p>
          <div class="relative mt-3 h-2 w-full" aria-hidden="true">
            <div class="absolute inset-y-0 left-0 w-1/2 bg-down-hue/30" />
            <div class="absolute inset-y-0 right-0 w-1/2 bg-up-hue/30" />
            <div class="absolute -top-1 left-1/2 h-4 w-0.5 -translate-x-1/2 bg-ink-muted/70" />
            <div
              v-if="research.prediction.probabilityUp !== null"
              class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
              :style="{ left: `${research.prediction.probabilityUp}%` }"
            />
          </div>
          <p class="mt-1.5 flex justify-between text-caption text-ink-muted">
            <span class="text-down">← 比較可能跌</span><span>50%</span><span class="text-up">比較可能漲 →</span>
          </p>
        </div>

        <!-- 分析成績：直接寫出比「每次預測同一邊」多或少預測對幾個百分點 -->
        <div class="border-2 border-tint/10 bg-tint/5 p-3">
          <p class="text-body text-ink-muted">分析時預測對的比例</p>
          <div class="mt-2 space-y-2 text-body">
            <div>
              <div class="flex justify-between text-ink"><span>電腦</span><span class="tabular-nums">{{ pct(research.prediction.testAccuracy) }}</span></div>
              <div class="mt-1 h-2 w-full bg-tint/5"><div class="h-2 bg-accent-hue/70" :style="{ width: `${research.prediction.testAccuracy}%` }" /></div>
            </div>
            <div>
              <div class="flex justify-between text-ink-muted"><span>每次預測同一邊</span><span class="tabular-nums">{{ pct(research.prediction.baselineAccuracy) }}</span></div>
              <div class="mt-1 h-2 w-full bg-tint/5"><div class="h-2 bg-ink-muted/50" :style="{ width: `${research.prediction.baselineAccuracy}%` }" /></div>
            </div>
          </div>
          <p
            class="mt-2 text-body tabular-nums"
            :class="accuracyGap > 0 ? 'text-up-ink' : 'text-down-ink'"
          >
            電腦比每次預測同一邊{{ accuracyGap > 0 ? '多' : '少' }}預測對 {{ formatNumber(Math.abs(accuracyGap), 1) }} 個百分點<template v-if="!research.prediction.reliable">，這個機率不要參考</template>
          </p>
        </div>
      </div>

      <!-- 今天的因素：把機率往上推、往下拉最多的各 3 個 -->
      <div v-if="topFactors.up.length || topFactors.down.length" class="grid gap-3 sm:grid-cols-2">
        <div class="border-2 border-up-hue/20 bg-up-hue/5 p-3">
          <p class="text-body font-medium text-danger">今天讓電腦覺得會漲的原因</p>
          <ol class="mt-2 list-decimal space-y-1 pl-5 text-body text-ink">
            <li v-for="factor in topFactors.up" :key="factor.key">{{ factor.plain || factor.label }}</li>
            <li v-if="!topFactors.up.length" class="list-none text-ink-muted">沒有</li>
          </ol>
        </div>
        <div class="border-2 border-down-hue/20 bg-down-hue/5 p-3">
          <p class="text-body font-medium text-down-ink">今天讓電腦覺得會跌的原因</p>
          <ol class="mt-2 list-decimal space-y-1 pl-5 text-body text-ink">
            <li v-for="factor in topFactors.down" :key="factor.key">{{ factor.plain || factor.label }}</li>
            <li v-if="!topFactors.down.length" class="list-none text-ink-muted">沒有</li>
          </ol>
        </div>
      </div>

      <p v-if="research.prediction.marketContext" class="text-body text-ink-muted">
        電腦有一起參考{{ research.prediction.marketContext.label }}的走勢；不參考的話預測對
        {{ pct(research.prediction.marketContext.accuracyWithoutMarket) }}，
        {{
          research.prediction.testAccuracy > research.prediction.marketContext.accuracyWithoutMarket
            ? '參考大盤後比較準。'
            : '參考了也沒有比較準，這檔股票短期的漲跌和大盤關係不大。'
        }}
      </p>

      <details class="border-2 border-tint/10">
        <summary class="cursor-pointer px-3 py-2 text-body text-ink-soft hover:bg-tint/5">看所有因素的影響大小</summary>
        <div class="p-3">
          <p class="mb-2 text-caption text-ink-muted">往右（紅）是今天把機率往上推，往左（綠）是往下拉；越長影響越大。</p>
          <MarketPredictionChart :prediction="research.prediction" />
        </div>
      </details>
      <p class="text-caption text-ink-muted">
        幾天內的漲跌本來就很難預測，能比對照組多預測對幾成就算不錯；沒有比較準的時候，這個機率看看就好，不要拿來決定買賣。
      </p>
    </section>
  </div>
</template>
