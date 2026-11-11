<script setup lang="ts">
// 表格的股票欄（2026-11-11 使用者要求：名稱在上、代號在下，所有表格統一）。
// 名稱一行不斷開，太長用 … 截斷（滑過看全名）；寬度用 em，手機 8em、平板 12em、桌機 20em（美股英文全名才放得下）。
// action：有給就把名稱做成按鈕（虛線底線），點了發出 open，文字當作按鈕的 title（例如「個股分析」）。
// 插槽：放在代號後面的補充（例如「．季配」「．沒持股」「上櫃」），由呼叫端自己帶分隔符號
defineProps<{ name: string; code?: string | null; action?: string }>()
const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <button
    v-if="action"
    type="button"
    class="block max-w-[8em] cursor-pointer truncate whitespace-nowrap text-left text-ink underline decoration-dotted decoration-tint/40 underline-offset-4 hover:text-accent active:text-accent sm:max-w-[12em] lg:max-w-[20em]"
    :title="`${name}：${action}`"
    @click.stop="emit('open')"
  >
    {{ name }}
  </button>
  <span v-else class="block max-w-[8em] truncate whitespace-nowrap text-ink sm:max-w-[12em] lg:max-w-[20em]" :title="name">{{ name }}</span>
  <span v-if="code || $slots.default" class="block text-caption text-ink-muted">{{ code }}<slot /></span>
</template>
