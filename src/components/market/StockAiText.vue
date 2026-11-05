<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed } from 'vue'

// 個股 AI 分析的全文（Markdown）。轉成 HTML 後一定要經過 DOMPurify 清理再用 v-html 顯示
const props = defineProps<{ text: string }>()

const html = computed(() => (props.text ? DOMPurify.sanitize(marked.parse(props.text, { async: false })) : ''))
</script>

<template>
  <div
    class="min-w-0 space-y-4 break-words text-sm leading-7 text-stone-100/90 [&_pre]:overflow-x-auto [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto sm:leading-8 [&_h2]:mt-6 [&_h2]:border-t [&_h2]:border-white/10 [&_h2]:pt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-amber-100 [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-stone-50 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-amber-50 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-amber-200/60"
    v-html="html"
  />
</template>
