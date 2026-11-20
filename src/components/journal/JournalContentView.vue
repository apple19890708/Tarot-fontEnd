<script setup lang="ts">
// 日記內容的唯讀顯示（v26 計畫 2）：用唯讀的 Tiptap 渲染，不用 v-html（避免 XSS；後端也驗了節點白名單）
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { watch } from 'vue'

import { journalExtensions } from '../../lib/journalEditor'
import type { JournalContent } from '../../types'

const props = defineProps<{ content: JournalContent }>()

const editor = useEditor({
  content: props.content,
  editable: false,
  extensions: journalExtensions(),
  editorProps: { attributes: { class: 'journal-prose text-body text-ink outline-none' } },
})

watch(
  () => props.content,
  (value) => editor.value?.commands.setContent(value, { emitUpdate: false }),
)
</script>

<template>
  <EditorContent :editor="editor" />
</template>
