<script setup lang="ts">
import { formatNumber, formatSigned } from '../../lib/marketChart'
import type { StockHolding } from '../../types'

// 個股分析的持股摘要（數字由後端算好，這裡只排版）
defineProps<{ holding: StockHolding }>()

function trendClass(value: number | null | undefined) {
  if (!value) return 'text-ink-soft'
  return value > 0 ? 'text-up' : 'text-down'
}
</script>

<template>
  <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-body sm:grid-cols-4">
    <div>
      <dt class="text-ink-muted">持有</dt>
      <dd class="tabular-nums text-ink">
        {{ formatNumber(holding.quantity, 3) }} {{ holding.market === 'tw' ? '張' : '股' }}
        <span class="text-ink-muted">均價 {{ formatNumber(holding.avgCost) }}</span>
      </dd>
    </div>
    <div>
      <dt class="text-ink-muted">市值</dt>
      <dd class="tabular-nums text-ink">{{ formatNumber(holding.marketValue, 0) }}</dd>
    </div>
    <div>
      <dt class="text-ink-muted">未實現損益</dt>
      <dd class="tabular-nums" :class="trendClass(holding.unrealized)">
        {{ formatSigned(holding.unrealized) }}
        <span v-if="holding.unrealizedPct !== null">（{{ formatSigned(holding.unrealizedPct, '%') }}）</span>
      </dd>
    </div>
    <div>
      <dt class="text-ink-muted">總報酬</dt>
      <dd class="tabular-nums" :class="trendClass(holding.totalReturn)">{{ formatSigned(holding.totalReturn) }}</dd>
    </div>
  </dl>
</template>
