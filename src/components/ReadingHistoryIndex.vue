<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ReadingSummary } from '../types'

const props = defineProps<{
  // 全部的摘要（後端已依時間新到舊排好）
  readings: ReadingSummary[]
  selectedId: string
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

type NarrationFilter = 'all' | 'ai'

const keyword = ref('')
const narrationFilter = ref<NarrationFilter>('all')

const filterOptions: { value: NarrationFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'ai', label: '有 AI 解讀' },
]

// 只比對使用者自己的資料：問題文字與牌名快照
const filtered = computed(() => {
  const term = keyword.value.trim().toLowerCase()
  return props.readings.filter((item) => {
    if (narrationFilter.value === 'ai' && !item.hasNarration) {
      return false
    }
    if (!term) {
      return true
    }
    return (
      item.question.toLowerCase().includes(term) ||
      item.cards.some((card) => card.nameZh.toLowerCase().includes(term))
    )
  })
})

const hasCondition = computed(() => keyword.value.trim() !== '' || narrationFilter.value !== 'all')

// 依年月分組；輸入已排序，所以相鄰的同月份就是同一組
const groups = computed(() => {
  const result: { key: string; label: string; items: ReadingSummary[] }[] = []
  for (const item of filtered.value) {
    const date = new Date(item.createdAt)
    const valid = !Number.isNaN(date.getTime())
    const key = valid ? `${date.getFullYear()}-${date.getMonth()}` : 'unknown'
    const last = result[result.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      result.push({
        key,
        label: valid ? `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` : '日期不明',
        items: [item],
      })
    }
  }
  return result
})

// 桌機超過 10 筆時，清單高度固定在剛好 10 筆、其餘捲動。
// 每筆的高度不一（問題一行或兩行、中間夾著月份標題），所以用第 10 筆實際的底部量出高度，
// 再多露一點第 11 筆，讓人看得出下面還有。手機的清單本來就是滿版捲動，不受影響。
const VISIBLE_LIMIT = 10
const PEEK_PX = 20
const navEl = ref<HTMLElement | null>(null)
const listMaxHeight = ref<string | null>(null)

function measureListHeight() {
  const nav = navEl.value
  const items = nav?.querySelectorAll('li')
  const last = items?.[VISIBLE_LIMIT - 1]
  if (!nav || !items || items.length <= VISIBLE_LIMIT || !last) {
    listMaxHeight.value = null
    return
  }
  const offset = last.getBoundingClientRect().bottom - nav.getBoundingClientRect().top + nav.scrollTop
  listMaxHeight.value = `${Math.ceil(offset + PEEK_PX)}px`
}

let resizeObserver: ResizeObserver | null = null

watch(filtered, () => nextTick(measureListHeight))

// nav 在「沒有符合的紀錄」時會被拿掉，重新出現時要重新量、重新觀察寬度（寬度變了，問題換行數就變了）
watch(navEl, (el) => {
  resizeObserver?.disconnect()
  if (el) {
    resizeObserver?.observe(el)
    measureListHeight()
  }
})

onMounted(() => {
  resizeObserver = new ResizeObserver(() => measureListHeight())
  if (navEl.value) {
    resizeObserver.observe(navEl.value)
  }
  measureListHeight()
})

onBeforeUnmount(() => resizeObserver?.disconnect())

// 問題被截斷時才需要提示：沒有「…」就不要跳東西出來打擾。
// 清單本身是 overflow-y-auto，提示放在列裡會被裁掉，所以掛到 body 再自己算位置。
const tip = ref<{ text: string; left: number; top: number } | null>(null)
const TIP_WIDTH = 288

function showTip(event: FocusEvent | MouseEvent, text: string) {
  const row = event.currentTarget as HTMLElement | null
  const node = row?.querySelector('[data-question]') as HTMLElement | null
  if (!node) {
    return
  }
  // clamp 之後真正的內容比看得到的高，就表示被截斷了（留 1px 容忍捨入誤差）
  const truncated = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1
  if (!truncated) {
    return
  }
  const rect = node.getBoundingClientRect()
  tip.value = {
    text,
    // 靠近右邊界時往左收，不要被切掉
    left: Math.max(8, Math.min(rect.left, window.innerWidth - TIP_WIDTH - 8)),
    top: rect.bottom + 8,
  }
}

