<script setup lang="ts">
import { computed, toRef } from 'vue'

import HelpTip from '../HelpTip.vue'
import ListPager from '../ListPager.vue'
import { formatNumber } from '../../lib/marketChart'
import { usePaged } from '../../lib/usePaged'
import type { MarketDividendRecord } from '../../types'

// 個股分析的「除權息」分頁：近 5 年每次除權息一列（年度、除權息日、股票股利上／現金股利下、殖利率、填息）。
// 數字全由後端算（item.dividendRecords），這裡只排版與上色；月配的一年有 12 列，所以分頁
const props = defineProps<{ records: MarketDividendRecord[] | null; market: 'tw' | 'us' }>()

const list = toRef(() => props.records ?? [])
const { items: pageItems, page, pageSize, total } = usePaged(list, 'stock-dividend-records', 10)
// 美股沒有配股，股票股利那一行不顯示
const showStock = computed(() => props.market === 'tw')

// 同一年的第二列起年度留白，一年一組比較好掃
const yearShown = (index: number) => index === 0 || pageItems.value[index - 1]?.year !== pageItems.value[index]?.year
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`

// 填息天數的顏色和股利獲利頁的填息追蹤一致：5 天內綠、超過 30 天黃、還沒填紅
function fillClass(record: MarketDividendRecord) {
  const fill = record.fill
  if (!fill) return 'text-ink-muted'
  if (!fill.filledOn) return 'text-danger'
  if ((fill.days ?? 0) <= 5) return 'text-ok'
  if ((fill.days ?? 0) > 30) return 'text-warn'
  return 'text-ink-soft'
}
function fillText(record: MarketDividendRecord) {
  const fill = record.fill
  if (!fill) return '—'
  if (fill.filledOn) return fill.days === 1 ? '當天填息' : `${fill.days} 天填息`
  return '還沒填息'
}
function fillDetail(record: MarketDividendRecord) {
  const fill = record.fill
  if (!fill) return ''
  if (fill.filledOn) return shortDate(fill.filledOn)
  return `還差 ${formatNumber(fill.gapPct, 1)}%．已過 ${fill.daysSince} 天`
}
</script>

<template>
  <div class="space-y-3">
    <p class="flex items-center gap-1.5 text-body text-ink-muted">
      近 5 年的除權息、當時的殖利率與填息天數 <HelpTip term="dividendRecords" />
    </p>
    <p v-if="records === null" class="text-body text-ink-muted">股利資料暫時取不到，請稍後再試。</p>
    <p v-else-if="!records.length" class="text-body text-ink-muted">近 5 年沒有除權息紀錄。</p>
    <template v-else>
      <div class="overflow-x-auto border-2 border-tint/10">
        <table class="w-full min-w-[30rem] text-body tabular-nums">
          <thead>
            <tr class="border-b-2 border-tint/10 text-caption text-ink-muted">
              <th scope="col" class="px-3 py-2 text-left font-normal">年度</th>
              <th scope="col" class="px-3 py-2 text-left font-normal">除息日</th>
              <th scope="col" class="px-3 py-2 text-right font-normal">
                <template v-if="showStock"><span class="block">股票股利</span><span class="block">現金股利</span></template>
                <template v-else>現金股利</template>
              </th>
              <th scope="col" class="px-3 py-2 text-right font-normal">殖利率</th>
              <th scope="col" class="px-3 py-2 text-right font-normal">填息</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(record, index) in pageItems"
              :key="record.exDate"
              class="border-tint/5"
              :class="yearShown(index) && index > 0 ? 'border-t-2 border-t-tint/10' : 'border-t'"
            >
              <th scope="row" class="px-3 py-2 text-left font-semibold text-ink">{{ yearShown(index) ? record.year : '' }}</th>
              <td class="whitespace-nowrap px-3 py-2 text-ink-soft">{{ shortDate(record.exDate) }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-right">
                <span v-if="showStock" class="block" :class="record.stock ? 'text-warn' : 'text-ink-muted'">{{ record.stock ? formatNumber(record.stock, 4) : '—' }}</span>
                <span class="block" :class="record.cash ? 'text-ink' : 'text-ink-muted'">{{ record.cash ? formatNumber(record.cash, 4) : '—' }}</span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right text-accent">{{ record.yieldPct === null ? '—' : `${formatNumber(record.yieldPct)}%` }}</td>
              <td class="whitespace-nowrap px-3 py-2 text-right">
                <span class="block" :class="fillClass(record)">{{ fillText(record) }}</span>
                <span v-if="fillDetail(record)" class="block text-caption text-ink-muted">{{ fillDetail(record) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ListPager v-model:page="page" v-model:page-size="pageSize" :total="total" />
      <p class="text-caption text-ink-muted">股利單位：元／每股{{ market === 'us' ? '（美元）' : '' }}。資料來源：Yahoo Finance。</p>
    </template>
  </div>
</template>
