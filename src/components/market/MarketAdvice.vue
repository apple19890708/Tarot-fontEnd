<script setup lang="ts">
import { computed, ref } from 'vue'
import HelpTip from '../HelpTip.vue'
import MarketAdviceLevel from './MarketAdviceLevel.vue'

import { addMarketAlert } from '../../lib/marketAlerts'
import { formatNumber } from '../../lib/marketChart'
import type { MarketAdvice, MarketAdviceEvidence, MarketAlert, MarketItem } from '../../types'

// 操作建議：後端依技術面、回測、策略、機器學習以固定規則算出來的結論。文字全來自後端。
// 分「短中期（5～20 天）」與「長期（半年以上）」兩份，版面相同，只有價位那一區不同；舊版後端沒有長期時不顯示切換
const props = defineProps<{
  advice: MarketAdvice
  // 一鍵設定價位提醒要用到標的資訊
  item?: MarketItem
}>()

// 一鍵把停損或目標價設成提醒：key 是價格，值是設定狀態
const alertState = ref<Record<string, 'saving' | 'saved' | string>>({})

async function setAlert(condition: 'above' | 'below', price: number, note: string) {
  const item = props.item
  if (!item) return
  const key = `${condition}-${price}`
  alertState.value = { ...alertState.value, [key]: 'saving' }
  try {
    await addMarketAlert({
      target: {
        symbol: item.symbol,
        code: item.code,
        exchange: item.exchange ?? null,
        market: item.market,
        kind: item.kind,
        name: item.name,
      },
      condition,
      price,
      note,
    })
    alertState.value = { ...alertState.value, [key]: 'saved' }
  } catch (error) {
    alertState.value = { ...alertState.value, [key]: error instanceof Error ? error.message : '設定失敗' }
  }
}

// 按鈕的狀態；失敗時回到 idle（可以再按一次），錯誤訊息由 alertError 另外顯示
function alertStatus(condition: 'above' | 'below', price: number): 'idle' | 'saving' | 'saved' {
  const state = alertState.value[`${condition}-${price}`]
  return state === 'saving' || state === 'saved' ? state : 'idle'
}

function alertError(condition: MarketAlert['condition'], price: number) {
  const state = alertState.value[`${condition}-${price}`]
  return state && state !== 'saving' && state !== 'saved' ? state : ''
}

type Mode = 'short' | 'long'
const MODES = [
  { key: 'short', label: '短中期（5～20 天）' },
  { key: 'long', label: '長期（半年以上）' },
] as const
const mode = ref<Mode>('short')
const long = computed(() => props.advice.longTerm ?? null)
// 目前顯示的那一份（結論、怎麼做、依據、風險的欄位兩份相同）
const view = computed(() => (mode.value === 'long' && long.value ? long.value : props.advice))

// 年線提醒：現價在年線上就提醒「跌破」、在下就提醒「站回」
const yearLineCondition = computed<'above' | 'below'>(() =>
  (props.item?.quote.price ?? 0) >= (long.value?.keyLevel.price ?? 0) ? 'below' : 'above',
)
const yearLineNote = computed(() => (yearLineCondition.value === 'below' ? '跌破年線（長期轉弱）' : '站回年線（長期轉強）'))

// 台灣習慣：偏多紅、偏空綠
const STANCE_STYLES: Record<MarketAdvice['stance'], string> = {
  bullish: 'border-up-hue/40 bg-up-hue/15 text-up-ink',
  bearish: 'border-down-hue/40 bg-down-hue/15 text-down-ink',
  neutral: 'border-tint/20 bg-tint/10 text-ink',
}

function directionMark(direction: number) {
  if (direction > 0) return { text: '偏多', cls: 'text-up' }
  if (direction < 0) return { text: '偏空', cls: 'text-down' }
  return { text: '中性', cls: 'text-ink-muted' }
}

