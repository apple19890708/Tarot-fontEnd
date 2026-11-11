<script setup lang="ts">
import { computed, ref } from 'vue'

import DataTable from '../DataTable.vue'
import { ROW_HOVER, ROW_SINK, ROW_TINT } from '../../lib/table'
import HelpTip from '../HelpTip.vue'
import ListPager from '../ListPager.vue'
import { usePaged } from '../../lib/usePaged'
import { formatNumber } from '../../lib/marketChart'
import type { IncomeFillEvent, IncomeItem } from '../../types'
import StockNameCell from '../StockNameCell.vue'

// 填息追蹤（v20 階段 7）：每檔近 2 年每次除息後幾個交易日填息、這次填了沒、還差多少。數字都由後端算（item.fills）。
// 手機：每檔一張可收合的卡片（兩行一次除息）。桌機（2026-11-10 使用者說卡片並排太醜）：一檔一列的總覽表，
// 「近 8 次」用一排小方塊（天數＋顏色，新 → 舊）看快慢趨勢，點一列才展開完整明細。
// 台股在前（有持股的排前面）；美股很少看填息，收在展開裡。點股票名稱用 open 開持股詳細
const props = defineProps<{ items: IncomeItem[] }>()
const emit = defineEmits<{ open: [id: string] }>()

const withFills = computed(() =>
  props.items
    .filter((item) => item.fills && item.fills.events.length)
    .sort((a, b) => Number(b.quantity > 0) - Number(a.quantity > 0) || a.target.name.localeCompare(b.target.name)),
)
const twItems = computed(() => withFills.value.filter((item) => item.target.market === 'tw'))
const usItems = computed(() => withFills.value.filter((item) => item.target.market === 'us'))
// 分頁（股票多的時候；預設每頁 5 檔，每頁筆數記住）
const { items: twPageItems, page: twPage, pageSize: twPageSize, total: twTotal } = usePaged(twItems, 'income-fills-tw', 5)
const { items: usPageItems, page: usPage, pageSize: usPageSize, total: usTotal } = usePaged(usItems, 'income-fills-us', 5)

