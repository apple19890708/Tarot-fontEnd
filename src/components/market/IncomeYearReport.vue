<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DataTable from '../DataTable.vue'
import HelpTip from '../HelpTip.vue'
import ListPager from '../ListPager.vue'
import { usePaged } from '../../lib/usePaged'

import { formatNumber } from '../../lib/marketChart'
import type { IncomeItem } from '../../types'
import StockNameCell from '../StockNameCell.vue'

// 年度報表（v20 階段 9）：依年份列出每一筆買進、賣出、現金股利、配股，含手續費、證交稅、已實現損益，可以匯出 CSV。
// 每一筆的手續費、稅、已實現損益都是後端算好的（position.trades 與 trades 同順序）；這裡只依年份分組加總、排版。
// 只做對帳用的整理，不算應繳稅額。沒填日期的放在「未填日期」
// pendingDividends：應收股利還沒帶入的筆數（這裡只算已記錄的，有沒帶入的要提醒，不然股利會是 0 看不懂）
const props = defineProps<{ items: IncomeItem[]; pendingDividends?: number }>()

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
        buys: list.filter((row) => row.kind === 'buy').length,
        sells: list.filter((row) => row.kind === 'sell').length,
        dividendCount: list.filter((row) => row.kind === 'dividend').length,
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
      <p class="flex items-center gap-1 text-body text-ink-muted">年度對帳表<HelpTip term="yearReport" /></p>
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

    <p class="text-caption text-ink-muted">你記下的買賣與股利依年份整理，拿來和券商對帳單對照；只算已經記錄的，不是報稅試算。</p>
    <p v-if="pendingDividends" class="text-body text-warn">還有 {{ pendingDividends }} 筆應收股利沒帶入，帶入後才會算進這裡的「記錄的現金股利」。</p>

    <!-- 合計：標籤寫清楚是「這一年」的什麼（2026-11-10 使用者回報意義不明） -->
    <div class="grid gap-2 sm:grid-cols-2">
      <dl v-for="side in summary" :key="side.market" class="space-y-1 border-2 border-tint/10 bg-tint/5 p-3 text-body">
        <p class="flex flex-wrap items-baseline justify-between gap-x-3">
          <span class="font-semibold text-ink">{{ side.label }}</span>
          <span class="text-caption text-ink-muted">買進 {{ side.buys }} 筆、賣出 {{ side.sells }} 筆、股利 {{ side.dividendCount }} 筆</span>
        </p>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">賣掉的部分賺賠</dt><dd class="tabular-nums" :class="trendClass(side.realized)">{{ formatNumber(side.realized, digits(side.market)) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">記錄的現金股利</dt><dd class="tabular-nums text-accent">{{ formatNumber(side.dividends, digits(side.market)) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">付的手續費（買賣都算）</dt><dd class="tabular-nums text-ink-soft">{{ formatNumber(side.fees, digits(side.market)) }}</dd></div>
        <div class="flex justify-between gap-3"><dt class="text-ink-muted">付的證交稅（賣出才有）</dt><dd class="tabular-nums text-ink-soft">{{ formatNumber(side.tax, digits(side.market)) }}</dd></div>
      </dl>
    </div>

    <!-- 明細：手機自己橫向捲動 -->
    <details>
      <summary class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">明細（{{ shown.length }} 筆）</summary>
      <DataTable class="mt-2" table-class="min-w-[56rem]">
        <template #head>
            <tr>
              <th>日期</th>
              <th>股票</th>
              <th>類別</th>
              <th>數量</th>
              <th>成交價</th>
              <th>金額</th>
              <th>手續費</th>
              <th>證交稅</th>
              <th>賣掉賺賠</th>
            </tr>
        </template>
            <tr v-for="(row, index) in pageRows" :key="index">
              <td class="whitespace-nowrap text-ink-soft">{{ row.date ?? '未填' }}</td>
              <td><StockNameCell :name="row.name" :code="row.code" /></td>
              <td class="whitespace-nowrap" :class="row.kind === 'sell' ? 'text-down-ink' : row.kind === 'buy' ? 'text-up-ink' : 'text-warn'">{{ KIND_LABELS[row.kind] }}</td>
              <td class="text-ink-soft">{{ row.quantity === null ? '' : `${formatNumber(row.quantity, 3)} ${row.market === 'tw' ? '張' : '股'}` }}</td>
              <td class="text-ink-soft">{{ row.price === null ? '' : formatNumber(row.price) }}</td>
              <td class="text-ink-soft">{{ cell(row.amount, row.market) }}</td>
              <td class="text-ink-muted">{{ cell(row.fee, row.market) }}</td>
              <td class="text-ink-muted">{{ cell(row.tax, row.market) }}</td>
              <td :class="trendClass(row.realized)">{{ cell(row.realized, row.market) }}</td>
            </tr>
      </DataTable>
      <ListPager v-model:page="page" v-model:page-size="pageSize" :total="total" class="mt-2" />
    </details>
  </section>
</template>
