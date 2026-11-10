<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ListPager from '../ListPager.vue'
import { usePaged } from '../../lib/usePaged'

import { formatNumber } from '../../lib/marketChart'
import type { IncomeItem } from '../../types'

// 年度報表（v20 階段 9）：依年份列出每一筆買進、賣出、現金股利、配股，含手續費、證交稅、已實現損益，可以匯出 CSV。
// 每一筆的手續費、稅、已實現損益都是後端算好的（position.trades 與 trades 同順序）；這裡只依年份分組加總、排版。
// 只做對帳用的整理，不算應繳稅額。沒填日期的放在「未填日期」
const props = defineProps<{ items: IncomeItem[] }>()

type Kind = 'buy' | 'sell' | 'stockDividend' | 'dividend'
const KIND_LABELS: Record<Kind, string> = { buy: '買進', sell: '賣出', stockDividend: '配股', dividend: '現金股利' }
const NO_DATE = '未填日期'
const ALL = 'all'

interface Row {
  year: string
  date: string | null
  market: 'tw' | 'us'
  code: string
  name: string
  kind: Kind
  quantity: number | null
  price: number | null
  amount: number | null
  fee: number | null
  tax: number | null
  realized: number | null
}

const rows = computed<Row[]>(() => {
  const list: Row[] = []
  for (const item of props.items) {
    if (!item.position) continue
    const { market } = item.target
    const unit = market === 'tw' ? 1000 : 1
    const code = item.target.code || item.target.symbol || ''
    const base = { market, code, name: item.target.name }
    ;(item.trades ?? []).forEach((trade, index) => {
      const detail = item.position?.trades?.[index]
      const isStock = trade.side === 'stockDividend'
      list.push({
        ...base,
        year: trade.date ? trade.date.slice(0, 4) : NO_DATE,
        date: trade.date,
        kind: trade.side,
        quantity: trade.quantity,
        price: isStock ? null : trade.price,
        amount: isStock ? null : trade.price * trade.quantity * unit,
        fee: isStock ? null : detail?.fee ?? null,
        tax: isStock ? null : detail?.tax ?? null,
        realized: trade.side === 'sell' ? detail?.realized ?? null : null,
      })
    })
    for (const dividend of item.dividends ?? []) {
      list.push({
        ...base,
        year: dividend.date ? dividend.date.slice(0, 4) : NO_DATE,
        date: dividend.date,
        kind: 'dividend',
        quantity: null,
        price: null,
        amount: dividend.amount,
        fee: null,
        tax: null,
        realized: null,
      })
    }
  }
  return list.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.code.localeCompare(b.code))
})

// 年份：新到舊，未填日期放最後
const years = computed(() => {
  const set = [...new Set(rows.value.map((row) => row.year))]
  return set.sort((a, b) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : b.localeCompare(a)))
})
const year = ref<string>('')
watch(
  years,
  (list) => {
    if (year.value !== ALL && !list.includes(year.value)) year.value = list[0] ?? ALL
  },
  { immediate: true },
)
const shown = computed(() => (year.value === ALL ? rows.value : rows.value.filter((row) => row.year === year.value)))

// 明細分頁（合計與 CSV 仍是整個年度）
const { items: pageRows, page, pageSize, total } = usePaged(shown, 'income-year-rows', 20)
// 合計：台股（元）、美股（美元）分開，不同幣別不相加
const summary = computed(() =>
  (['tw', 'us'] as const)
    .map((market) => {
      const list = shown.value.filter((row) => row.market === market)
      const sum = (pick: (row: Row) => number | null) => list.reduce((total, row) => total + (pick(row) ?? 0), 0)
      return {
        market,
        label: market === 'tw' ? '台股（元）' : '美股（美元）',
        count: list.length,
        realized: sum((row) => row.realized),
        dividends: sum((row) => (row.kind === 'dividend' ? row.amount : null)),
        fees: sum((row) => row.fee),
        tax: sum((row) => row.tax),
      }
    })
    .filter((side) => side.count),
)

const digits = (market: 'tw' | 'us') => (market === 'tw' ? 0 : 2)
const cell = (value: number | null, market: 'tw' | 'us') => (value === null ? '' : formatNumber(value, digits(market)))
function trendClass(value: number | null) {
  if (!value) return 'text-ink-muted'
  return value > 0 ? 'text-up' : 'text-down'
}

