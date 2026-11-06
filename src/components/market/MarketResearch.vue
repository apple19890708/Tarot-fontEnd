<script setup lang="ts">
import { computed } from 'vue'
import HelpTip from '../HelpTip.vue'

import MarketBacktestChart from './MarketBacktestChart.vue'
import MarketPredictionChart from './MarketPredictionChart.vue'
import MarketStrategyChart from './MarketStrategyChart.vue'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import type { MarketResearch } from '../../types'

// 歷史回測、策略比較、機器學習預測。數字全由後端算好，這裡只排版。
const props = defineProps<{
  research: MarketResearch
}>()

const strategiesSorted = computed(() =>
  [...(props.research.strategies?.strategies ?? [])].sort((a, b) => (b.totalReturn ?? -Infinity) - (a.totalReturn ?? -Infinity)),
)

function pct(value: number | null | undefined, digits = 1) {
  return value === null || value === undefined ? '—' : `${formatNumber(value, digits)}%`
}

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-stone-300'
  return value > 0 ? 'text-rose-300' : 'text-emerald-300'
}

// 訊號勝率和基準比（10 日），差距用來上色：明顯高於基準紅、明顯低於綠、差不多灰
function edgeClass(winRate: number | null, baseline: number | null) {
  if (winRate === null || baseline === null) return 'text-stone-400'
  const diff = winRate - baseline
  if (diff >= 5) return 'text-rose-300'
  if (diff <= -5) return 'text-emerald-300'
  return 'text-stone-300'
}

const baseline10 = computed(() => props.research.backtest?.baseline.find((b) => b.days === 10)?.winRate ?? null)
</script>

