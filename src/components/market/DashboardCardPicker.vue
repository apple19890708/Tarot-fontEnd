<script setup lang="ts">
import { computed, ref } from 'vue'

import { usePointerReorder } from '../../lib/usePointerReorder'

// 股市總覽編輯時，區塊裡的卡片挑選（v19 階段 2）：上面是已選的（拖曳排序、× 移除），下面是還沒選的（點了加到最後）。
// pool 是這個區塊所有能選的卡片；modelValue 是已選的 id（順序就是顯示順序）
const props = defineProps<{
  modelValue: string[]
  // group：還沒選的卡片照這個分組列出（例如重點卡分台股、美股），順序照第一次出現；都沒有就不分組
  pool: { id: string; label: string; hint?: string; group?: string }[]
  max?: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const labelOf = (id: string) => props.pool.find((card) => card.id === id)?.label ?? id
// 已選但 pool 裡找不到的（例如追蹤清單裡已經刪掉的股票）不列出來，存的時候也一起拿掉
const selected = computed(() => props.modelValue.filter((id) => props.pool.some((card) => card.id === id)))
const unselected = computed(() => props.pool.filter((card) => !selected.value.includes(card.id)))
const full = computed(() => props.max !== undefined && selected.value.length >= props.max)
const unselectedGroups = computed(() => {
  const groups: { title: string; cards: typeof props.pool }[] = []
  for (const card of unselected.value) {
    const title = card.group ?? ''
    const group = groups.find((item) => item.title === title)
    if (group) group.cards.push(card)
    else groups.push({ title, cards: [card] })
  }
  return groups
})

function move(from: number, to: number) {
  const list = [...selected.value]
  const [moved] = list.splice(from, 1)
  if (moved === undefined) return
  list.splice(to, 0, moved)
  emit('update:modelValue', list)
}
function remove(id: string) {
  emit('update:modelValue', selected.value.filter((item) => item !== id))
}
function add(id: string) {
  if (full.value) return
  emit('update:modelValue', [...selected.value, id])
}

const listWrap = ref<HTMLElement | null>(null)
const listEl = computed(() => (listWrap.value?.firstElementChild as HTMLElement | null) ?? null)
const reorder = usePointerReorder(listEl, move, () => selected.value.length, 'wrap')
</script>

<template>
  <div class="space-y-2">
    <p class="text-caption text-ink-muted">
      已選 {{ selected.length }}<template v-if="max !== undefined"> / {{ max }}</template> 張：拖曳把手排順序，按 × 拿掉
    </p>
    <div ref="listWrap">
      <TransitionGroup tag="ol" class="flex flex-wrap gap-1.5" move-class="z-10">
        <li
          v-for="(id, index) in selected"
          :key="id"
          class="relative flex items-center gap-1 border-2 py-0.5 pl-0.5 pr-1 text-button transition-[background-color,border-color,box-shadow,transform,scale] duration-200 ease-out motion-reduce:transition-none"
          :class="
            reorder.dragging.value === index
              ? 'z-20 scale-[1.04] border-ok-hue/60 bg-surface shadow-[3px_3px_0_var(--c-shade)] motion-reduce:scale-100'
              : 'border-ink-soft/40 bg-tint/10 text-ink'
          "
        >
          <button
            type="button"
            class="flex h-7 w-5 shrink-0 cursor-grab touch-none select-none items-center justify-center text-ink-muted hover:text-ink active:cursor-grabbing"
            :aria-label="`拖曳排序：${labelOf(id)}（也可以用左右方向鍵）`"
            @pointerdown="reorder.onPointerDown($event, index)"
            @keydown="reorder.onKeydown($event, index)"
          >
            <svg class="h-3.5 w-2.5" viewBox="0 0 6 10" fill="currentColor" aria-hidden="true">
              <rect x="0" y="0" width="2" height="2" /><rect x="4" y="0" width="2" height="2" />
              <rect x="0" y="4" width="2" height="2" /><rect x="4" y="4" width="2" height="2" />
              <rect x="0" y="8" width="2" height="2" /><rect x="4" y="8" width="2" height="2" />
            </svg>
          </button>
          <span class="whitespace-nowrap">{{ labelOf(id) }}</span>
          <button
            type="button"
            class="ml-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-ink-muted transition hover:bg-danger-hue/10 hover:text-danger"
            :aria-label="`拿掉${labelOf(id)}`"
            @click="remove(id)"
          >
            ×
          </button>
        </li>
      </TransitionGroup>
    </div>
    <!-- 不能存成 0 張：存了整塊（連同設定的筆）都不見，就回不來了。要整塊不看請用「客製化區塊」隱藏 -->
    <p v-if="!selected.length" class="text-caption text-danger">至少要留一張卡片；不想看這整個區塊，請用右上角的「客製化區塊」把它隱藏。</p>

    <div v-if="unselected.length" class="space-y-1.5 border-t border-tint/10 pt-2">
      <p class="text-caption text-ink-muted">{{ full ? `已經放滿 ${max} 張，先拿掉一張才能再加` : '點一下加到最後' }}</p>
      <div v-for="group in unselectedGroups" :key="group.title" class="space-y-1">
        <p v-if="group.title" class="text-caption font-semibold text-ink-soft">{{ group.title }}</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="card in group.cards"
            :key="card.id"
            type="button"
            class="cursor-pointer border-2 border-dashed border-tint/20 px-2 py-0.5 text-button text-ink-muted transition hover:border-ink-soft/60 hover:text-ink active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="full"
            :title="card.hint"
            @click="add(card.id)"
          >
            ＋ {{ card.label }}<span v-if="card.hint" class="ml-1 text-caption">{{ card.hint }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
