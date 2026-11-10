<script setup lang="ts">
import { computed, ref } from 'vue'

import IncomeDayDialog from './IncomeDayDialog.vue'
import type { IncomeCalendarEntry, IncomeItem } from '../../types'

// 股利月曆（v20 階段 6，2026-11-10 依使用者要求改成像 Outlook 的月檢視）：一週七欄的格子，今天／上下月切換。
// 範圍：往前 2 年（後端的 pastEvents，實際除息）到往後的預估月份（props.months，從本月起）；打開時停在本月。
// 本月以後的資料和長條圖同一份（projection.months）：已公告／已除息用除息日（實線）；推估用後端推的日期
// （去年同一次加一年，虛線，像行事曆的「暫定」）；推不出日期的列在「日期未定」。
// 過去的用實際紀錄；當時有沒有持股、應收多少用後端的應收股利（entitlement），和「應收股利對照」同一份計算。
// 格子裡一律只放股票代號（使用者要求，手機也放得下）；點有除息的那一天跳出 IncomeDayDialog 看細節
const props = defineProps<{ months: string[]; items: IncomeItem[]; today: string }>()
const emit = defineEmits<{ open: [id: string] }>()

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const PAST_MONTHS = 24

const thisMonth = computed(() => props.today.slice(0, 7))
const shiftMonth = (month: string, delta: number) => {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
// 可以看的月份：往前 24 個月＋本月起的預估月份
const allMonths = computed(() => [
  ...Array.from({ length: PAST_MONTHS }, (_, i) => shiftMonth(thisMonth.value, i - PAST_MONTHS)),
  ...(props.months.length ? props.months : [thisMonth.value]),
])
const monthIndex = ref(PAST_MONTHS)
const month = computed(() => allMonths.value[monthIndex.value] ?? thisMonth.value)
const title = computed(() => `${month.value.slice(0, 4)}年 ${Number(month.value.slice(5))}月`)

// 本月以後：預估（含本月已除息的那一次）
function projectedEntries(item: IncomeItem, projectionIndex: number): IncomeCalendarEntry | null {
  const entry = item.projection?.months[projectionIndex]
  if (!entry || (!entry.cash && !entry.stock)) return null
  const estimated = entry.cash?.source === 'estimated' && !entry.cash.exDate
  const date = entry.cash?.exDate ?? entry.stock?.exDate ?? (estimated ? entry.cash?.estimatedDate ?? null : null)
  return { item, cash: entry.cash, stock: entry.stock, date, estimated, held: item.quantity > 0, past: false, heldKnown: true }
}
// 過去：實際紀錄，同一天的現金股利和配股合成一筆。當時有沒有持股看應收股利（算不出來時 heldKnown 是 false）
function pastEntries(item: IncomeItem, inMonth: (date: string) => boolean): IncomeCalendarEntry[] {
  const events = (item.pastEvents ?? []).filter((e) => inMonth(e.date))
  const dates = [...new Set(events.map((e) => e.date))]
  const owed = item.entitlement?.events ?? []
  const heldKnown = Boolean(item.entitlement?.available)
  return dates.map((date) => {
    const cashEvent = events.find((e) => e.date === date && e.type === 'cash')
    const stockEvent = events.find((e) => e.date === date && e.type === 'stock')
    const cashOwed = owed.find((e) => e.type === 'cash' && e.exDate === date)
    const stockOwed = owed.find((e) => e.type === 'stock' && e.exDate === date)
    return {
      item,
      cash: cashEvent
        ? { perShare: cashEvent.perShare ?? 0, source: 'exDone', exDate: date, gross: cashOwed?.gross ?? null, deduction: cashOwed?.deduction ?? null, net: cashOwed?.net ?? null }
        : null,
      stock: stockEvent ? { exDate: date, ratio: stockEvent.ratio ?? 0, addShares: stockOwed?.addShares ?? 0, addQuantity: stockOwed?.addQuantity ?? 0 } : null,
      date,
      estimated: false,
      held: Boolean(cashOwed || stockOwed),
      past: true,
      heldKnown,
    }
  })
}

// 這個月的每一筆（只有個股；沒持股的也列）。有持股的排前面
const entries = computed<IncomeCalendarEntry[]>(() => {
  const stocks = props.items.filter((item) => item.target.kind === 'stock')
  const current = month.value
  if (current < thisMonth.value) return sortEntries(stocks.flatMap((item) => pastEntries(item, (date) => date.startsWith(current))))
  const projectionIndex = props.months.indexOf(current)
  return sortEntries(
    stocks.flatMap((item) => {
      const projected = projectionIndex >= 0 ? projectedEntries(item, projectionIndex) : null
      // 本月：預估只會有一次（本月已除息的那次），月初到今天之間其他已經除息的從實際紀錄補上
      const earlier =
        current === thisMonth.value
          ? pastEntries(item, (date) => date.startsWith(current) && date !== projected?.date)
          : []
      return [...earlier, ...(projected ? [projected] : [])]
    }),
  )
})
function sortEntries(list: IncomeCalendarEntry[]) {
  return list.sort((a, b) => Number(b.held) - Number(a.held) || codeOf(a).localeCompare(codeOf(b)))
}
const undated = computed(() => entries.value.filter((entry) => !entry.date))
const byDate = computed(() => {
  const map = new Map<string, IncomeCalendarEntry[]>()
  for (const entry of entries.value) {
    if (!entry.date) continue
    if (!map.has(entry.date)) map.set(entry.date, [])
    map.get(entry.date)!.push(entry)
  }
  return map
})

// 格子：從這個月 1 號那一週的週日排到月底那一週的週六
const iso = (date: Date) => date.toISOString().slice(0, 10)
const weeks = computed(() => {
  const [year, mon] = month.value.split('-').map(Number) as [number, number]
  const first = new Date(Date.UTC(year, mon - 1, 1))
  const days = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const offset = first.getUTCDay()
  const rows = Math.ceil((offset + days) / 7)
  const start = first.getTime() - offset * 86400000
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: 7 }, (_, col) => {
      const date = iso(new Date(start + (row * 7 + col) * 86400000))
      return { date, day: Number(date.slice(8)), inMonth: date.startsWith(month.value), entries: byDate.value.get(date) ?? [] }
    }),
  )
})

