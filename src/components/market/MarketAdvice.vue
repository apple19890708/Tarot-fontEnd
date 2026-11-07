<script setup lang="ts">
import { computed, ref } from 'vue'
import HelpTip from '../HelpTip.vue'

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

function alertLabel(condition: 'above' | 'below', price: number) {
  const state = alertState.value[`${condition}-${price}`]
  if (state === 'saving') return '設定中…'
  if (state === 'saved') return '已設提醒'
  return '設提醒'
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
  bullish: 'border-rose-300/40 bg-rose-300/15 text-rose-100',
  bearish: 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100',
  neutral: 'border-white/20 bg-white/10 text-stone-100',
}

function directionMark(direction: number) {
  if (direction > 0) return { text: '偏多', cls: 'text-rose-300' }
  if (direction < 0) return { text: '偏空', cls: 'text-emerald-300' }
  return { text: '中性', cls: 'text-stone-300' }
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
        :class="mode === option.key ? 'border-amber-200/40 bg-amber-200/15 text-amber-50' : 'border-white/15 text-stone-300 hover:bg-white/10'"
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
      <span class="flex items-center gap-1.5 text-body text-stone-300">信心 {{ view.confidenceLabel }} <HelpTip term="confidence" /></span>
      <span class="flex items-center gap-1.5 text-caption text-stone-300">適用 {{ view.horizon }}<HelpTip v-if="mode === 'short'" term="horizon" /></span>
    </div>
    <p class="text-body text-stone-200/90">{{ view.summary }}</p>

    <!-- 長期的關鍵價位：只有年線 -->
    <div v-if="mode === 'long' && long" class="grid gap-3 sm:grid-cols-2">
      <div class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-amber-100/80">關鍵價位：年線 <HelpTip term="yearLine" /></p>
        <p class="mt-1 text-subtitle font-semibold tabular-nums text-stone-50">{{ formatNumber(long.keyLevel.price) }}</p>
        <p v-if="item" class="text-caption text-stone-300">
          現價 {{ formatNumber(item.quote.price) }}，{{ item.quote.price >= long.keyLevel.price ? '在年線之上' : '在年線之下' }}
        </p>
        <button
          v-if="item"
          class="mt-2 cursor-pointer border-2 border-amber-200/30 px-2 py-0.5 text-button text-amber-100 transition hover:bg-amber-200/10 disabled:cursor-default disabled:opacity-60 font-pixel"
          type="button"
          :disabled="['saving', 'saved'].includes(alertState[`${yearLineCondition}-${long.keyLevel.price}`] ?? '')"
          @click="setAlert(yearLineCondition, long.keyLevel.price, yearLineNote)"
        >
          {{ alertLabel(yearLineCondition, long.keyLevel.price) }}
        </button>
        <p v-if="alertError(yearLineCondition, long.keyLevel.price)" class="mt-1 text-caption text-rose-200">
          {{ alertError(yearLineCondition, long.keyLevel.price) }}
        </p>
      </div>
      <div class="border-2 border-white/10 bg-white/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-stone-300">建議部位 <HelpTip term="position" /></p>
        <p class="mt-1 text-body font-medium text-stone-100">{{ long.positionSize }}</p>
      </div>
    </div>

    <!-- 短中期的關鍵價位 -->
    <div v-else class="grid gap-3 sm:grid-cols-3">
      <div class="border-2 border-emerald-300/20 bg-emerald-300/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-emerald-200/80">{{ advice.levels.stopLossLabel }} <HelpTip term="stopLoss" /></p>
        <p class="mt-1 text-subtitle font-semibold tabular-nums text-stone-50">{{ formatNumber(advice.levels.stopLoss.price) }}</p>
        <p class="text-caption text-stone-300">{{ advice.levels.stopLoss.label }}</p>
        <button
          v-if="item"
          class="mt-2 cursor-pointer border-2 border-emerald-300/30 px-2 py-0.5 text-button text-emerald-100 transition hover:bg-emerald-300/10 disabled:cursor-default disabled:opacity-60 font-pixel"
          type="button"
          :disabled="['saving', 'saved'].includes(alertState[`below-${advice.levels.stopLoss.price}`] ?? '')"
          @click="setAlert('below', advice.levels.stopLoss.price, `${advice.levels.stopLossLabel}：${advice.levels.stopLoss.label}`)"
        >
          {{ alertLabel('below', advice.levels.stopLoss.price) }}
        </button>
        <p v-if="alertError('below', advice.levels.stopLoss.price)" class="mt-1 text-caption text-rose-200">
          {{ alertError('below', advice.levels.stopLoss.price) }}
        </p>
      </div>
      <div class="border-2 border-rose-300/20 bg-rose-300/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-rose-200/80">{{ advice.levels.targetsLabel }} <HelpTip term="targets" /></p>
        <template v-if="advice.levels.targets.length">
          <div v-for="target in advice.levels.targets" :key="target.price" class="mt-1">
            <span class="text-subtitle font-semibold tabular-nums text-stone-50">{{ formatNumber(target.price) }}</span>
            <span class="ml-2 text-caption text-stone-300">{{ target.label }}</span>
            <button
              v-if="item"
              class="ml-2 cursor-pointer border-2 border-rose-300/30 px-2 py-0.5 text-button text-rose-100 transition hover:bg-rose-300/10 disabled:cursor-default disabled:opacity-60 font-pixel"
              type="button"
              :disabled="['saving', 'saved'].includes(alertState[`above-${target.price}`] ?? '')"
              @click="setAlert('above', target.price, `${advice.levels.targetsLabel}：${target.label}`)"
            >
              {{ alertLabel('above', target.price) }}
            </button>
            <p v-if="alertError('above', target.price)" class="mt-1 text-caption text-rose-200">{{ alertError('above', target.price) }}</p>
          </div>
        </template>
        <p v-else class="mt-1 text-body text-stone-300">—</p>
      </div>
      <div class="border-2 border-white/10 bg-white/5 p-3">
        <p class="flex items-center gap-1.5 text-body text-stone-300">建議部位 <HelpTip term="position" /></p>
        <p class="mt-1 text-body font-medium text-stone-100">{{ advice.positionSize }}</p>
        <p v-if="advice.levels.riskReward !== null" class="mt-1 text-caption text-stone-300">
          風險報酬比 <span class="tabular-nums" :class="advice.levels.riskReward >= 1.5 ? 'text-rose-200' : 'text-stone-300'">{{ advice.levels.riskReward }}</span>
          <HelpTip class="ml-1" term="riskReward" />
        </p>
      </div>
    </div>

    <!-- 怎麼做 -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
        <p class="text-body font-medium text-amber-100/80">還沒進場</p>
        <p class="mt-1 text-body text-stone-100">{{ view.forNew }}</p>
      </div>
      <div class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
        <p class="text-body font-medium text-amber-100/80">已經持有</p>
        <p class="mt-1 text-body text-stone-100">{{ view.forHolders }}</p>
      </div>
    </div>

    <!-- 判斷依據 -->
    <div class="space-y-2">
      <p class="flex items-center gap-1.5 text-body font-medium text-stone-300">判斷依據 <HelpTip term="evidence" /></p>
      <div v-for="[group, items] in groups" :key="group" class="space-y-1">
        <p class="text-caption tracking-wide text-stone-300">{{ group }}</p>
        <ul class="space-y-1 text-body">
          <li v-for="item in items" :key="item.label" class="flex gap-2" :class="item.counted ? '' : 'opacity-60'">
            <span class="w-[2.5em] flex-shrink-0 whitespace-nowrap font-medium" :class="directionMark(item.direction).cls">
              {{ item.counted ? directionMark(item.direction).text : '不計' }}
            </span>
            <span class="min-w-0 text-stone-200">
              {{ item.label }}
              <span v-if="item.detail" class="block text-caption text-stone-300">{{ item.detail }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 風險 -->
    <ul v-if="view.risks.length" class="space-y-1 border-2 border-amber-200/20 bg-amber-200/5 p-3 text-body text-amber-100/85">
      <li v-for="risk in view.risks" :key="risk">{{ risk }}</li>
    </ul>

    <p v-if="mode === 'long' && long" class="text-caption text-stone-300">
      長期建議由固定規則計算：年線的位置與方向、近一年和大盤比、過去一直抱著的報酬，台股個股再加上估值與營收。歷史表現不代表未來，存股前請再確認公司基本面。
    </p>
    <p v-else class="text-caption text-stone-300">
      這份建議由固定規則計算：技術面、在這檔標的有歷史優勢的訊號、表現最好的策略現在的狀態，以及（可靠時）機器學習模型。歷史表現不代表未來，停損請確實執行。
    </p>
  </div>
</template>
