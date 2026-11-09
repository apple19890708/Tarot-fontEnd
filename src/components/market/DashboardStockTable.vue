<script setup lang="ts">
import { formatNumber, vsPrevClass } from '../../lib/marketChart'

// 股市總覽的表格檢視（推薦／熱門股票、自選清單）：一列一檔——商品、成交、漲跌（箭頭＋漲跌＋百分比）、開盤、最高、最低、成交量。
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
}
defineProps<{ rows: StockTableRow[] }>()
const emit = defineEmits<{ open: [key: string] }>()

const tone = (value: number | null) => (!value ? 'text-ink-muted' : value > 0 ? 'text-up' : 'text-down')
const arrow = (value: number | null) => (!value ? '' : value > 0 ? '▲' : '▼')
// 昨收＝成交－漲跌（開高低上色用）
const prevClose = (row: StockTableRow) => (row.price !== null && row.change !== null ? row.price - row.change : null)

// 固定在左邊的商品欄：要有實心底，捲過去的欄才不會從底下透出來；右邊一條線分隔
const STICKY = 'sticky left-0 z-10 bg-surface shadow-[2px_0_0_var(--c-line)]'
</script>

<template>
  <div class="overflow-x-auto border-2 border-tint/10">
    <table class="w-full min-w-[40rem] text-body tabular-nums">
      <thead>
        <tr class="border-b-2 border-tint/10 text-caption text-ink-muted">
          <th scope="col" class="px-3 py-2 text-left font-normal" :class="STICKY">商品</th>
          <th scope="col" class="px-3 py-2 text-right font-normal">成交</th>
          <th scope="col" class="px-3 py-2 text-right font-normal">漲跌</th>
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
          <td class="px-3 py-2 text-right" :class="tone(row.change)">{{ formatNumber(row.price) }}</td>
          <td class="whitespace-nowrap px-3 py-2 text-right" :class="tone(row.change)">
            <!-- 上下兩行：上面箭頭＋漲跌，下面百分比 -->
            <template v-if="row.change !== null">
              <span class="block"><span class="mr-0.5 text-caption" aria-hidden="true">{{ arrow(row.change) }}</span>{{ formatNumber(Math.abs(row.change)) }}</span>
              <span v-if="row.changePct !== null" class="block text-caption">{{ `${row.changePct > 0 ? '+' : ''}${formatNumber(row.changePct)}%` }}</span>
            </template>
            <template v-else>—</template>
          </td>
          <td class="px-3 py-2 text-right" :class="vsPrevClass(row.open, prevClose(row))">{{ formatNumber(row.open) }}</td>
          <td class="px-3 py-2 text-right" :class="vsPrevClass(row.high, prevClose(row))">{{ formatNumber(row.high) }}</td>
          <td class="px-3 py-2 text-right" :class="vsPrevClass(row.low, prevClose(row))">{{ formatNumber(row.low) }}</td>
          <td class="whitespace-nowrap px-3 py-2 text-right text-ink-soft">{{ row.volume ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
