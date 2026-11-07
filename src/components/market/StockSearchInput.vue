<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { searchMarketTargets } from '../../lib/api'
import type { MarketSearchResult } from '../../types'

// 股票輸入框：打代號或名稱時即時查詢，下拉列出符合的標的。
// 選了候選會 emit select（帶完整標的）；沒選直接送出時，父元件用輸入的文字讓後端找
const props = defineProps<{
  market: 'tw' | 'us'
  placeholder?: string
}>()
const query = defineModel<string>({ required: true })
const emit = defineEmits<{ select: [target: MarketSearchResult] }>()

const DEBOUNCE_MS = 250

const results = ref<MarketSearchResult[]>([])
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const open = ref(false)
// 只有輸入框有焦點時才開下拉（父元件帶入文字時不要自己彈出來）
const focused = ref(false)
const highlighted = ref(-1)
// 剛選完候選時會改 query，這次變動不要再查一次
let skipNext = false
let timer: ReturnType<typeof setTimeout> | null = null
let controller: AbortController | null = null
let requestId = 0

function clearPending() {
  if (timer) clearTimeout(timer)
  timer = null
  controller?.abort()
  controller = null
}

async function search(text: string) {
  const id = (requestId += 1)
  controller = new AbortController()
  status.value = 'loading'
  try {
    const { results: found } = await searchMarketTargets(props.market, text, controller.signal)
    if (id !== requestId) return
    results.value = found
    highlighted.value = found.length ? 0 : -1
    status.value = 'ready'
  } catch (error) {
    if (id !== requestId || (error instanceof DOMException && error.name === 'AbortError')) return
    results.value = []
    status.value = 'error'
  }
}

function schedule() {
  clearPending()
  const text = query.value.trim()
  if (!text) {
    requestId += 1
    results.value = []
    status.value = 'idle'
    return
  }
  timer = setTimeout(() => void search(text), DEBOUNCE_MS)
}

watch(query, () => {
  if (skipNext) {
    skipNext = false
    return
  }
  open.value = focused.value
  schedule()
})

// 切換台股／美股時清掉舊的候選並重查
watch(
  () => props.market,
  () => {
    results.value = []
    if (query.value.trim()) schedule()
  },
)

function idOf(target: MarketSearchResult) {
  return target.market === 'tw' && target.code && target.kind === 'stock' ? target.code : target.symbol || target.code || ''
}

function choose(target: MarketSearchResult) {
  skipNext = true
  query.value = target.name
  open.value = false
  clearPending()
  emit('select', target)
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value || results.value.length === 0) {
    if (event.key === 'ArrowDown' && results.value.length) open.value = true
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlighted.value = (highlighted.value + 1) % results.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = (highlighted.value - 1 + results.value.length) % results.value.length
  } else if (event.key === 'Enter' && highlighted.value >= 0) {
    // 下拉開著時 Enter 是選候選，不要送出表單
    const target = results.value[highlighted.value]
    if (!target) return
    event.preventDefault()
    choose(target)
  } else if (event.key === 'Escape') {
    open.value = false
  }
}

function onFocus() {
  focused.value = true
  open.value = results.value.length > 0
}

function onBlur() {
  focused.value = false
  open.value = false
}

onBeforeUnmount(clearPending)
</script>

<template>
  <div class="relative min-w-0">
    <input
      v-model="query"
      role="combobox"
      autocomplete="off"
      :aria-expanded="open && results.length > 0"
      class="w-full min-w-0 border-2 border-white/10 bg-white/5 px-3 py-2 text-body text-stone-50 outline-none placeholder:text-stone-500 focus:border-amber-200/40"
      :placeholder="placeholder"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />
    <!-- 不透明底色，避免和下面的內容疊在一起看不清楚 -->
    <ul
      v-if="open && query.trim() && (results.length || status !== 'idle')"
      role="listbox"
      class="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto border-2 border-white/15 bg-[#0f1526] py-1 shadow-xl shadow-black/40"
    >
      <li v-if="status === 'loading' && results.length === 0" class="px-3 py-2 text-body text-stone-300">搜尋中…</li>
      <li v-else-if="status === 'error'" class="px-3 py-2 text-body text-rose-200">搜尋暫時失敗，可以直接按新增讓系統判斷。</li>
      <li v-else-if="status === 'ready' && results.length === 0" class="px-3 py-2 text-body text-stone-300">
        找不到符合的{{ market === 'tw' ? '台股' : '美股' }}
      </li>
      <li
        v-for="(target, index) in results"
        :key="`${target.symbol}-${target.code}`"
        role="option"
        :aria-selected="index === highlighted"
        class="flex cursor-pointer items-center gap-3 px-3 py-2 text-body"
        :class="index === highlighted ? 'bg-amber-200/15 text-amber-50' : 'text-stone-200 hover:bg-white/10'"
        @mousedown.prevent="choose(target)"
        @mouseenter="highlighted = index"
      >
        <span class="w-16 shrink-0 tabular-nums text-stone-300">{{ idOf(target) }}</span>
        <span class="min-w-0 flex-1 truncate">{{ target.name }}</span>
        <span v-if="target.kind === 'index'" class="shrink-0 text-caption text-amber-100/70">指數</span>
        <span v-else-if="target.exchange === 'otc'" class="shrink-0 text-caption text-stone-300">上櫃</span>
      </li>
    </ul>
  </div>
</template>
