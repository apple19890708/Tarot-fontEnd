<script setup lang="ts">
import { computed } from 'vue'

import { formatNumber, vsPrevClass } from '../../lib/marketChart'

// 股市總覽與自訂股票追蹤的表格檢視：一列一檔——商品、市價（有持股時下面一行是均價）、漲跌（箭頭＋漲跌＋百分比）、［有持股時：持有、損益］、開盤、最高、最低、成交量。
// 漲紅跌綠；開高低和昨收比（高紅、低綠、一樣白）。窄螢幕時「商品」那一欄固定在左邊，其他欄左右捲。點一列開個股分析（由父元件開）
export interface StockTableRow {
  key: string
  name: string
  code: string
  price: number | null
  change: number | null
  changePct: number | null
  open: number | null
  high: number | null
  low: number | null
  // 已經換好單位的成交量文字（台股「張」、美股「股」），沒有資料是 null
  volume: string | null
  // 自己的持股（自訂股票追蹤、自選清單）：均價（每股）、持有數量文字（台股張、美股股）、未實現損益；沒有持股是 null
  holding?: { avgCost: number | null; quantity: string; pnl: number | null; pnlPct: number | null } | null
}
const props = defineProps<{ rows: StockTableRow[] }>()
// 有任何一檔有持股才顯示均價、持有、損益（推薦股票不會有）
const showHolding = computed(() => props.rows.some((row) => row.holding))
const emit = defineEmits<{ open: [key: string] }>()

const tone = (value: number | null) => (!value ? 'text-ink-muted' : value > 0 ? 'text-up' : 'text-down')
const arrow = (value: number | null) => (!value ? '' : value > 0 ? '▲' : '▼')
// 昨收＝市價－漲跌（開高低上色用）
const prevClose = (row: StockTableRow) => (row.price !== null && row.change !== null ? row.price - row.change : null)

// 固定在左邊的商品欄：要有實心底，捲過去的欄才不會從底下透出來；右邊一條線分隔
const STICKY = 'sticky left-0 z-10 bg-surface shadow-[2px_0_0_var(--c-line)]'
</script>

<template>
  <div class="overflow-x-auto border-2 border-tint/10">
    <table class="w-full text-body tabular-nums" :class="showHolding ? 'min-w-[52rem]' : 'min-w-[40rem]'">
      <thead>
        <tr class="border-b-2 border-tint/10 text-caption text-ink-muted">
          <th scope="col" class="px-3 py-2 text-left font-normal" :class="STICKY">商品</th>
          <!-- 有持股時市價、均價放同一欄（上市價、下均價），方便直接比較 -->
          <th scope="col" class="px-3 py-2 text-right font-normal">
            市價<span v-if="showHolding" class="block">均價</span>
          </th>
          <th scope="col" class="px-3 py-2 text-right font-normal">漲跌</th>
          <template v-if="showHolding">
            <th scope="col" class="px-3 py-2 text-right font-normal">持有</th>
            <th scope="col" class="px-3 py-2 text-right font-normal">損益</th>
          </template>
          <th scope="col" class="px-3 py-2 text-right font-normal">開盤</th>
          <th scope="col" class="px-3 py-2 text-right font-normal">最高</th>
          <th scope="col" class="px-3 py-2 text-right font-normal">最低</th>
          <th scope="col" class="px-3 py-2 text-right font-normal">成交量</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.key"
          class="group cursor-pointer border-b border-tint/5 transition last:border-b-0 hover:bg-tint/10"
          tabindex="0"
          :aria-label="`${row.name} 個股分析`"
          @click="emit('open', row.key)"
          @keydown.enter="emit('open', row.key)"
        >
          <!-- 名稱一行不斷開，代號放第二行。名稱限制寬度、超過用 … 截斷（滑過看全名）：
               美股英文全名（Micron Technology, Inc.）會把固定的商品欄撐到半個手機寬，其他欄被擠出畫面。
               手機 7.5em、平板 12em；桌機（lg 以上）表格夠寬，放到 20em 讓英文全名完整顯示。用 em 才會跟著字級變寬 -->
          <th scope="row" class="px-3 py-2 text-left font-normal group-hover:bg-[color-mix(in_oklab,var(--c-surface)_90%,var(--c-tint))]" :class="STICKY">
            <span class="block max-w-[7.5em] truncate whitespace-nowrap font-semibold text-ink sm:max-w-[12em] lg:max-w-[20em]" :title="row.name">{{ row.name }}</span>
            <span class="block text-caption text-ink-muted">{{ row.code }}</span>
          </th>
          <td class="whitespace-nowrap px-3 py-2 text-right">
            <span class="block" :class="tone(row.change)">{{ formatNumber(row.price) }}</span>
            <span v-if="row.holding" class="block text-caption text-ink-soft">{{ formatNumber(row.holding.avgCost) }}</span>
          </td>
          <td class="whitespace-nowrap px-3 py-2 text-right" :class="tone(row.change)">
            <!-- 上下兩行：上面箭頭＋漲跌，下面百分比 -->
            <template v-if="row.change !== null">
              <span class="block"><span class="mr-0.5 text-caption" aria-hidden="true">{{ arrow(row.change) }}</span>{{ formatNumber(Math.abs(row.change)) }}</span>
              <span v-if="row.changePct !== null" class="block text-caption">{{ `${row.changePct > 0 ? '+' : ''}${formatNumber(row.changePct)}%` }}</span>
            </template>
            <template v-else>—</template>
          </td>
          <!-- 持股：持有數量、未實現損益（上下兩行：金額、百分比）；均價在市價欄 -->
          <template v-if="showHolding">
            <td class="whitespace-nowrap px-3 py-2 text-right text-ink-soft">{{ row.holding?.quantity ?? '—' }}</td>
            <td class="whitespace-nowrap px-3 py-2 text-right" :class="tone(row.holding?.pnl ?? null)">
              <template v-if="row.holding && row.holding.pnl !== null">
                <span class="block">{{ row.holding.pnl > 0 ? '+' : '' }}{{ formatNumber(Math.round(row.holding.pnl), 0) }}</span>
                <span v-if="row.holding.pnlPct !== null" class="block text-caption">{{ row.holding.pnlPct > 0 ? '+' : '' }}{{ formatNumber(row.holding.pnlPct) }}%</span>
              </template>
              <template v-else>—</template>
            </td>
          </template>
          <td class="px-3 py-2 text-right" :class="vsPrevClass(row.open, prevClose(row))">{{ formatNumber(row.open) }}</td>
          <td class="px-3 py-2 text-right" :class="vsPrevClass(row.high, prevClose(row))">{{ formatNumber(row.high) }}</td>
          <td class="px-3 py-2 text-right" :class="vsPrevClass(row.low, prevClose(row))">{{ formatNumber(row.low) }}</td>
          <td class="whitespace-nowrap px-3 py-2 text-right text-ink-soft">{{ row.volume ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