function codeOf(entry: IncomeCalendarEntry) {
  return entry.item.target.code || entry.item.target.symbol || entry.item.target.name
}
function goToday() {
  monthIndex.value = PAST_MONTHS
}

// 點日期跳出的彈窗；在彈窗裡點股票：先關彈窗，再請父元件開那一檔的持股詳細
const dialogDate = ref<string | null>(null)
const dialogEntries = computed(() => (dialogDate.value ? byDate.value.get(dialogDate.value) ?? [] : []))
function openItem(id: string) {
  dialogDate.value = null
  emit('open', id)
}

// 代號塊：實線（已公告、已除息）／虛線（推估）；沒持股用灰字
function chipClass(entry: IncomeCalendarEntry) {
  const shape = entry.estimated ? 'border-dashed border-ink-muted/60' : 'border-solid border-accent-hue/50 bg-accent-hue/15'
  return [shape, entry.held ? 'text-ink' : 'text-ink-muted']
}
const NAV_BUTTON =
  'flex h-7 min-w-7 cursor-pointer items-center justify-center border border-tint/15 px-2 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40'
</script>

<template>
  <div class="space-y-2">
    <!-- 導覽列：今天、上一月、下一月、年月 -->
    <div class="flex items-center gap-1.5">
      <button type="button" :class="NAV_BUTTON" @click="goToday">今天</button>
      <button type="button" :class="NAV_BUTTON" :disabled="monthIndex === 0" aria-label="上一個月" @click="monthIndex -= 1">‹</button>
      <button type="button" :class="NAV_BUTTON" :disabled="monthIndex >= allMonths.length - 1" aria-label="下一個月" @click="monthIndex += 1">›</button>
      <p class="ml-2 text-subtitle font-semibold text-ink" aria-live="polite">{{ title }}</p>
    </div>

    <!-- 推不出日期的（月配去年這個月剛好沒配）：點了直接開持股詳細 -->
    <p v-if="undated.length" class="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
      這個月日期未定：
      <button
        v-for="entry in undated"
        :key="entry.item.id"
        type="button"
        class="cursor-pointer border px-1.5 tabular-nums transition hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
        :class="chipClass(entry)"
        :title="entry.item.target.name"
        @click="emit('open', entry.item.id)"
      >
        {{ codeOf(entry) }}
      </button>
    </p>

    <!-- 月曆格子 -->
    <div class="border-2 border-tint/10" role="grid" :aria-label="`${title}股利月曆`">
      <div class="grid grid-cols-7 border-b border-tint/10 bg-tint/5 text-caption text-ink-muted" role="row">
        <div v-for="label in WEEK_LABELS" :key="label" class="px-1.5 py-1" role="columnheader">{{ label }}</div>
      </div>
      <div v-for="(week, row) in weeks" :key="row" class="grid grid-cols-7 border-b border-tint/10 last:border-b-0" role="row">
        <component
          :is="cell.entries.length ? 'button' : 'div'"
          v-for="cell in week"
          :key="cell.date"
          :type="cell.entries.length ? 'button' : undefined"
          role="gridcell"
          :aria-label="cell.entries.length ? `${cell.date}，${cell.entries.length} 檔除息，點開看細節` : cell.date"
          class="flex min-h-[4.25rem] min-w-0 flex-col gap-0.5 border-r border-tint/10 p-0.5 text-left last:border-r-0 sm:min-h-[6rem] sm:p-1.5"
          :class="[
            cell.inMonth ? '' : 'bg-sink/10 text-ink-muted/60',
            cell.entries.length ? 'cursor-pointer transition hover:bg-tint/10 active:bg-tint/15' : '',
          ]"
          @click="cell.entries.length && (dialogDate = cell.date)"
        >
          <span
            class="inline-flex h-6 min-w-6 items-center justify-center self-start px-1 text-caption tabular-nums"
            :class="cell.date === today ? 'bg-selected font-semibold text-on-selected' : cell.inMonth ? 'text-ink-soft' : ''"
          >
            {{ cell.day }}
          </span>
          <!-- 格子裡只放代號，最多 3 個，其他寫「+N」 -->
          <span
            v-for="entry in cell.entries.slice(0, 3)"
            :key="entry.item.id"
            class="block truncate border text-center text-caption leading-tight tracking-tighter tabular-nums sm:px-0.5 sm:tracking-normal"
            :class="chipClass(entry)"
          >
            {{ codeOf(entry) }}
          </span>
          <span v-if="cell.entries.length > 3" class="text-center text-caption text-ink-muted">+{{ cell.entries.length - 3 }}</span>
        </component>
      </div>
    </div>

    <!-- 圖例 -->
    <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-5 border border-accent-hue/50 bg-accent-hue/15" />已公告／已除息</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-5 border border-dashed border-ink-muted/60" />推估（日期用去年同一次推）</span>
      <span>灰字＝沒持股</span>
      <span>點有代號的日期看細節</span>
    </p>

    <IncomeDayDialog v-if="dialogDate && dialogEntries.length" :date="dialogDate" :entries="dialogEntries" @close="dialogDate = null" @open="openItem" />
  </div>
</template>
