<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

// 自製下拉：原生 select 的箭頭位置不受 padding 影響，選項清單也無法套用深色樣式，
// 因此改用 button + listbox 自行實作，才能與整體的深色玻璃風格一致。
const props = defineProps<{
  modelValue: T
  options: { value: T; label: string }[]
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [T] }>()

const open = ref(false)
const activeIndex = ref(0)
const root = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLButtonElement | null>(null)
const labelId = useId()

const selectedIndex = computed(() => props.options.findIndex((option) => option.value === props.modelValue))
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '請選擇')

function openList() {
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
  open.value = true
}

function closeList() {
  open.value = false
}

function toggle() {
  open.value ? closeList() : openList()
}

function choose(index: number) {
  const option = props.options[index]
  if (option) {
    emit('update:modelValue', option.value)
  }
  closeList()
  buttonRef.value?.focus()
}

function moveActive(delta: number) {
  if (!open.value) {
    openList()
    return
  }
  const count = props.options.length
  activeIndex.value = (activeIndex.value + delta + count) % count
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      if (open.value) {
        event.preventDefault()
        activeIndex.value = 0
      }
      break
    case 'End':
      if (open.value) {
        event.preventDefault()
        activeIndex.value = props.options.length - 1
      }
      break
    case 'Enter':
    case ' ':
      event.preventDefault()
      open.value ? choose(activeIndex.value) : openList()
      break
    case 'Escape':
      if (open.value) {
        event.preventDefault()
        closeList()
      }
      break
    case 'Tab':
      closeList()
      break
  }
}

// 捲動讓作用中的選項保持可見
watch([open, activeIndex], async ([isOpen]) => {
  if (!isOpen) {
    return
  }
  await nextTick()
  listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
})

function onPointerDown(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) {
    closeList()
  }
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div ref="root" class="relative space-y-2">
    <span :id="labelId" class="block text-sm font-medium text-stone-200">{{ label }}</span>

    <button
      ref="buttonRef"
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-3xl border bg-white/5 py-2.5 pl-4 pr-3 text-left text-sm text-stone-50 transition hover:bg-white/8"
      :class="open ? 'border-amber-200/40 bg-white/8' : 'border-white/10'"
      :aria-labelledby="labelId"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown="onKeydown"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <!-- 自繪箭頭，位置可控，不會貼在圓角上 -->
      <svg
        class="h-4 w-4 flex-shrink-0 text-stone-400 transition-transform"
        :class="{ 'rotate-180': open }"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <ul
        v-show="open"
        ref="listRef"
        class="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/95 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur"
        role="listbox"
        :aria-labelledby="labelId"
        tabindex="-1"
      >
        <li
          v-for="(option, index) in options"
          :key="option.value"
          class="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm transition"
          :class="[
            index === activeIndex ? 'bg-white/10 text-stone-50' : 'text-stone-300',
            option.value === modelValue ? 'text-amber-100' : '',
          ]"
          :data-active="index === activeIndex"
          role="option"
          :aria-selected="option.value === modelValue"
          @mouseenter="activeIndex = index"
          @click="choose(index)"
        >
          <span>{{ option.label }}</span>
          <span v-if="option.value === modelValue" class="text-amber-200" aria-hidden="true">✓</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>
