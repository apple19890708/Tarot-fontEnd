<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import { formatNumber } from '../../lib/marketChart'
import { useScrollLock } from '../../lib/useScrollLock'
import type { IncomeCalendarEntry, IncomeSource } from '../../types'

// 股利月曆點一天跳出的小彈窗（2026-11-10 使用者要求：格子只放代號，細節點日期看）。
// 置中的小視窗（和確認彈窗同一種外框）；Esc、點外面、按關閉都會關。點股票名稱用 open 通知父元件開那一檔的持股詳細
const props = defineProps<{ date: string; entries: IncomeCalendarEntry[] }>()
const emit = defineEmits<{ close: []; open: [id: string] }>()

useScrollLock()
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const SOURCE_LABELS: Record<IncomeSource, string> = { announced: '已公告', exDone: '已除息', estimated: '推估' }
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const title = `${Number(props.date.slice(5, 7))} 月 ${Number(props.date.slice(8))} 日（${WEEKDAYS[new Date(`${props.date}T00:00:00Z`).getUTCDay()]}）`
const codeOf = (entry: IncomeCalendarEntry) => entry.item.target.code || entry.item.target.symbol || ''
const money = (value: number | null | undefined, market: 'tw' | 'us') =>
  value === null || value === undefined ? '—' : formatNumber(value, market === 'tw' ? 0 : 2)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" @click.self="emit('close')">
      <div class="flex max-h-[85vh] w-full max-w-md flex-col border-2 border-frame bg-surface text-ink shadow-[6px_6px_0_var(--c-shade)]" role="dialog" aria-modal="true" :aria-label="`${title}除息`">
        <div class="flex items-center justify-between gap-2 border-b-2 border-frame px-4 py-3">
          <p class="text-subtitle font-semibold text-ink">{{ title }}</p>
          <button
            type="button"
            class="cursor-pointer border-2 border-tint/15 px-2.5 py-1 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
            @click="emit('close')"
          >
            關閉
          </button>
        </div>
        <ul class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-body">
          <li v-for="entry in entries" :key="entry.item.id" class="space-y-1 border-b border-tint/10 pb-3 last:border-0 last:pb-0">
            <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <button
                type="button"
                class="cursor-pointer text-left font-semibold text-ink underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent"
                :title="`${entry.item.target.name}：看持股與清單`"
                @click="emit('open', entry.item.id)"
              >
                {{ entry.item.target.name }}
              </button>
              <span class="text-caption tabular-nums text-ink-muted">{{ codeOf(entry) }}</span>
              <span
                v-if="entry.cash"
                class="border px-1 text-caption"
                :class="entry.estimated ? 'border-dashed border-ink-muted/60 text-ink-muted' : 'border-accent-hue/40 text-accent'"
              >
                {{ SOURCE_LABELS[entry.cash.source] }}
              </span>
              <span v-if="!entry.held && entry.heldKnown" class="text-caption text-ink-muted">{{ entry.past ? '當時沒持股' : '沒持股' }}</span>
            </p>
            <!-- 過去的：當時有持股就寫應收（和「應收股利對照」同一份計算）；未來的寫預估實領 -->
            <p v-if="entry.cash" class="text-ink-soft">
              現金股利每股 {{ formatNumber(entry.cash.perShare, 4) }}<template v-if="entry.held">，{{ entry.past ? '當時應收' : '預估實領' }}
                <span class="tabular-nums text-accent">{{ money(entry.cash.net, entry.item.target.market) }}</span>
                <span v-if="entry.cash.deduction" class="text-caption text-ink-muted">（已扣 {{ money(entry.cash.deduction, entry.item.target.market) }}）</span></template>
            </p>
            <p v-if="entry.stock" class="text-ink-soft">
              配股每股 {{ formatNumber(entry.stock.ratio, 4) }} 股<template v-if="entry.held">，{{ entry.past ? '當時應配' : '約配' }} <span class="tabular-nums text-warn">{{ formatNumber(entry.stock.addShares, 0) }} 股</span></template>
            </p>
            <p v-if="entry.past && !entry.heldKnown && entry.item.position" class="text-caption text-ink-muted">
              買賣紀錄有沒填日期的，算不出當時有沒有持股。
            </p>
            <p v-if="entry.estimated" class="text-caption text-ink-muted">日期和金額都是推估：日期用去年同一次加一年，金額用近 12 個月的平均。</p>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>
