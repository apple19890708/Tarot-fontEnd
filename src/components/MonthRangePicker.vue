<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// 月份區間選擇器（2026-11-10 使用者要求：照「起 ~ 迄」兩個欄位、右邊月曆圖示的樣子）。
// 資料是按月的，所以選到「月」；每個欄位點開是「‹ 年 ›＋12 個月格子」。min／max 以外不能選；
// 區間最長 maxSpan 個月：起始選得比結束晚、或間隔太長，另一端會自動調整。Esc、點外面關閉。
// 原生 <input type="month"> 在 Safari、Firefox 桌面版只是文字框，所以自己做
const start = defineModel<string>('start', { required: true })
const end = defineModel<string>('end', { required: true })
const props = withDefaults(defineProps<{ min: string; max: string; maxSpan?: number }>(), { maxSpan: 12 })

const shift = (month: string, delta: number) => {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
const text = (month: string) => `${month.slice(0, 4)}/${month.slice(5)}`
const clamp = (month: string) => (month < props.min ? props.min : month > props.max ? props.max : month)

const open = ref<'start' | 'end' | null>(null)
const year = ref(Number(start.value.slice(0, 4)))
function toggle(which: 'start' | 'end') {
  if (open.value === which) {
    open.value = null
    return
  }
  year.value = Number((which === 'start' ? start.value : end.value).slice(0, 4))
  open.value = which
}
function monthsOf(y: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const value = `${y}-${String(i + 1).padStart(2, '0')}`
    return {
      value,
      label: `${i + 1} 月`,
      disabled: value < props.min || value > props.max,
      selected: value === (open.value === 'start' ? start.value : end.value),
      inRange: value >= start.value && value <= end.value,
    }
  })
}
function pick(value: string) {
  if (open.value === 'start') {
    start.value = value
    // 結束不能早於起始、也不能超過最長區間
    if (end.value < value || end.value > shift(value, props.maxSpan - 1)) end.value = clamp(shift(value, props.maxSpan - 1))
  } else {
    end.value = value
    if (start.value > value || start.value < shift(value, -(props.maxSpan - 1))) start.value = clamp(shift(value, -(props.maxSpan - 1)))
  }
  open.value = null
}

// 點外面、按 Esc 關閉
const root = ref<HTMLElement | null>(null)
function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && event.target instanceof Node && !root.value.contains(event.target)) open.value = null
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    open.value = null
  }
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

const minYear = () => Number(props.min.slice(0, 4))
const maxYear = () => Number(props.max.slice(0, 4))
const NAV =
  'flex h-7 w-7 cursor-pointer items-center justify-center border border-tint/15 text-ink-muted transition hover:bg-tint/10 hover:text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40'
</script>

<template>
  <div ref="root" class="flex items-center gap-2">
    <template v-for="field in (['start', 'end'] as const)" :key="field">
      <span v-if="field === 'end'" class="text-ink-muted" aria-hidden="true">~</span>
      <!-- 每個欄位自己一個定位框：選單從欄位左邊往下展開，不會跑出畫面 -->
      <div class="relative">
        <button
          type="button"
          class="flex min-w-[8.5em] cursor-pointer items-center justify-between gap-3 border-2 bg-tint/5 px-3 py-1.5 text-body tabular-nums text-ink transition hover:bg-tint/10"
          :class="open === field ? 'border-accent-hue' : 'border-tint/15'"
          :aria-label="field === 'start' ? '起始月份' : '結束月份'"
          :aria-expanded="open === field"
          @click="toggle(field)"
        >
          {{ text(field === 'start' ? start : end) }}
          <!-- 月曆圖示 -->
          <svg class="h-5 w-5 shrink-0 text-ink-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="2" y="3" width="12" height="2" /><rect x="2" y="3" width="2" height="11" /><rect x="12" y="3" width="2" height="11" />
            <rect x="2" y="12" width="12" height="2" /><rect x="4" y="1" width="2" height="3" /><rect x="10" y="1" width="2" height="3" />
            <rect x="5" y="7" width="3" height="3" />
          </svg>
        </button>

        <div
          v-if="open === field"
          class="absolute top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] border-2 border-frame bg-surface p-2 shadow-[4px_4px_0_var(--c-shade)]"
          :class="field === 'start' ? 'left-0' : 'right-0'"
          role="dialog"
          :aria-label="field === 'start' ? '選擇起始月份' : '選擇結束月份'"
        >
          <div class="mb-2 flex items-center justify-between">
            <button type="button" :class="NAV" :disabled="year <= minYear()" aria-label="上一年" @click="year -= 1">‹</button>
            <p class="text-body font-semibold tabular-nums text-ink">{{ year }} 年</p>
            <button type="button" :class="NAV" :disabled="year >= maxYear()" aria-label="下一年" @click="year += 1">›</button>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <button
              v-for="month in monthsOf(year)"
              :key="month.value"
              type="button"
              class="h-8 cursor-pointer border text-button transition active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-30"
              :class="
                month.selected
                  ? 'border-accent-hue bg-selected text-on-selected'
                  : month.inRange
                    ? 'border-accent-hue/30 bg-accent-hue/10 text-ink'
                    : 'border-tint/10 text-ink-soft hover:bg-tint/10'
              "
              :disabled="month.disabled"
              :aria-pressed="month.selected"
              @click="pick(month.value)"
            >
              {{ month.label }}
            </button>
          </div>
          <p class="mt-2 text-caption text-ink-muted">區間最長 {{ maxSpan }} 個月。</p>
        </div>
      </div>
    </template>
  </div>
</template>