// ---- CSV ----
// UTF-8 加 BOM：Excel 直接開才不會亂碼。數字不加千分位（不然 Excel 會當成文字）
function csvValue(value: string | number | null) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
function exportCsv() {
  const header = ['年度', '日期', '市場', '代號', '名稱', '類別', '數量（台股張、美股股）', '成交價', '金額', '手續費', '證交稅', '已實現損益', '幣別']
  const lines = [header, ...shown.value.map((row) => [
    row.year,
    row.date ?? '',
    row.market === 'tw' ? '台股' : '美股',
    row.code,
    row.name,
    KIND_LABELS[row.kind],
    row.quantity,
    row.price,
    row.amount === null ? null : Math.round(row.amount * 100) / 100,
    row.fee,
    row.tax,
    row.realized,
    row.market === 'tw' ? 'TWD' : 'USD',
  ])].map((line) => line.map(csvValue).join(','))
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `持股年度報表-${year.value === ALL ? '全部' : year.value}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section v-if="rows.length" class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-body text-ink-muted">年度報表（對帳用，不是報稅試算）</p>
      <button
        type="button"
        class="cursor-pointer border-2 border-tint/15 px-3 py-1 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
        @click="exportCsv"
      >
        匯出 CSV（{{ year === 'all' ? '全部年度' : year }}）
      </button>
    </div>

    <!-- 年份：同一頁裡的篩選，選中用中性色 -->
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="option in [...years, ALL]"
        :key="option"
        type="button"
        class="cursor-pointer border-2 px-2.5 py-0.5 text-button transition active:translate-x-[1px] active:translate-y-[1px]"
        :class="year === option ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
        :aria-pressed="year === option"
        @click="year = option"
      >
        {{ option === ALL ? '全部年度' : option }}
      </button>
    </div>

    <!-- 合計 -->
    <div class="grid gap-2 sm:grid-cols-2">
      <dl v-for="side in summary" :key="side.market" class="space-y-1 border-2 border-tint/10 bg-tint/5 p-3 text-body">
        <p class="font-semibold text-ink">{{ side.label }}</p>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">已實現損益</dt><dd class="tabular-nums" :class="trendClass(side.realized)">{{ formatNumber(side.realized, digits(side.market)) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">現金股利</dt><dd class="tabular-nums text-accent">{{ formatNumber(side.dividends, digits(side.market)) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">手續費（買賣都算）</dt><dd class="tabular-nums text-ink-soft">{{ formatNumber(side.fees, digits(side.market)) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">證交稅</dt><dd class="tabular-nums text-ink-soft">{{ formatNumber(side.tax, digits(side.market)) }}</dd></div>
      </dl>
    </div>

    <!-- 明細：手機自己橫向捲動 -->
    <details>
      <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">明細（{{ shown.length }} 筆）</summary>
      <div class="mt-2 overflow-x-auto border-2 border-tint/10">
        <table class="w-full min-w-[56rem] text-left text-body tabular-nums">
          <thead class="bg-tint/5 text-caption text-ink-muted">
            <tr>
              <th class="px-3 py-2 font-normal">日期</th>
              <th class="px-3 py-2 font-normal">股票</th>
              <th class="px-3 py-2 font-normal">類別</th>
              <th class="px-3 py-2 text-right font-normal">數量</th>
              <th class="px-3 py-2 text-right font-normal">成交價</th>
              <th class="px-3 py-2 text-right font-normal">金額</th>
              <th class="px-3 py-2 text-right font-normal">手續費</th>
              <th class="px-3 py-2 text-right font-normal">證交稅</th>
              <th class="px-3 py-2 text-right font-normal">已實現損益</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in pageRows" :key="index" class="border-t border-tint/10">
              <td class="whitespace-nowrap px-3 py-1.5 text-ink-soft">{{ row.date ?? '未填' }}</td>
              <td class="px-3 py-1.5"><span class="text-ink">{{ row.name }}</span> <span class="text-caption text-ink-muted">{{ row.code }}</span></td>
              <td class="whitespace-nowrap px-3 py-1.5" :class="row.kind === 'sell' ? 'text-down-ink' : row.kind === 'buy' ? 'text-up-ink' : 'text-warn'">{{ KIND_LABELS[row.kind] }}</td>
              <td class="px-3 py-1.5 text-right text-ink-soft">{{ row.quantity === null ? '' : `${formatNumber(row.quantity, 3)} ${row.market === 'tw' ? '張' : '股'}` }}</td>
              <td class="px-3 py-1.5 text-right text-ink-soft">{{ row.price === null ? '' : formatNumber(row.price) }}</td>
              <td class="px-3 py-1.5 text-right text-ink-soft">{{ cell(row.amount, row.market) }}</td>
              <td class="px-3 py-1.5 text-right text-ink-muted">{{ cell(row.fee, row.market) }}</td>
              <td class="px-3 py-1.5 text-right text-ink-muted">{{ cell(row.tax, row.market) }}</td>
              <td class="px-3 py-1.5 text-right" :class="trendClass(row.realized)">{{ cell(row.realized, row.market) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ListPager v-model:page="page" v-model:page-size="pageSize" :total="total" class="mt-2" />
    </details>
  </section>
</template>
