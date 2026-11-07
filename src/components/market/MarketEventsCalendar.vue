<script setup lang="ts">
import { computed } from 'vue'

import { formatNumber, formatSigned } from '../../lib/marketChart'
import type { MarketWatchItem } from '../../types'

// 除權息與營收一覽：追蹤清單裡台股的即將除權息（依日期排）與最新月營收年增率（由高到低）。
// 資料來自清單摘要（證交所、櫃買中心的公開資料），這裡只排序與顯示
const props = defineProps<{
  items: MarketWatchItem[]
  revenueDeadline?: { deadline: string; forMonth: string } | null
}>()

const nameOf = (item: MarketWatchItem) => item.summary?.name || item.target.name
const UNIT_SHARES = 1000

const exDividends = computed(() =>
  props.items
    .filter((item) => item.summary?.events?.exDividend)
    .map((item) => {
      const event = item.summary!.events!.exDividend!
      const quantity = item.position?.quantity ?? 0
      return {
        id: item.id,
        name: nameOf(item),
        code: item.target.code,
        event,
        // 持有中才算預估可領的現金股利（張數 × 1000 股 × 每股現金）
        estimate: event.cashDividend && quantity > 0 ? event.cashDividend * quantity * UNIT_SHARES : null,
      }
    })
    .sort((a, b) => a.event.date.localeCompare(b.event.date)),
)

const revenues = computed(() =>
  props.items
    .filter((item) => item.summary?.events?.revenue)
    .map((item) => ({ id: item.id, name: nameOf(item), code: item.target.code, revenue: item.summary!.events!.revenue! }))
    .sort((a, b) => (b.revenue.yoy ?? -Infinity) - (a.revenue.yoy ?? -Infinity)),
)

const monthText = (month: string) => `${Number(month.slice(5))} 月`
const dateText = (date: string) => date.slice(5).replace('-', '/')
const trendClass = (value: number | null) => (!value ? 'text-stone-300' : value > 0 ? 'text-rose-300' : 'text-emerald-300')
</script>

<template>
  <div class="space-y-4 text-body">
    <p v-if="!exDividends.length && !revenues.length" class="text-stone-300">追蹤清單裡沒有台股個股，或公開資料暫時取不到。</p>

    <section v-if="exDividends.length" class="space-y-1.5">
      <p class="text-stone-300">即將除權息</p>
      <ul class="space-y-1 tabular-nums">
        <li v-for="row in exDividends" :key="row.id" class="flex flex-wrap items-center gap-x-3">
          <span class="w-[3.5em] shrink-0 whitespace-nowrap text-amber-200">{{ dateText(row.event.date) }}</span>
          <span class="text-stone-100">{{ row.name }} <span class="text-stone-300">{{ row.code }}</span></span>
          <span class="text-stone-300">除{{ row.event.type }}</span>
          <span v-if="row.event.cashDividend" class="text-stone-300">每股 {{ formatNumber(row.event.cashDividend, 4) }} 元</span>
          <span v-if="row.event.stockRatio" class="text-stone-300">配股 {{ formatNumber(row.event.stockRatio * 1000, 2) }} 股／張</span>
          <span v-if="row.estimate" class="text-amber-100">預估可領 {{ formatNumber(row.estimate, 0) }} 元</span>
        </li>
      </ul>
    </section>

    <section v-if="revenues.length" class="space-y-1.5">
      <p class="text-stone-300">
        最新月營收
        <span v-if="revenueDeadline" class="ml-1 text-stone-300">
          （{{ monthText(revenueDeadline.forMonth) }}營收在 {{ dateText(revenueDeadline.deadline) }} 前公布）
        </span>
      </p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[26rem] tabular-nums">
          <thead>
            <tr class="border-b border-white/10 text-left text-stone-300">
              <th class="py-1 pr-3 font-normal">公司</th>
              <th class="py-1 pr-3 font-normal">月份</th>
              <th class="py-1 pr-3 text-right font-normal">年增</th>
              <th class="py-1 pr-3 text-right font-normal">月增</th>
              <th class="py-1 text-right font-normal">累計年增</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in revenues" :key="row.id" class="border-b border-white/5" :title="row.revenue.note || undefined">
              <td class="py-1 pr-3 text-stone-100">{{ row.name }} <span class="text-stone-300">{{ row.code }}</span></td>
              <td class="py-1 pr-3 text-stone-300">{{ monthText(row.revenue.month) }}</td>
              <td class="py-1 pr-3 text-right" :class="trendClass(row.revenue.yoy)">{{ formatSigned(row.revenue.yoy, '%') }}</td>
              <td class="py-1 pr-3 text-right" :class="trendClass(row.revenue.mom)">{{ formatSigned(row.revenue.mom, '%') }}</td>
              <td class="py-1 text-right" :class="trendClass(row.revenue.cumYoy)">{{ formatSigned(row.revenue.cumYoy, '%') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p class="text-caption text-stone-300">資料來自證交所、櫃買中心的公開資料（每 6 小時更新）。除權息預告只列即將發生的；美股沒有這兩項。</p>
  </div>
</template>
