<script setup lang="ts">
import { computed, ref } from 'vue'

import DataTable from '../DataTable.vue'
import HelpTip from '../HelpTip.vue'
import ListPager from '../ListPager.vue'
import { formatNumber, formatSigned } from '../../lib/marketChart'
import { usePaged } from '../../lib/usePaged'
import type { IncomeForecastCheck } from '../../types'
import StockNameCell from '../StockNameCell.vue'

// 預估準不準（v20，2026-11-10 使用者要求）：正式公布（證交所公告或實際除息）後，拿之前的推估來比。
// 表格（2026-11-11 使用者要求由長條圖改成表格）：股票、預估、實際（公布日期）、落差、準確率。
// 按股票分組（2026-11-11 使用者選的）：同一檔的每次股利排在一起，股票欄跨列只寫一次，組內新到舊；
// 檔與檔之間用最近一次公布日期排（新的在前），分頁以「檔」為單位，同一檔不會被切到兩頁。
// 預估、實際、落差（errorPct）都是後端記下的；準確率 ＝ 100 − |落差|（最低 0），只是換個說法。
// 每檔可以收合（2026-11-11 使用者要求）：預設只顯示最近一次，股票欄的「共 N 次」點開看較早的。
// 後端只記現金股利的推估，配股不在這裡比較
const props = defineProps<{ checks: IncomeForecastCheck[] }>()

const dateOf = (check: IncomeForecastCheck) => check.actualDate ?? check.month
const groups = computed(() => {
  const map = new Map<string, IncomeForecastCheck[]>()
  for (const check of props.checks) {
    if (!map.has(check.symbol)) map.set(check.symbol, [])
    map.get(check.symbol)!.push(check)
  }
  return [...map.values()]
    .map((list) => {
      const rows = [...list]
        .sort((a, b) => dateOf(b).localeCompare(dateOf(a)))
        .map((check) => ({
          ...check,
          key: `${check.symbol}-${check.month}`,
          accuracy: check.errorPct === null ? null : Math.max(0, 100 - Math.abs(check.errorPct)),
        }))
      return { symbol: rows[0]!.symbol, code: rows[0]!.code ?? rows[0]!.symbol, name: rows[0]!.name, latest: dateOf(rows[0]!), rows }
    })
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.name.localeCompare(b.name))
})
const { items: pageGroups, page, pageSize, total } = usePaged(groups, 'income-forecast')

// 展開的股票（symbol）
const expanded = ref(new Set<string>())
function toggle(symbol: string) {
  const next = new Set(expanded.value)
  if (next.has(symbol)) next.delete(symbol)
  else next.add(symbol)
  expanded.value = next
}
const shownRows = (group: { symbol: string; rows: unknown[] }) => (expanded.value.has(group.symbol) ? group.rows.length : 1)

const unitOf = (check: IncomeForecastCheck) => (check.market === 'us' ? '美元' : '元')
// 落差 10% 以內綠、30% 以上黃
const gapClass = (errorPct: number | null) => {
  if (errorPct === null) return 'text-ink-muted'
  const abs = Math.abs(errorPct)
  return abs <= 10 ? 'text-ok' : abs >= 30 ? 'text-warn' : 'text-ink-soft'
}
</script>

<template>
  <section class="space-y-2">
    <p class="flex items-center gap-1 text-body text-ink-muted">預估準不準（正式公布後的比較）<HelpTip term="forecastCheck" /></p>
    <p v-if="!groups.length" class="border-2 border-dashed border-tint/15 px-3 py-3 text-body text-ink-muted">
      從現在開始記下每個月的推估，等證交所公告或實際除息後，這裡會列出「預估 vs 實際」。第一組比較要等下一次正式公布。
    </p>
    <template v-else>
      <DataTable table-class="min-w-[36rem]">
        <template #head>
          <tr>
            <th scope="col">股票</th>
            <th scope="col">預估股利（每股）</th>
            <th scope="col">實際股利（公布日期）</th>
            <th scope="col">估值落差</th>
            <th scope="col">估值準確率</th>
          </tr>
        </template>
        <template v-for="(group, groupIndex) in pageGroups" :key="group.symbol">
          <!-- 檔與檔之間的分隔線加粗；同一檔裡的每次股利用一般的細線 -->
          <tr
            v-for="(row, index) in group.rows.slice(0, shownRows(group))"
            :key="row.key"
            :class="index === 0 && groupIndex > 0 ? 'border-t-2' : ''"
          >
            <th v-if="index === 0" scope="row" :rowspan="shownRows(group)" class="align-top">
              <StockNameCell :name="group.name" :code="group.code" />
              <button
                v-if="group.rows.length > 1"
                type="button"
                class="mt-1 flex cursor-pointer items-center gap-1 text-caption text-ink-muted transition hover:text-accent active:text-accent"
                :aria-expanded="expanded.has(group.symbol)"
                @click="toggle(group.symbol)"
              >
                <span class="inline-block transition" :class="expanded.has(group.symbol) ? 'rotate-90' : ''" aria-hidden="true">▸</span>
                {{ expanded.has(group.symbol) ? '收合' : `共 ${group.rows.length} 次` }}
              </button>
            </th>
            <td class="whitespace-nowrap text-ink-soft" :title="row.estimateDate ? `${row.estimateDate} 的推估` : undefined">
              {{ formatNumber(row.estimate, 4) }} <span class="text-caption text-ink-muted">{{ unitOf(row) }}</span>
            </td>
            <td class="whitespace-nowrap">
              <span class="text-ink">{{ formatNumber(row.actual, 4) }}</span> <span class="text-caption text-ink-muted">{{ unitOf(row) }}</span>
              <span class="block text-caption text-ink-muted">{{ row.actualDate ?? '—' }}</span>
            </td>
            <td class="whitespace-nowrap" :class="gapClass(row.errorPct)">
              <template v-if="row.errorPct !== null">
                {{ formatSigned(row.errorPct, '%') }}
                <span class="block text-caption text-ink-muted">{{ row.errorPct > 0 ? '預估偏高' : row.errorPct < 0 ? '預估偏低' : '一樣' }}</span>
              </template>
              <template v-else>—</template>
            </td>
            <td class="whitespace-nowrap font-semibold" :class="gapClass(row.errorPct)">
              {{ row.accuracy === null ? '—' : `${formatNumber(row.accuracy, 1)}%` }}
            </td>
          </tr>
        </template>
      </DataTable>
      <ListPager v-model:page="page" v-model:page-size="pageSize" :total="total" />
    </template>
  </section>
</template>
