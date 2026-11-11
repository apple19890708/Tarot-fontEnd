<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'

import HelpTip from '../HelpTip.vue'
import { formatNumber } from '../../lib/marketChart'
import { useScrollLock } from '../../lib/useScrollLock'
import type { IncomeCalendarEntry, IncomeSource } from '../../types'

// 每月股利小卡點開的彈窗（2026-11-10 使用者要求：小卡只放代號與合計，點開看這個月每一檔的除息日與股利；取代原本的股利月曆）。
// 置中的小視窗（和確認彈窗同一種外框）；Esc、點外面、按關閉都會關。點股票名稱用 open 通知父元件開那一檔的持股詳細。
// 有持股的在上面；只追蹤、沒持股的收在最下面一組（灰字），沒算進合計
const props = defineProps<{ month: string; entries: IncomeCalendarEntry[]; total: string | null }>()
const emit = defineEmits<{ close: []; open: [id: string] }>()

useScrollLock()
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const SOURCE_LABELS: Record<IncomeSource, string> = { announced: '已公告', exDone: '已除息', estimated: '推估' }
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const title = `${props.month.slice(0, 4)} 年 ${Number(props.month.slice(5))} 月`
const dayText = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}（${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`
const codeOf = (entry: IncomeCalendarEntry) => entry.item.target.code || entry.item.target.symbol || ''
const money = (value: number | null | undefined, market: 'tw' | 'us') =>
  value === null || value === undefined ? '—' : formatNumber(value, market === 'tw' ? 0 : 2)

// 「當時沒持股」的過去紀錄也歸到沒持股那一組；算不出當時有沒有持股的（heldKnown false）留在上面
const heldEntries = computed(() => props.entries.filter((entry) => entry.held || !entry.heldKnown))
const otherEntries = computed(() => props.entries.filter((entry) => !entry.held && entry.heldKnown))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" @click.self="emit('close')">
      <div class="flex max-h-[85vh] w-full max-w-md flex-col border-2 border-frame bg-surface text-ink shadow-[6px_6px_0_var(--c-shade)]" role="dialog" aria-modal="true" :aria-label="`${title}股利`">
        <div class="flex items-center justify-between gap-2 border-b-2 border-frame px-4 py-3">
          <p class="text-subtitle font-semibold text-ink">
            {{ title }}<span v-if="total" class="ml-2 text-body font-normal tabular-nums text-accent">合計 {{ total }}</span>
          </p>
          <button
            type="button"
            class="cursor-pointer border-2 border-tint/15 px-2.5 py-1 text-button text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px]"
            @click="emit('close')"
          >
            關閉
          </button>
        </div>
        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-body">
          <template v-for="group in [{ key: 'held', list: heldEntries }, { key: 'other', list: otherEntries }]" :key="group.key">
            <p v-if="group.key === 'other' && group.list.length" class="border-t-2 border-tint/10 pt-3 text-caption text-ink-muted">
              {{ group.list.some((entry) => entry.past) ? '當時沒持股（只追蹤）' : '沒持股（只追蹤），沒算進合計' }}
            </p>
            <ul class="space-y-3">
              <li v-for="entry in group.list" :key="`${entry.item.id}:${entry.date}`" class="space-y-1 border-b border-tint/10 pb-3 last:border-0 last:pb-0">
                <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <button
                    type="button"
                    class="cursor-pointer text-left font-semibold underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent"
                    :class="group.key === 'other' ? 'text-ink-muted' : 'text-ink'"
                    :title="`${entry.item.target.name}：個股分析`"
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
                  <!-- 推估怎麼算的放在 ?（2026-11-10 使用者要求，每一檔都寫一次太佔空間） -->
                  <HelpTip v-if="entry.estimated" class="self-center" term="estimatedDividend" />
                </p>
                <!-- 除息日：推估的日期用去年同一次推；推不出來寫日期未定 -->
                <p class="text-ink-soft">
                  除息日
                  <span class="tabular-nums" :class="entry.estimated ? 'text-ink-muted' : 'text-ink'">{{ entry.date ? dayText(entry.date) : '日期未定' }}</span>
                  <span v-if="entry.date && entry.estimated" class="text-caption text-ink-muted">（推估）</span>
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
              </li>
            </ul>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