<template>
  <div class="space-y-6">
    <!-- ── 訊號回測 ── -->
    <section v-if="research.backtest" class="space-y-3">
      <div>
        <h4 class="flex items-center gap-1.5 text-sm font-semibold text-stone-50">訊號回測 <HelpTip term="backtest" /></h4>
        <p class="mt-1 text-xs leading-5 text-stone-400">
          目前亮著的訊號，在這檔標的過去 5 年「首次出現」之後的表現。和第一列「任意一天買進」的基準比，高出越多才代表這個訊號有用。
          「前後不一致」代表前期與後期的表現方向相反，可能只是剛好適合過去。
        </p>
      </div>
      <MarketBacktestChart :backtest="research.backtest" />
      <div class="overflow-x-auto">
        <table class="w-full min-w-[34rem] text-xs">
          <thead>
            <tr class="border-b border-white/10 text-left text-stone-400">
              <th class="py-1.5 pr-3 font-normal">訊號</th>
              <th class="py-1.5 pr-3 text-right font-normal">次數</th>
              <th v-for="days in research.backtest.horizons" :key="days" class="py-1.5 pr-3 text-right font-normal">
                {{ days }} 日上漲／平均
              </th>
              <th class="py-1.5 text-right font-normal">10 日最差</th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr class="border-b border-white/5 text-stone-400">
              <td class="py-1.5 pr-3">基準（任意一天）</td>
              <td class="py-1.5 pr-3 text-right">—</td>
              <td v-for="base in research.backtest.baseline" :key="base.days" class="py-1.5 pr-3 text-right">
                {{ pct(base.winRate) }}／{{ formatSigned(base.avgReturn, '%') }}
              </td>
              <td class="py-1.5 text-right">—</td>
            </tr>
            <tr v-for="signal in research.backtest.signals" :key="signal.key" class="border-b border-white/5 text-stone-200">
              <td class="py-1.5 pr-3">
                {{ signal.label }} {{ signal.value }}
                <span v-if="!signal.sufficient" class="ml-1 text-amber-200/70">樣本少</span>
                <span
                  v-if="signal.consistent === false && signal.periods"
                  class="ml-1 text-amber-200/70"
                  :title="`前期 10 日上漲 ${signal.periods.early.winRate}%（當時平常 ${signal.periods.early.baseline}%），後期 ${signal.periods.late.winRate}%（當時平常 ${signal.periods.late.baseline}%）`"
                >
                  前後不一致
                </span>
              </td>
              <td class="py-1.5 pr-3 text-right">{{ signal.occurrences }}</td>
              <td v-for="h in signal.horizons" :key="h.days" class="py-1.5 pr-3 text-right">
                <span :class="h.days === 10 ? edgeClass(h.winRate, baseline10) : ''">{{ pct(h.winRate) }}</span>／<span
                  :class="trendClass(h.avgReturn)"
                  >{{ formatSigned(h.avgReturn, '%') }}</span
                >
              </td>
              <td class="py-1.5 text-right text-emerald-300/80">{{ formatSigned(signal.horizons[1]?.worst, '%') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── 策略回測 ── -->
    <section v-if="research.strategies" class="space-y-3">
      <div>
        <h4 class="flex items-center gap-1.5 text-sm font-semibold text-stone-50">策略回測 <HelpTip term="strategies" /></h4>
        <p class="mt-1 text-xs leading-5 text-stone-400">
          {{ research.strategies.from }} 到 {{ research.strategies.to }}（約 {{ research.strategies.years }} 年），起點都是 100，每次來回扣
          {{ research.strategies.roundTripCost }}% 交易成本。虛線是買進持有，技術策略要贏過它才有操作的意義。
          <template v-if="research.strategies.splitDate">
            「分段驗證」以 {{ research.strategies.splitDate }} 切成前後兩段，兩段都贏過同期的買進持有才標「穩定」。
          </template>
        </p>
      </div>
      <MarketStrategyChart :strategies="research.strategies" />
      <div class="overflow-x-auto">
        <table class="w-full min-w-[46rem] text-xs">
          <thead>
            <tr class="border-b border-white/10 text-left text-stone-400">
              <th class="py-1.5 pr-3 font-normal">策略</th>
              <th class="py-1.5 pr-3 text-right font-normal">總報酬</th>
              <th class="py-1.5 pr-3 text-right font-normal">年化</th>
              <th class="py-1.5 pr-3 text-right font-normal">最大回落</th>
              <th class="py-1.5 pr-3 text-right font-normal">交易／勝率</th>
              <th v-if="research.strategies.stopLossPct" class="py-1.5 pr-3 text-right font-normal">
                加 {{ research.strategies.stopLossPct }}% 停損
              </th>
              <th v-if="research.strategies.splitDate" class="py-1.5 pr-3 text-right font-normal">分段驗證（前／後）</th>
              <th class="py-1.5 text-right font-normal">目前</th>
            </tr>
          </thead>
          <tbody class="tabular-nums">
            <tr v-for="s in strategiesSorted" :key="s.key" class="border-b border-white/5 text-stone-200">
              <td class="py-1.5 pr-3" :title="s.description">
                {{ s.label }}
                <span class="block text-[11px] text-stone-500">{{ s.description }}</span>
              </td>
              <td class="py-1.5 pr-3 text-right" :class="trendClass(s.totalReturn)">{{ formatSigned(s.totalReturn, '%') }}</td>
              <td class="py-1.5 pr-3 text-right" :class="trendClass(s.annualReturn)">{{ formatSigned(s.annualReturn, '%') }}</td>
              <td class="py-1.5 pr-3 text-right text-emerald-300/80">{{ formatSigned(s.maxDrawdown, '%') }}</td>
              <td class="py-1.5 pr-3 text-right">
                <template v-if="s.key === 'buyHold'">—</template>
                <template v-else>{{ s.trades }} 次／{{ pct(s.tradeWinRate) }}</template>
              </td>
              <td v-if="research.strategies.stopLossPct" class="py-1.5 pr-3 text-right">
                <template v-if="s.withStop">
                  <span :class="trendClass(s.withStop.totalReturn)">{{ formatSigned(s.withStop.totalReturn, '%') }}</span>
                  <span class="block text-[11px] text-stone-500">回落 {{ formatSigned(s.withStop.maxDrawdown, '%') }}</span>
                </template>
                <template v-else>—</template>
              </td>
              <td v-if="research.strategies.splitDate" class="py-1.5 pr-3 text-right">
                <template v-if="s.periods">
                  <span :class="trendClass(s.periods.early.totalReturn)">{{ formatSigned(s.periods.early.totalReturn, '%') }}</span>
                  ／
                  <span :class="trendClass(s.periods.late.totalReturn)">{{ formatSigned(s.periods.late.totalReturn, '%') }}</span>
                  <span v-if="s.robust === true" class="ml-1 border border-amber-200/40 px-1 text-[10px] text-amber-100">穩定</span>
                  <span v-else-if="s.key === 'buyHold'" class="block text-[11px] text-stone-500">對照組</span>
                </template>
              </td>
              <td class="py-1.5 text-right text-stone-300">
                <template v-if="s.key === 'buyHold'">—</template>
                <template v-else>{{ s.holdingNow ? '持有中' : '空手' }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── 機器學習 ── -->
    <section v-if="research.prediction" class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <h4 class="flex items-center gap-1.5 text-sm font-semibold text-stone-50">機器學習預測 <HelpTip term="prediction" /></h4>
        <span
          class="border-2 px-2 py-0.5 text-[11px]"
          :class="
            research.prediction.reliable
              ? 'border-amber-200/30 bg-amber-200/10 text-amber-100'
              : 'border-white/15 bg-white/5 text-stone-300'
          "
        >
          {{ research.prediction.reliable ? '有贏過基準' : '沒有贏過基準・不可靠' }}
        </span>
      </div>
      <p class="text-xs leading-5 text-stone-400">
        {{ research.prediction.model }}，預測 {{ research.prediction.horizon }} 個交易日後的收盤是否高於今天。用前段資料訓練、
        {{ research.prediction.testFrom }} 到 {{ research.prediction.testTo }} 的 {{ research.prediction.testSamples }}
        筆資料測試；基準是「一律猜過去比較常發生的那一邊」，最低 50%（丟銅板）。
      </p>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="border-2 border-white/10 bg-white/5 p-3">
          <p class="text-xs text-stone-400">{{ research.prediction.horizon }} 日後上漲機率</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums" :class="research.prediction.reliable ? 'text-stone-50' : 'text-stone-400'">
            {{ pct(research.prediction.probabilityUp) }}
          </p>
          <div class="mt-2 h-2 w-full bg-emerald-300/25">
            <div class="h-2 bg-rose-300/70" :style="{ width: `${research.prediction.probabilityUp ?? 0}%` }" />
          </div>
          <p class="mt-1 flex justify-between text-[11px] text-stone-500"><span>偏跌</span><span>偏漲</span></p>
        </div>
        <div class="border-2 border-white/10 bg-white/5 p-3">
          <p class="text-xs text-stone-400">樣本外準確率</p>
          <div class="mt-2 space-y-2 text-xs">
            <div>
              <div class="flex justify-between text-stone-200"><span>模型</span><span class="tabular-nums">{{ pct(research.prediction.testAccuracy) }}</span></div>
              <div class="mt-1 h-2 w-full bg-white/5"><div class="h-2 bg-amber-200/70" :style="{ width: `${research.prediction.testAccuracy}%` }" /></div>
            </div>
            <div>
              <div class="flex justify-between text-stone-400"><span>基準</span><span class="tabular-nums">{{ pct(research.prediction.baselineAccuracy) }}</span></div>
              <div class="mt-1 h-2 w-full bg-white/5"><div class="h-2 bg-stone-400/50" :style="{ width: `${research.prediction.baselineAccuracy}%` }" /></div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="research.prediction.marketContext" class="text-xs leading-5 text-stone-400">
        模型有加入{{ research.prediction.marketContext.label }}的走勢當特徵；不加的話準確率是
        {{ pct(research.prediction.marketContext.accuracyWithoutMarket) }}，
        {{
          research.prediction.testAccuracy > research.prediction.marketContext.accuracyWithoutMarket
            ? '加入後有幫助。'
            : '加入後沒有幫助，這檔股票的短線漲跌和大盤的關係不穩定。'
        }}
      </p>

      <MarketPredictionChart :prediction="research.prediction" />
      <p class="text-[11px] leading-5 text-stone-500">
        短線漲跌本來就很難預測，準確率能穩定比基準高幾個百分點已經算好；沒有贏過基準時，這個機率不要拿來做決定。
      </p>
    </section>
  </div>
</template>