const yearDate = (date: string) => `${date.slice(0, 4)}/${Number(date.slice(5, 7))}/${Number(date.slice(8))}`
function daysText(event: IncomeFillEvent) {
  if (event.filledOn) return event.days === 1 ? '當天' : `${event.days} 天`
  return `已過 ${event.daysSince} 天`
}
// 「填息天數」欄（最近一次）：桌機總覽與手機卡片標題列共用（日期另外放）
function resultText(event: IncomeFillEvent) {
  if (event.filledOn) return event.days === 1 ? '當天' : `${event.days} 天`
  return `還差 ${formatNumber(event.gap, 2)}（${formatNumber(event.gapPct, 1)}%）`
}
// 「近 8 次」的小方塊：新 → 舊（和最近一次同一側，2026-11-10 使用者要求），顏色和天數一致
function chipClass(event: IncomeFillEvent) {
  if (!event.filledOn) return 'border-danger-hue/50 bg-danger-hue/10 text-danger'
  if ((event.days ?? 0) <= 5) return 'border-ok-hue/50 bg-ok-hue/10 text-ok'
  if ((event.days ?? 0) > 30) return 'border-warn/50 bg-warn/10 text-warn'
  return 'border-tint/20 text-ink-soft'
}
const chipText = (event: IncomeFillEvent) => (event.filledOn ? String(event.days) : '✕')
const chipTitle = (event: IncomeFillEvent) =>
  `${yearDate(event.exDate)} 除息 ${formatNumber(event.perShare, 4)}，${event.filledOn ? `${yearDate(event.filledOn)} 填息（${daysText(event)}）` : `還差 ${formatNumber(event.gap, 2)}（${formatNumber(event.gapPct, 1)}%）`}`
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`

// 桌機：展開了哪幾列
const expanded = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
// 兩組（台股、美股）的分頁更新
function setPage(key: string, value: number) {
  if (key === 'tw') twPage.value = value
  else usPage.value = value
}
function setPageSize(key: string, value: number) {
  if (key === 'tw') twPageSize.value = value
  else usPageSize.value = value
}
// 天數的顏色：5 天內填完綠、超過 30 天黃、還沒填紅（2026-11-10 使用者要求數字顏色要區分）
function daysClass(event: IncomeFillEvent) {
  if (!event.filledOn) return 'text-danger'
  if ((event.days ?? 0) <= 5) return 'text-ok'
  if ((event.days ?? 0) > 30) return 'text-warn'
  return 'text-ink-soft'
}
</script>

<template>
  <section v-if="withFills.length" class="space-y-2">
    <p class="flex items-center gap-1 text-body text-ink-muted">填息追蹤（近 2 年）<HelpTip term="fill" /></p>

    <template
      v-for="group in [
        { key: 'tw', list: twPageItems, total: twTotal, page: twPage, size: twPageSize },
        { key: 'us', list: usPageItems, total: usTotal, page: usPage, size: usPageSize },
      ]"
      :key="group.key"
    >
      <component :is="group.key === 'us' ? 'details' : 'div'" v-if="group.total" class="space-y-2">
        <summary v-if="group.key === 'us'" class="cursor-pointer text-body text-ink-muted marker:text-ink-soft hover:text-ink">
          美股（{{ group.total }}）：美股很少看填息，需要再展開
        </summary>
        <div class="grid gap-2 sm:hidden" :class="group.key === 'us' ? 'mt-2' : ''">
          <!-- 手機：每檔可以收合（2026-11-10 使用者要求）：預設收起來，標題列看得到填息次數與最近一次的結果 -->
          <details v-for="item in group.list" :key="item.id" class="group border-2 border-tint/10 bg-tint/5 p-3">
            <summary class="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 [&::-webkit-details-marker]:hidden">
              <p class="min-w-0">
                <span class="mr-1 inline-block text-ink-muted transition group-open:rotate-90" aria-hidden="true">▸</span>
                <span class="font-semibold text-ink">{{ item.target.name }}</span>
                <span class="ml-2 text-caption tabular-nums text-ink-muted">{{ item.target.code || item.target.symbol }}</span>
                <span v-if="item.quantity <= 0" class="ml-2 text-caption text-ink-muted">沒持股</span>
              </p>
              <p class="text-caption text-ink-muted">
                填息 {{ item.fills!.filledCount }}/{{ item.fills!.total }} 次<template v-if="item.fills!.avgDays !== null">，平均 {{ formatNumber(item.fills!.avgDays, 1) }} 天</template>
                <!-- 最近一次：日期與結果分開（2026-11-11 使用者要求：「還差多少」「當天填息」放在「填息天數」，和日期區隔） -->
                <span class="ml-1">｜最近：<span class="tabular-nums text-ink-soft">{{ shortDate(item.fills!.events[0]!.exDate) }}</span></span>
                <span class="ml-1">｜填息天數：<span class="font-semibold" :class="daysClass(item.fills!.events[0]!)">{{ resultText(item.fills!.events[0]!) }}</span></span>
              </p>
            </summary>
            <div class="mt-2 space-y-2">
            <button
              type="button"
              class="cursor-pointer text-caption text-ink-muted underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent"
              @click="emit('open', item.id)"
            >
              個股分析
            </button>
            <!-- 手機：一次除息兩行（2026-11-10 使用者回報表格在手機破版） -->
            <ul class="divide-y divide-tint/10 text-caption tabular-nums sm:hidden">
              <li v-for="event in item.fills!.events" :key="event.exDate" class="space-y-0.5 py-1.5">
                <p class="flex items-baseline justify-between gap-2">
                  <span><span class="text-ink-soft">{{ yearDate(event.exDate) }}</span> 除息 <span class="text-accent">{{ formatNumber(event.perShare, 4) }}</span></span>
                  <span class="shrink-0 font-semibold" :class="daysClass(event)">{{ daysText(event) }}</span>
                </p>
                <p class="text-ink-muted">
                  前收 {{ formatNumber(event.preClose, 2) }} →
                  <span v-if="event.filledOn" class="text-ink-soft">{{ yearDate(event.filledOn) }} 填息</span>
                  <span v-else class="text-danger">還差 {{ formatNumber(event.gap, 2) }}（{{ formatNumber(event.gapPct, 1) }}%）</span>
                </p>
              </li>
            </ul>
            </div>
          </details>
        </div>
        <!-- 桌機：一檔一列的總覽表；點一列展開明細 -->
        <DataTable class="hidden sm:block" :class="group.key === 'us' ? 'mt-2' : ''">
          <template #head>
              <tr>
                <th>股票</th>
                <th>填息</th>
                <th>平均</th>
                <th>最近一次除息</th>
                <th>填息天數</th>
                <th>近 8 次（新 → 舊，格子裡是天數）</th>
                <th class="w-8 px-2"><span class="sr-only">展開</span></th>
              </tr>
          </template>
              <template v-for="item in group.list" :key="item.id">
                <tr
                  class="cursor-pointer transition"
                  :class="expanded.has(item.id) ? ROW_TINT : ROW_HOVER"
                  :aria-expanded="expanded.has(item.id)"
                  @click="toggle(item.id)"
                >
                  <td>
                    <StockNameCell :name="item.target.name" :code="item.target.code || item.target.symbol" action="個股分析" @open="emit('open', item.id)">
                      <template v-if="item.quantity <= 0">．沒持股</template>
                    </StockNameCell>
                  </td>
                  <td class="whitespace-nowrap text-ink-soft">{{ item.fills!.filledCount }}/{{ item.fills!.total }}</td>
                  <td class="whitespace-nowrap text-ink-soft">
                    {{ item.fills!.avgDays === null ? '—' : `${formatNumber(item.fills!.avgDays, 1)} 天` }}
                  </td>
                  <!-- 上：除息日、下：每股股利（2026-11-10 使用者要求上下排） -->
                  <td class="whitespace-nowrap">
                    <span class="block text-ink-soft">{{ shortDate(item.fills!.events[0]!.exDate) }}</span>
                    <span class="block text-caption text-accent">每股 {{ formatNumber(item.fills!.events[0]!.perShare, 4) }}</span>
                  </td>
                  <td class="whitespace-nowrap font-semibold" :class="daysClass(item.fills!.events[0]!)">{{ resultText(item.fills!.events[0]!) }}</td>
                  <td>
                    <div class="flex gap-1">
                      <span
                        v-for="event in item.fills!.events"
                        :key="event.exDate"
                        class="inline-flex h-6 min-w-[2.25rem] items-center justify-center border px-1 text-caption"
                        :class="chipClass(event)"
                        :title="chipTitle(event)"
                      >
                        {{ chipText(event) }}
                      </span>
                    </div>
                  </td>
                  <td class="px-2 text-center text-ink-muted">
                    <span class="inline-block transition" :class="expanded.has(item.id) ? 'rotate-90' : ''" aria-hidden="true">▸</span>
                  </td>
                </tr>
                <!-- 展開：每一次的明細 -->
                <tr v-if="expanded.has(item.id)" :class="ROW_SINK">
                  <td colspan="7" class="pb-3 pt-1">
                    <DataTable variant="compact" table-class="max-w-3xl">
                      <template #head>
                        <tr>
                          <th>除息日</th>
                          <th>每股股利</th>
                          <th>除息前收盤</th>
                          <th>填息日</th>
                          <th>天數</th>
                        </tr>
                      </template>
                        <tr v-for="event in item.fills!.events" :key="event.exDate">
                          <td class="text-ink-soft">{{ yearDate(event.exDate) }}</td>
                          <td class="text-accent">{{ formatNumber(event.perShare, 4) }}</td>
                          <td class="text-ink-muted">{{ formatNumber(event.preClose, 2) }}</td>
                          <td>
                            <span v-if="event.filledOn" class="text-ink-soft">{{ yearDate(event.filledOn) }}</span>
                            <span v-else class="text-danger">還沒填，差 {{ formatNumber(event.gap, 2) }}（{{ formatNumber(event.gapPct, 1) }}%）</span>
                          </td>
                          <td class="whitespace-nowrap font-semibold" :class="daysClass(event)">{{ daysText(event) }}</td>
                        </tr>
                    </DataTable>
                  </td>
                </tr>
              </template>
        </DataTable>
        <ListPager
          :page="group.page"
          :page-size="group.size"
          :total="group.total"
          @update:page="(value) => setPage(group.key, value)"
          @update:page-size="(value) => setPageSize(group.key, value)"
        />
      </component>
    </template>
  </section>
</template>
