<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed } from 'vue'

// 個股與財經新聞 AI 分析的全文（Markdown）。轉成 HTML 後一定要經過 DOMPurify 清理再用 v-html 顯示。
// citations：文中的引用編號 [3]、[5][8] 改成小一號、換顏色的上標，不打斷閱讀；點了發出 cite 事件（父元件捲到那則新聞）
const props = defineProps<{ text: string; citations?: boolean }>()
const emit = defineEmits<{ cite: [index: number] }>()

// 連續的 [19][37] 每個編號各一個上標（各自可以點）；只認 1～2 位數，避免動到其他方括號
function markCitations(markdown: string) {
  return markdown.replace(/(?:\[\d{1,2}\])+/g, (run) =>
    (run.match(/\d+/g) || []).map((n) => `<sup data-cite="${n}">${n}</sup>`).join(''),
  )
}

const html = computed(() => {
  if (!props.text) return ''
  const source = props.citations ? markCitations(props.text) : props.text
  return DOMPurify.sanitize(marked.parse(source, { async: false }))
})

function onClick(event: MouseEvent) {
  if (!props.citations) return
  const target = (event.target as HTMLElement | null)?.closest('sup[data-cite]')
  const index = Number(target?.getAttribute('data-cite'))
  if (index > 0) emit('cite', index)
}
</script>

<template>
  <div
    class="min-w-0 space-y-4 break-words text-sm leading-7 text-stone-100/90 [&_pre]:overflow-x-auto [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto sm:leading-8 [&_h2]:mt-6 [&_h2]:border-t [&_h2]:border-white/10 [&_h2]:pt-5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-amber-100 [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-stone-50 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-amber-50 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-amber-200/60 [&_sup[data-cite]]:ml-px [&_sup[data-cite]]:cursor-pointer [&_sup[data-cite]]:px-px [&_sup[data-cite]]:text-[10px] [&_sup[data-cite]]:font-normal [&_sup[data-cite]]:text-sky-300/60 [&_sup[data-cite]]:hover:text-sky-200 [&_sup[data-cite]]:hover:underline"
    @click="onClick"
    v-html="html"
  />
</template>