const groups = computed(() => {
  const map = new Map<string, MarketAdviceEvidence[]>()
  for (const item of view.value.evidence) {
    map.set(item.group, [...(map.get(item.group) ?? []), item])
  }
  return [...map.entries()]
})
</script>

<template>
  <div class="space-y-4">
    <!-- 短中期／長期切換 -->
    <div v-if="long" class="flex flex-wrap gap-1.5" role="group" aria-label="建議的期間">
      <button
        v-for="option in MODES"
        :key="option.key"
        type="button"
        class="cursor-pointer border-2 px-3 py-1 text-button transition active:translate-x-[2px] active:translate-y-[2px] font-pixel"
        :class="mode === option.key ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
        :aria-pressed="mode === option.key"
        @click="mode = option.key"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 結論 -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="flex items-center gap-1.5">
        <span class="border-2 px-3 py-1 text-subtitle font-semibold" :class="STANCE_STYLES[view.stance]">
          {{ view.stanceLabel }}
        </span>
        <HelpTip :term="mode === 'long' ? 'longTerm' : 'stance'" />
      </span>
      <span class="flex items-center gap-1.5 text-body text-ink-muted">信心 {{ view.confidenceLabel }} <HelpTip term="confidence" /></span>
      <span class="flex items-center gap-1.5 text-caption text-ink-muted">適用 {{ view.horizon }}<HelpTip v-if="mode === 'short'" term="horizon" /></span>
    </div>
    <p class="text-body text-ink-soft/90">{{ view.summary }}</p>

    <!-- 長期的關鍵價位：只有年線 -->
    <div v-if="mode === 'long' && long" class="grid gap-3 lg:grid-cols-2">
      <div class="border-2 border-accent-hue/20 bg-accent-hue/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-accent">關鍵價位：年線 <HelpTip term="yearLine" /></p>
        <MarketAdviceLevel
          class="mt-1"
          :price="long.keyLevel.price"
          :label="item ? `現價 ${formatNumber(item.quote.price)}，${item.quote.price >= long.keyLevel.price ? '在年線之上' : '在年線之下'}` : undefined"
          tone="accent"
          :can-alert="!!item"
          :state="alertStatus(yearLineCondition, long.keyLevel.price)"
          :error="alertError(yearLineCondition, long.keyLevel.price)"
          @alert="setAlert(yearLineCondition, long.keyLevel.price, yearLineNote)"
        />
      </div>
      <!-- 建議部位：手機標題與內容同一行（省高度），sm 以上上下排 -->
      <div class="flex items-baseline justify-between gap-3 border-2 border-tint/10 bg-tint/5 p-3 sm:block">
        <p class="flex shrink-0 items-center gap-1.5 text-body text-ink-muted">建議部位 <HelpTip term="position" /></p>
        <p class="text-right text-body font-medium text-ink sm:mt-1 sm:text-left">{{ long.positionSize }}</p>
      </div>
    </div>

    <!-- 短中期的關鍵價位 -->
    <div v-else class="grid gap-3 lg:grid-cols-3">
      <div class="border-2 border-down-hue/20 bg-down-hue/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-down-ink">{{ advice.levels.stopLossLabel }} <HelpTip term="stopLoss" /></p>
        <MarketAdviceLevel
          class="mt-1"
          :price="advice.levels.stopLoss.price"
          :label="advice.levels.stopLoss.label"
          tone="down"
          :can-alert="!!item"
          :state="alertStatus('below', advice.levels.stopLoss.price)"
          :error="alertError('below', advice.levels.stopLoss.price)"
          @alert="setAlert('below', advice.levels.stopLoss.price, `${advice.levels.stopLossLabel}：${advice.levels.stopLoss.label}`)"
        />
      </div>
      <div class="border-2 border-up-hue/20 bg-up-hue/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-danger">{{ advice.levels.targetsLabel }} <HelpTip term="targets" /></p>
        <!-- 好幾個目標價：一個一列，列之間用細線分開 -->
        <div v-if="advice.levels.targets.length" class="mt-1 divide-y divide-tint/10">
          <MarketAdviceLevel
            v-for="target in advice.levels.targets"
            :key="target.price"
            class="py-1.5 first:pt-0 last:pb-0"
            :price="target.price"
            :label="target.label"
            tone="up"
            :can-alert="!!item"
            :state="alertStatus('above', target.price)"
            :error="alertError('above', target.price)"
            @alert="setAlert('above', target.price, `${advice.levels.targetsLabel}：${target.label}`)"
          />
        </div>
        <p v-else class="mt-1 text-body text-ink-muted">—</p>
      </div>
      <!-- 建議部位：手機標題與內容同一行（省高度），sm 以上上下排 -->
      <div class="border-2 border-tint/10 bg-tint/5 p-3">
        <div class="flex items-baseline justify-between gap-3 sm:block">
          <p class="flex shrink-0 items-center gap-1.5 text-body text-ink-muted">建議部位 <HelpTip term="position" /></p>
          <p class="text-right text-body font-medium text-ink sm:mt-1 sm:text-left">{{ advice.positionSize }}</p>
        </div>
        <p v-if="advice.levels.riskReward !== null" class="mt-1 text-caption text-ink-muted">
          風險報酬比 <span class="tabular-nums" :class="advice.levels.riskReward >= 1.5 ? 'text-danger' : 'text-ink-muted'">{{ advice.levels.riskReward }}</span>
          <HelpTip class="ml-1" term="riskReward" />
        </p>
      </div>
    </div>

    <!-- 怎麼做 -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="border-2 border-accent-hue/20 bg-accent-hue/5 p-3">
        <p class="text-body font-medium text-accent">還沒進場</p>
        <p class="mt-1 text-body text-ink">{{ view.forNew }}</p>
      </div>
      <div class="border-2 border-accent-hue/20 bg-accent-hue/5 p-3">
        <p class="text-body font-medium text-accent">已經持有</p>
        <p class="mt-1 text-body text-ink">{{ view.forHolders }}</p>
      </div>
    </div>

    <!-- 判斷依據 -->
    <div class="space-y-2">
      <p class="flex items-center gap-1.5 text-body font-medium text-ink-muted">判斷依據 <HelpTip term="evidence" /></p>
      <div v-for="[group, items] in groups" :key="group" class="space-y-1">
        <p class="text-caption tracking-wide text-ink-muted">{{ group }}</p>
        <ul class="space-y-1 text-body">
          <li v-for="item in items" :key="item.label" class="flex gap-2" :class="item.counted ? '' : 'opacity-60'">
            <span class="w-[2.5em] flex-shrink-0 whitespace-nowrap font-medium" :class="directionMark(item.direction).cls">
              {{ item.counted ? directionMark(item.direction).text : '不計' }}
            </span>
            <span class="min-w-0 text-ink-soft">
              {{ item.label }}
              <span v-if="item.detail" class="block text-caption text-ink-muted">{{ item.detail }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 風險 -->
    <ul v-if="view.risks.length" class="space-y-1 border-2 border-accent-hue/20 bg-accent-hue/5 p-3 text-body text-accent/85">
      <li v-for="risk in view.risks" :key="risk">{{ risk }}</li>
    </ul>

    <p v-if="mode === 'long' && long" class="text-caption text-ink-muted">
      長期建議由固定規則計算：年線的位置與方向、近一年和大盤比、過去一直抱著的報酬，台股個股再加上估值與營收。歷史表現不代表未來，存股前請再確認公司基本面。
    </p>
    <p v-else class="text-caption text-ink-muted">
      這份建議由固定規則計算：長期趨勢（年線、離一年高點）、均線排列、在這檔標的有歷史優勢的訊號、法人與融資。用歷史資料驗證過，偏多之後確實比較常漲，但差距不大；歷史表現不代表未來，出場點請確實執行。
    </p>
  </div>
</template>
