<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import StockSearchInput from './StockSearchInput.vue'
import StockAnalysisDialog from './StockAnalysisDialog.vue'
import { fetchDividendProfile } from '../../lib/api'
import { formatNumber } from '../../lib/marketChart'
import type { DividendProfile, MarketSearchResult } from '../../types'

// 存股試算「自選一檔」（2026-11-11 使用者要求「輸入代號自選，跟加入追蹤一樣」）：選市場、打代號或名稱，
// 選下拉候選或按「試算」就向後端查這一檔的現價、配息頻率、殖利率（不用先加入追蹤）。試算與比較共用。
// v-model:market、v-model:query 由父元件記住（下次打開自動再查一次）；v-model:profile 是查到的結果
const market = defineModel<'tw' | 'us'>('market', { required: true })
const query = defineModel<string>('query', { required: true })
const profile = defineModel<DividendProfile | null>('profile', { required: true })
defineProps<{ submitLabel?: string }>()

const MARKET_LABELS = { tw: '台股', us: '美股' } as const
const searchText = ref(query.value)
const status = ref<'idle' | 'loading' | 'error'>('idle')
const error = ref('')
let requestId = 0
// 點名稱開的個股分析（不用先加入追蹤，用代號查）
const analysisFor = ref<{ code: string; name: string } | null>(null)

async function load(q: string) {
  const text = q.trim()
  if (!text) return
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    const result = (await fetchDividendProfile(market.value, text)).profile
    if (id !== requestId) return
    profile.value = result
    status.value = 'idle'
    query.value = result.target.code || result.target.symbol || text
    // 不要改寫輸入框：改了 StockSearchInput 會當成使用者打字，拿「名稱 代號」去搜尋，查不到就一直跳出
    // 「找不到符合的台股」（2026-11-11 使用者回報）。輸入框留著使用者打的字或選的候選名稱，查到的名稱顯示在下面那行
  } catch (err) {
    if (id !== requestId) return
    profile.value = null
    status.value = 'error'
    error.value = err instanceof Error ? err.message : '查不到這一檔'
  }
}
function pick(target: MarketSearchResult) {
  void load(target.code || target.symbol || target.name)
}
function setMarket(value: 'tw' | 'us') {
  if (market.value === value) return
  market.value = value
  searchText.value = ''
  query.value = ''
  profile.value = null
  status.value = 'idle'
  error.value = ''
}
// 父元件清掉代號（例如重設）時，輸入框也清掉
watch(query, (value) => {
  if (!value && !profile.value) searchText.value = ''
})
onMounted(() => {
  if (query.value && !profile.value) void load(query.value)
})

// 查到了但不能試算的原因
function problemOf(pf: DividendProfile) {
  if (!pf.price) return '這一檔現在取不到價格，稍後再試。'
  if (pf.target.market === 'us' && !pf.usdTwd) return '取不到美元匯率，美股暫時不能試算。'
  if (!pf.currentYield) return pf.dividendStatus === 'failed' ? '這一檔的股利資料暫時抓不到。' : '這一檔近一年沒有配息，沒辦法用股利試算。'
  return ''
}
</script>

<template>
  <div class="min-w-0 space-y-1">
    <form class="flex flex-wrap gap-2" @submit.prevent="load(searchText)">
      <div class="flex shrink-0" role="radiogroup" aria-label="市場">
        <button
          v-for="option in (['tw', 'us'] as const)"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="market === option"
          class="cursor-pointer border-2 px-3 py-2 text-button transition font-pixel"
          :class="market === option ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
          @click="setMarket(option)"
        >
          {{ MARKET_LABELS[option] }}
        </button>
      </div>
      <StockSearchInput
        v-model="searchText"
        class="min-w-0 flex-[2_1_10rem]"
        :market="market"
        :placeholder="market === 'tw' ? '代號或名稱（0056、00919）' : '代號或名稱（SCHD、VYM）'"
        @select="pick"
      />
      <button
        type="submit"
        class="shrink-0 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/10 px-3 py-2 text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
        :disabled="status === 'loading' || !searchText.trim()"
      >
        {{ status === 'loading' ? '查詢中…' : submitLabel || '試算' }}
      </button>
    </form>
    <p v-if="status === 'error'" class="text-caption text-danger">{{ error }}</p>
    <p v-else-if="profile && problemOf(profile)" class="text-caption text-warn">{{ problemOf(profile) }}</p>
    <p v-else-if="profile" class="text-caption text-ink-muted">
      <!-- 台股的名稱可以點開個股分析（2026-11-12 使用者要求）；個股分析只吃台股代號，美股維持純文字 -->
      <button
        v-if="profile.target.market === 'tw' && profile.target.code"
        type="button"
        class="cursor-pointer text-ink underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent"
        :title="`${profile.target.name}：個股分析`"
        @click="analysisFor = { code: profile.target.code, name: profile.target.name }"
      >
        {{ profile.target.name }}
      </button>
      <template v-else>{{ profile.target.name }}</template>
      {{ profile.target.code || profile.target.symbol }}，現價 {{ formatNumber(profile.price) }}{{ profile.target.market === 'us' ? ' 美元' : ' 元' }}
    </p>
    <p v-else class="text-caption text-ink-muted">打代號或名稱，選下拉的候選或按「{{ submitLabel || '試算' }}」。不用先加入追蹤。</p>
    <StockAnalysisDialog v-if="analysisFor" :code="analysisFor.code" :name="analysisFor.name" @close="analysisFor = null" />
  </div>
</template>
