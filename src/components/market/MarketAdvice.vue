<script setup lang="ts">
import { computed, ref } from 'vue'

import { addMarketAlert } from '../../lib/marketAlerts'
import { formatNumber } from '../../lib/marketChart'
import type { MarketAdvice, MarketAlert, MarketItem } from '../../types'

// 操作建議：後端依技術面、回測、策略、機器學習以固定規則算出來的結論。文字全來自後端。
const props = defineProps<{
  advice: MarketAdvice
  // 一鍵設定價位提醒要用到標的資訊
  item?: MarketItem
}>()

// 一鍵把停損或目標價設成提醒：key 是價格，值是設定狀態
const alertState = ref<Record<string, 'saving' | 'saved' | string>>({})

async function setAlert(condition: MarketAlert['condition'], price: number, note: string) {
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

function alertLabel(condition: MarketAlert['condition'], price: number) {
  const state = alertState.value[`${condition}-${price}`]
  if (state === 'saving') return '設定中…'
  if (state === 'saved') return '已設提醒'
  return '設提醒'
}

function alertError(condition: MarketAlert['condition'], price: number) {
  const state = alertState.value[`${condition}-${price}`]
  return state && state !== 'saving' && state !== 'saved' ? state : ''
}

// 台灣習慣：偏多紅、偏空綠
const STANCE_STYLES: Record<MarketAdvice['stance'], string> = {
  bullish: 'border-rose-300/40 bg-rose-300/15 text-rose-100',
  bearish: 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100',
  neutral: 'border-white/20 bg-white/10 text-stone-100',
}

function directionMark(direction: number) {
  if (direction > 0) return { text: '偏多', cls: 'text-rose-300' }
  if (direction < 0) return { text: '偏空', cls: 'text-emerald-300' }
  return { text: '中性', cls: 'text-stone-400' }
}

const groups = computed(() => {
  const map = new Map<string, MarketAdvice['evidence']>()
  for (const item of props.advice.evidence) {
    map.set(item.group, [...(map.get(item.group) ?? []), item])
  }
  return [...map.entries()]
})
</script>

<template>
  <div class="space-y-4">
    <!-- 結論 -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="border-2 px-3 py-1 text-base font-semibold" :class="STANCE_STYLES[advice.stance]">
        {{ advice.stanceLabel }}
      </span>
      <span class="text-sm text-stone-300">信心 {{ advice.confidenceLabel }}</span>
      <span class="text-xs text-stone-500">適用 {{ advice.horizon }}</span>
    </div>
    <p class="text-sm leading-7 text-stone-200/90">{{ advice.summary }}</p>

    <!-- 關鍵價位 -->
    <div class="grid gap-3 sm:grid-cols-3">
      <div class="border-2 border-emerald-300/20 bg-emerald-300/5 p-3">
        <p class="text-xs text-emerald-200/80">{{ advice.levels.stopLossLabel }}</p>
        <p class="mt-1 text-lg font-semibold tabular-nums text-stone-50">{{ formatNumber(advice.levels.stopLoss.price) }}</p>
        <p class="text-[11px] leading-4 text-stone-400">{{ advice.levels.stopLoss.label }}</p>
        <button
          v-if="item"
          class="mt-2 cursor-pointer border-2 border-emerald-300/30 px-2 py-0.5 text-[11px] text-emerald-100 transition hover:bg-emerald-300/10 disabled:cursor-default disabled:opacity-60 font-pixel"
          type="button"
          :disabled="['saving', 'saved'].includes(alertState[`below-${advice.levels.stopLoss.price}`] ?? '')"
          @click="setAlert('below', advice.levels.stopLoss.price, `${advice.levels.stopLossLabel}：${advice.levels.stopLoss.label}`)"
        >
          {{ alertLabel('below', advice.levels.stopLoss.price) }}
        </button>
        <p v-if="alertError('below', advice.levels.stopLoss.price)" class="mt-1 text-[11px] text-rose-200">
          {{ alertError('below', advice.levels.stopLoss.price) }}
        </p>
      </div>
      <div class="border-2 border-rose-300/20 bg-rose-300/5 p-3">
        <p class="text-xs text-rose-200/80">{{ advice.levels.targetsLabel }}</p>
        <template v-if="advice.levels.targets.length">
          <div v-for="target in advice.levels.targets" :key="target.price" class="mt-1">
            <span class="text-lg font-semibold tabular-nums text-stone-50">{{ formatNumber(target.price) }}</span>
            <span class="ml-2 text-[11px] text-stone-400">{{ target.label }}</span>
            <button
              v-if="item"
              class="ml-2 cursor-pointer border-2 border-rose-300/30 px-2 py-0.5 text-[11px] text-rose-100 transition hover:bg-rose-300/10 disabled:cursor-default disabled:opacity-60 font-pixel"
              type="button"
              :disabled="['saving', 'saved'].includes(alertState[`above-${target.price}`] ?? '')"
              @click="setAlert('above', target.price, `${advice.levels.targetsLabel}：${target.label}`)"
            >
              {{ alertLabel('above', target.price) }}
            </button>
            <p v-if="alertError('above', target.price)" class="mt-1 text-[11px] text-rose-200">{{ alertError('above', target.price) }}</p>
          </div>
        </template>
        <p v-else class="mt-1 text-sm text-stone-400">—</p>
      </div>
      <div class="border-2 border-white/10 bg-white/5 p-3">
        <p class="text-xs text-stone-400">建議部位</p>
        <p class="mt-1 text-sm font-medium leading-6 text-stone-100">{{ advice.positionSize }}</p>
        <p v-if="advice.levels.riskReward !== null" class="mt-1 text-[11px] text-stone-400">
          風險報酬比 <span class="tabular-nums" :class="advice.levels.riskReward >= 1.5 ? 'text-rose-200' : 'text-stone-300'">{{ advice.levels.riskReward }}</span>
        </p>
      </div>
    </div>

    <!-- 怎麼做 -->
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
        <p class="text-xs font-medium text-amber-100/80">還沒進場</p>
        <p class="mt-1 text-sm leading-7 text-stone-100">{{ advice.forNew }}</p>
      </div>
      <div class="border-2 border-amber-200/20 bg-amber-200/5 p-3">
        <p class="text-xs font-medium text-amber-100/80">已經持有</p>
        <p class="mt-1 text-sm leading-7 text-stone-100">{{ advice.forHolders }}</p>
      </div>
    </div>

    <!-- 判斷依據 -->
    <div class="space-y-2">
      <p class="text-xs font-medium text-stone-300">判斷依據</p>
      <div v-for="[group, items] in groups" :key="group" class="space-y-1">
        <p class="text-[11px] tracking-wide text-stone-500">{{ group }}</p>
        <ul class="space-y-1 text-xs">
          <li v-for="item in items" :key="item.label" class="flex gap-2" :class="item.counted ? '' : 'opacity-60'">
            <span class="w-8 flex-shrink-0 font-medium" :class="directionMark(item.direction).cls">
              {{ item.counted ? directionMark(item.direction).text : '不計' }}
            </span>
            <span class="min-w-0 text-stone-200">
              {{ item.label }}
              <span v-if="item.detail" class="block text-[11px] leading-5 text-stone-400">{{ item.detail }}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 風險 -->
    <ul v-if="advice.risks.length" class="space-y-1 border-2 border-amber-200/20 bg-amber-200/5 p-3 text-xs leading-5 text-amber-100/85">
      <li v-for="risk in advice.risks" :key="risk">{{ risk }}</li>
    </ul>

    <p class="text-[11px] leading-5 text-stone-500">
      這份建議由固定規則計算：技術面、在這檔標的有歷史優勢的訊號、表現最好的策略現在的狀態，以及（可靠時）機器學習模型。歷史表現不代表未來，停損請確實執行。
    </p>
  </div>
</template>
