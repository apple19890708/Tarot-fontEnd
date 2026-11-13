<script setup lang="ts">
import { computed } from 'vue'

import { AI_TABLE_CLASS, renderAiMarkdown } from '../lib/aiMarkdown'

// 追問的 AI 回答的一段（某一次追問的回答）。由 FollowUpPanel 依標題切開後，放在各自的追問底下。
// summary：綜合來看，只放在最後一個有回答的追問裡——之後再追問、重新回答時結論會變，跟著移到最新那一次
// （2026-11-13 使用者要求）
const props = defineProps<{ text: string; title: string; summary?: string }>()

const html = computed(() => renderAiMarkdown(props.text))
const summaryHtml = computed(() => (props.summary ? renderAiMarkdown(props.summary) : ''))

const BODY_CLASS =
  'mt-2 min-w-0 space-y-3 break-words text-body leading-7 text-ink/90 [&_h2]:mt-4 [&_h2]:font-semibold [&_h2]:text-accent [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-accent [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-warn'
</script>

<template>
  <div class="min-w-0 border-l-4 border-accent-hue/60 bg-accent-hue/5 px-3 py-3 sm:px-4">
    <template v-if="text">
      <p class="text-caption font-medium text-accent">{{ title }}</p>
      <div :class="[AI_TABLE_CLASS, BODY_CLASS]" v-html="html" />
    </template>

    <div v-if="summaryHtml" :class="text ? 'mt-4 border-t border-tint/10 pt-4' : ''">
      <p class="text-caption font-medium text-accent">綜合來看</p>
      <div :class="[AI_TABLE_CLASS, BODY_CLASS]" v-html="summaryHtml" />
    </div>
  </div>
</template>
