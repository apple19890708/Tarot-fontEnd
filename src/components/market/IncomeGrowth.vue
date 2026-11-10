<script setup lang="ts">
import { computed } from 'vue'

import HelpTip from '../HelpTip.vue'
import ListPager from '../ListPager.vue'
import { formatNumber } from '../../lib/marketChart'
import { usePaged } from '../../lib/usePaged'
import { useStoredToggle } from '../../lib/useStoredToggle'
import type { IncomeItem } from '../../types'

// 股利成長（v20 2.9.7）：每檔近 5 年每年的每股股利（現金在上、配股在下），比前一年少的年份紅字＋▼。
// 數字與「有沒有減少」都由後端算（item.growth），這裡只排版。一檔一列、年份是欄（桌機手機同一張表，手機左右捲、股票欄固定）。
// 可以收合、記住開關（輔助性的長區塊）；有持股的排前面
const props = defineProps<{ items: IncomeItem[] }>()
const emit = defineEmits<{ open: [id: string] }>()

const open = useStoredToggle('income-growth', true)
const withGrowth = computed(() =>
  props.items
    .filter((item) => item.growth)
    .sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0) || a.target.name.localeCompare(b.target.name)),
)
const { items: pageItems, page, pageSize, total } = usePaged(withGrowth, 'income-growth', 10)
// 欄位的年份：每檔都是同一組（後端以今天往前 5 年），取第一檔的
const years = computed(() => withGrowth.value[0]?.growth?.years ?? [])
const decreasedCount = computed(() => withGrowth.value.filter((item) => item.growth!.decreasedYears.length).length)

const STICKY = 'sticky left-0 z-10 bg-surface shadow-[2px_0_0_var(--c-line)]'
</script>

<template>
  <section v-if="withGrowth.length" class="space-y-2">
    <p class="flex flex-wrap items-center gap-1 text-body text-ink-muted">
      <button type="button" class="flex cursor-pointer items-center gap-1 text-left transition hover:text-ink" :aria-expanded="open" @click="open = !open">
        <span class="inline-block transition" :class="open ? 'rotate-90' : ''" aria-hidden="true">▸</span>
        股利成長（近 5 年，每股）
        <span v-if="decreasedCount" class="text-danger">（{{ decreasedCount }} 檔有減少）</span>
      </button>
      <HelpTip term="dividendGrowth" />
    </p>
    <template v-if="open">
      <div class="overflow-x-auto border-2 border-tint/10">
        <table class="w-full min-w-[34rem] text-body tabular-nums">
          <thead class="bg-tint/5 text-caption text-ink-muted">
            <tr>
              <th scope="col" class="px-3 py-2 text-left font-normal" :class="STICKY">股票</th>
              <th v-for="year in years" :key="year.year" scope="col" class="px-3 py-2 text-right font-normal">
                {{ year.year }}<span v-if="year.partial" class="block">（到目前）</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in pageItems" :key="item.id" class="border-t border-tint/10">
              <th scope="row" class="px-3 py-2 text-left font-normal" :class="STICKY">
                <button
                  type="button"
                  class="block max-w-[8em] cursor-pointer truncate text-left text-ink underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent sm:max-w-[14em]"
                  :title="`${item.target.name}：看持股與清單`"
                  @click="emit('open', item.id)"
                >
                  {{ item.target.name }}
                </button>
                <span class="block text-caption text-ink-muted">
                  {{ item.target.code || item.target.symbol }}<template v-if="item.quantity <= 0">．沒持股</template>
                </span>
              </th>
              <td v-for="year in item.growth!.years" :key="year.year" class="whitespace-nowrap px-3 py-2 text-right" :title="`${year.year} 年配了 ${year.count} 次`">
                <span class="block" :class="year.decreased ? 'text-danger' : year.cash ? 'text-ink' : 'text-ink-muted'">
                  <span v-if="year.decreased" class="mr-0.5 text-caption" aria-label="比前一年少">▼</span>{{ year.cash ? formatNumber(year.cash, 4) : '—' }}
                </span>
                <span v-if="year.stock" class="block text-caption text-warn">配股 {{ formatNumber(year.stock, 2) }}</span>
                <span v-if="year.count > 1" class="block text-caption text-ink-muted">{{ year.count }} 次</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ListPager v-model:page="page" v-model:page-size="pageSize" :total="total" />
      <p class="text-caption text-ink-muted">現金股利是當年實際配的（台股元、美股美元）；配股換算成元。今年還沒過完，不判斷有沒有減少。</p>
    </template>
  </section>
</template>