function hideTip() {
  tip.value = null
}

function clearConditions() {
  keyword.value = ''
  narrationFilter.value = 'all'
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <div class="space-y-3">
      <input
        v-model="keyword"
        type="search"
        placeholder="搜尋問題或牌名"
        class="w-full rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-stone-100 placeholder:text-stone-500 focus:border-amber-200/40 focus:outline-none"
      />
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="option in filterOptions"
          :key="option.value"
          type="button"
          class="cursor-pointer rounded-full border px-3 py-1 text-xs transition"
          :class="
            narrationFilter === option.value
              ? 'border-amber-200/50 bg-amber-200/15 text-amber-50'
              : 'border-white/10 text-stone-300 hover:bg-white/10'
          "
          @click="narrationFilter = option.value"
        >
          {{ option.label }}
        </button>
        <span class="ml-auto text-xs text-stone-400">
          <template v-if="hasCondition">符合 {{ filtered.length }} 筆／</template>共 {{ readings.length }} 筆
        </span>
      </div>
    </div>

    <div
      v-if="filtered.length === 0"
      class="rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 px-4 py-6 text-center text-sm text-stone-400"
    >
      <p>沒有符合條件的紀錄</p>
      <button
        type="button"
        class="mt-3 cursor-pointer rounded-full border border-white/15 px-4 py-1.5 text-sm text-stone-200 transition hover:bg-white/10"
        @click="clearConditions"
      >
        清除條件
      </button>
    </div>

    <nav
      v-else
      ref="navEl"
      class="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 lg:max-h-(--list-max)"
      @scroll="hideTip"
      :style="listMaxHeight ? { '--list-max': listMaxHeight } : undefined"
      aria-label="占卜紀錄"
    >
      <section v-for="group in groups" :key="group.key">
        <p class="mb-2 px-1 text-xs tracking-[0.2em] text-stone-400">{{ group.label }}</p>
        <ul class="space-y-2">
          <li v-for="item in group.items" :key="item.id">
            <button
              type="button"
              class="w-full cursor-pointer rounded-2xl border px-4 py-3 text-left transition"
              :class="
                selectedId === item.id
                  ? 'border-amber-200/40 bg-amber-200/10'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              "
              :aria-current="selectedId === item.id ? 'true' : undefined"
              @click="hideTip(); emit('select', item.id)"
              @mouseenter="showTip($event, item.question || '未填寫問題')"
              @mouseleave="hideTip"
              @focus="showTip($event, item.question || '未填寫問題')"
              @blur="hideTip"
            >
              <!--
                line-clamp 要靠 display:-webkit-box，不能再加 block，否則整段完全不截斷。
                桌機左欄窄，截成一行；手機清單是滿版，留兩行比較讀得到重點。
                完整問題放在 title，滑鼠停住就看得到。
              -->
              <span
                data-question
                class="line-clamp-2 text-sm leading-6 text-amber-50 lg:line-clamp-1"
              >
                {{ item.question || '未填寫問題' }}
              </span>
              <span class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-400">
                <span class="tabular-nums">{{ formatShortDate(item.createdAt) }}</span>
                <span>{{ item.cardCount }} 張</span>
                <span
                  v-if="item.hasNarration"
                  class="rounded-full border border-amber-200/30 bg-amber-200/10 px-1.5 py-0.5 text-[11px] leading-none text-amber-100"
                >
                  AI
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </nav>

    <!-- 只有文字被截斷時才會有值；跟著列的左緣、落在列下方 -->
    <Teleport to="body">
      <div
        v-if="tip"
        class="pointer-events-none fixed z-50 w-72 rounded-md border border-white/10 bg-neutral-800 px-3 py-2 text-xs leading-5 text-stone-100 shadow-lg shadow-black/50"
        :style="{ left: `${tip.left}px`, top: `${tip.top}px` }"
        role="tooltip"
      >
        {{ tip.text }}
      </div>
    </Teleport>
  </div>
</template>
