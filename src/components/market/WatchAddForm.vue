<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import SelectField from '../SelectField.vue'
import QuantityField from './QuantityField.vue'
import StockSearchInput from './StockSearchInput.vue'
import { createWatch, createWatchGroup } from '../../lib/api'
import { toStoredQuantity, type QuantityUnit } from '../../lib/quantityUnit'
import type { MarketSearchResult, MarketTrade, MarketWatchGroup, MarketWatchItem } from '../../types'

// 「加入追蹤」表單（自訂股票追蹤、股利獲利與預測共用）：選市場、搜尋代號或名稱、可以帶第一筆買進、
// 選要加到哪個清單（或當場建立新清單）。加完用 added 通知父元件更新列表；當場建的清單用 group-created 通知
const props = defineProps<{
  groups: MarketWatchGroup[]
  // 預設加到哪個清單（父元件目前所在的清單分頁）；null＝未分類
  defaultGroup?: string | null
}>()
const emit = defineEmits<{
  added: [payload: { item: MarketWatchItem; existing: boolean; group: string | null }]
  'group-created': [group: MarketWatchGroup]
}>()

type Market = 'tw' | 'us'
const MARKET_LABELS: Record<Market, string> = { tw: '台股', us: '美股' }
const MAX_GROUPS = 10
const NEW_GROUP = '__new__'

const today = () => new Date().toISOString().slice(0, 10)
// unit：台股可以填張數或股數（零股）；date：第一筆的成交日期，預設今天
const form = ref({ market: 'tw' as Market, query: '', quantity: '', unit: '張' as QuantityUnit, cost: '', date: today() })
const picked = ref<MarketSearchResult | null>(null)
const formError = ref('')
// 成功提示：已經在追蹤的股票，這次只是加進另一個清單
const formNotice = ref('')
const adding = ref(false)

// 選了候選之後又改了文字，就不再用剛才選的標的
watch(
  () => form.value.query,
  (value) => {
    if (picked.value && value !== picked.value.name) picked.value = null
  },
)
watch(
  () => form.value.market,
  () => {
    picked.value = null
  },
)

// 「加到清單」：預設是父元件目前所在的清單；''＝未分類，NEW_GROUP＝當場建立新清單
const addTarget = ref('')
const newGroupName = ref('')
const addTargetOptions = computed(() => [
  { value: '', label: '未分類' },
  ...props.groups.map((group) => ({ value: group.id, label: group.name })),
  ...(props.groups.length < MAX_GROUPS ? [{ value: NEW_GROUP, label: '＋ 新清單…' }] : []),
])
watch(
  () => props.defaultGroup,
  (id) => {
    if (addTarget.value !== NEW_GROUP) addTarget.value = id ?? ''
  },
  { immediate: true },
)
// 選的清單被刪掉了：回到未分類
watch(
  () => props.groups,
  (groups) => {
    if (addTarget.value && addTarget.value !== NEW_GROUP && !groups.some((g) => g.id === addTarget.value)) addTarget.value = ''
  },
)
const groupName = (id: string | null) => props.groups.find((g) => g.id === id)?.name ?? '未分類'

// 新增時一起填的數量、成本與日期 → 第一筆買進；數量和成本都空白就不記
function firstTrade(): { trade?: MarketTrade; error?: string } {
  const { quantity, cost, unit, date, market } = form.value
  if (!quantity.trim() && !cost.trim()) return {}
  const q = Number(quantity)
  const c = Number(cost)
  if (!quantity.trim() || !Number.isFinite(q) || q <= 0) return { error: '數量要大於 0。' }
  if (!cost.trim() || !Number.isFinite(c) || c <= 0) return { error: '成本價要大於 0。' }
  if (date > today()) return { error: '成交日期不能是未來。' }
  return { trade: { side: 'buy', quantity: toStoredQuantity(q, unit, market), price: c, date: date || null } }
}

