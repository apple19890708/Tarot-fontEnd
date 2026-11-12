<script setup lang="ts">
import { computed } from 'vue'
import { AI_TABLE_CLASS, renderAiMarkdown } from '../../lib/aiMarkdown'

// 個股與財經新聞 AI 分析的全文（Markdown）。轉 HTML 與清理在 renderAiMarkdown（和塔羅解讀共用）。
// citations：文中有 AI 的引用編號 [3]、[5][8]（財經新聞分析）。畫面上拿掉編號，引用的新聞只列在文末「引用的新聞」
// （2026-11-08 使用者決定：文中的編號上標打斷閱讀）
const props = defineProps<{ text: string; citations?: boolean }>()

// 連續的 [19][37] 連同前面的空白一起拿掉；只認 1～2 位數，避免動到其他方括號
function stripCitations(markdown: string) {
  return markdown.replace(/[ \t]*(?:\[\d{1,2}\])+/g, '')
}

const html = computed(() => renderAiMarkdown(props.citations ? stripCitations(props.text) : props.text))
</script>

<template>
  <div
    :class="AI_TABLE_CLASS"
    class="min-w-0 space-y-4 break-words text-body text-ink/90 [&_pre]:overflow-x-auto [&_h2]:mt-6 [&_h2]:border-t [&_h2]:border-tint/10 [&_h2]:pt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-accent [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-accent [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-warn"
    v-html="html"
  />
</template>