async function submit() {
  formError.value = ''
  formNotice.value = ''
  const query = form.value.query.trim()
  if (!query) {
    formError.value = '請輸入代號或名稱。'
    return
  }
  const parsed = firstTrade()
  if (parsed.error) {
    formError.value = parsed.error
    return
  }
  let group: string | null = addTarget.value === NEW_GROUP ? null : addTarget.value || null
  if (addTarget.value === NEW_GROUP) {
    const name = newGroupName.value.trim()
    if (!name) {
      formError.value = '請輸入新清單的名稱。'
      return
    }
    if (name.length > 20) {
      formError.value = '清單名稱最多 20 個字。'
      return
    }
    if (props.groups.some((g) => g.name === name)) {
      formError.value = `已經有「${name}」這個清單了，直接選它就好。`
      return
    }
  }
  adding.value = true
  try {
    if (addTarget.value === NEW_GROUP) {
      const created = await createWatchGroup(newGroupName.value.trim())
      emit('group-created', created.group)
      group = created.group.id
      // 清單已經建好：之後就算加股票失敗，重試也不會再建一次
      addTarget.value = created.group.id
      newGroupName.value = ''
    }
    const { item, existing, tradesIgnored } = await createWatch({
      market: form.value.market,
      query,
      target: picked.value ?? undefined,
      trades: parsed.trade ? [parsed.trade] : [],
      group,
    })
    if (existing) {
      const name = item.summary?.name || item.target.name
      formNotice.value =
        `${name} 已經在追蹤，這次加到「${groupName(group)}」清單。` +
        (tradesIgnored ? '持股沒有變動；要記這筆買進，請打開這檔的詳細，在持股那一區記錄。' : '')
    }
    form.value = { ...form.value, query: '', quantity: '', cost: '', date: today() }
    picked.value = null
    emit('added', { item, existing: Boolean(existing), group })
  } catch (err) {
    formError.value = err instanceof Error ? err.message : '新增失敗'
  } finally {
    adding.value = false
  }
}

const INPUT_CLASS =
  'min-w-0 border-2 border-tint/10 bg-tint/5 px-3 py-2 text-body tabular-nums text-ink outline-none placeholder:text-ink-muted focus:border-accent-hue/40'
</script>

<template>
  <form class="space-y-2 border-2 border-tint/10 bg-tint/[0.03] p-3" @submit.prevent="submit">
    <div class="flex flex-wrap gap-2">
      <div class="flex shrink-0" role="radiogroup" aria-label="市場">
        <button
          v-for="market in (['tw', 'us'] as const)"
          :key="market"
          type="button"
          role="radio"
          :aria-checked="form.market === market"
          class="cursor-pointer border-2 px-3 py-2 text-button transition font-pixel"
          :class="form.market === market ? 'border-accent-hue/40 bg-accent-hue/15 text-accent' : 'border-tint/10 text-ink-muted hover:bg-tint/10'"
          @click="form.market = market"
        >
          {{ MARKET_LABELS[market] }}
        </button>
      </div>
      <StockSearchInput
        v-model="form.query"
        class="flex-[2_1_14rem]"
        :market="form.market"
        :placeholder="form.market === 'tw' ? '代號或名稱（2330、台積電、0050）' : '代號或名稱（NVDA、Apple、輝達）'"
        @select="picked = $event"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <QuantityField
        v-model="form.quantity"
        v-model:unit="form.unit"
        :market="form.market"
        :input-class="INPUT_CLASS"
        class="flex-[1_1_9rem]"
        :placeholder="`第一筆${form.market === 'tw' ? form.unit : '股'}數（選填）`"
        :label="`第一筆${form.market === 'tw' ? form.unit : '股'}數`"
      />
      <input v-model="form.cost" inputmode="decimal" :class="INPUT_CLASS" class="flex-[1_1_8rem]" placeholder="第一筆成本價（選填）" />
      <input
        v-model="form.date"
        type="date"
        :max="today()"
        :class="INPUT_CLASS"
        class="flex-[1_1_8.5rem] [color-scheme:dark]"
        aria-label="第一筆成交日期"
        title="第一筆成交日期"
      />
      <button
        type="submit"
        class="shrink-0 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-4 py-2 text-button text-accent transition hover:bg-accent-hue/25 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 font-pixel"
        :disabled="adding"
      >
        {{ adding ? '加入中…' : '加入追蹤' }}
      </button>
    </div>
    <!-- 加到哪個清單：可以選既有清單，或當場建立新清單 -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="shrink-0 text-caption text-ink-muted" aria-hidden="true">加到清單</span>
      <SelectField v-model="addTarget" :options="addTargetOptions" label="加到清單" variant="pixel" hide-label class="min-w-0 flex-[1_1_9rem]" />
      <input
        v-if="addTarget === NEW_GROUP"
        v-model="newGroupName"
        maxlength="20"
        :class="INPUT_CLASS"
        class="flex-[2_1_12rem]"
        placeholder="新清單名稱（例如 長期存股）"
        aria-label="新清單名稱"
      />
    </div>
    <p v-if="formError" class="text-body text-danger">{{ formError }}</p>
    <p v-else-if="formNotice" class="text-body text-ok-hue">{{ formNotice }}</p>
  </form>
</template>
