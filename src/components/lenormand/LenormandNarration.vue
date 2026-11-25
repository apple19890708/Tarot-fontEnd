<script setup lang="ts">
// 雷諾曼的 AI 解讀區（v27 階段 7）：樣子與狀態照塔羅結果頁的 AI 區（StepResult）。
// - ready：說明＋「請 AI 解讀這組牌」；沒有 AI 權限時改成「AI 解讀尚未開通」的提示，不給按了沒用的按鈕
// - loading／streaming：骨架、陸續出現的文字、停止按鈕
// - done：可以重新產生（已是紀錄時，新的那篇會取代紀錄裡的）
// - stopped／error：保留寫出的部分，顯示原因（429 次數用完、403 沒開通…都是後端的訊息）與再試一次
// 雷諾曼頁本來就要雷諾曼權限才進得來，所以這裡只看 AI 權限；真正的放行在後端。
// 大藍圖的解讀比較長：文字只往下長，上面的內容不動；不自動捲動，使用者讀到哪就停在哪
import { computed, ref, watch } from 'vue'

import PixelChevron from '../PixelChevron.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import { AI_TABLE_CLASS, renderAiMarkdown } from '../../lib/aiMarkdown'
import { canUseAi } from '../../lib/auth'
import type { NarrationStatus } from '../../types'

const props = defineProps<{
  status: NarrationStatus
  text: string
  error: string
  // 最近一次有沒有存回紀錄（null＝沒有對應的紀錄或不知道）
  saved: boolean | null
  // 已經是紀錄（紀錄頁、或占卜頁已保存）：重新產生會取代紀錄裡的那一篇
  isRecord: boolean
  // 日記頁：只看，不能產生
  readOnly?: boolean
}>()

const emit = defineEmits<{ request: []; stop: [] }>()

const isNarrating = computed(() => props.status === 'loading' || props.status === 'streaming')
const html = computed(() => renderAiMarkdown(props.text, { sections: true }))

// 收合：開始產生新的解讀時一律展開，否則按了重新產生卻什麼都看不到
const open = ref(true)
watch(
  () => props.status,
  (status) => {
    if (status === 'loading') open.value = true
  },
)
</script>

<template>
  <section
    v-if="status !== 'idle'"
    class="border-2 border-accent-hue/15 bg-gradient-to-br from-accent-hue/10 via-tint/5 to-up-hue/10 p-4 sm:p-6"
    aria-label="AI 解讀"
  >
    <!-- 有內容時整個標題列是收合開關；還沒請 AI 時只是一般標題 -->
    <component
      :is="status !== 'ready' ? 'button' : 'div'"
      :type="status !== 'ready' ? 'button' : undefined"
      class="flex w-full items-center justify-between gap-3 text-left"
      :class="status !== 'ready' ? 'cursor-pointer' : ''"
      :aria-expanded="status !== 'ready' ? open : undefined"
      :aria-label="status !== 'ready' ? (open ? '收合 AI 解讀' : '展開 AI 解讀') : undefined"
      @click="status !== 'ready' && (open = !open)"
    >
      <span class="block min-w-0">
        <span class="block text-caption uppercase tracking-[0.2em] text-ink-muted">Reading</span>
        <span class="mt-1 block text-title font-semibold text-ink">這組牌想說的事</span>
      </span>
      <PixelChevron v-if="status !== 'ready'" class="text-ink-muted" :open="open" />
    </component>

    <div v-if="status === 'ready'" class="mt-4 space-y-4">
      <p class="text-body text-ink-muted">
        想要更完整的白話解讀嗎？AI 會把這組牌串成一句一句的話，說明這件事接下來會怎麼發展。文字會陸續出現，隨時可以停止；{{
          isRecord ? '完整寫完會存進這筆紀錄。' : '完整寫完會自動存進「雷諾曼紀錄」。'
        }}
      </p>
      <button
        v-if="canUseAi && !readOnly"
        class="cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 py-2.5 font-pixel text-button text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px]"
        type="button"
        @click="emit('request')"
      >
        請 AI 解讀這組牌
      </button>
      <!-- 沒有 AI 權限：不要給一個按了也沒用的按鈕（和塔羅一樣） -->
      <div v-else-if="!readOnly" class="border-2 border-tint/10 bg-tint/5 px-4 py-3">
        <p class="text-body font-medium text-ink">AI 解讀尚未開通</p>
        <p class="mt-1 text-caption text-ink-muted">這項功能需要管理者逐一開通，請聯絡管理者。上面的牌義與組合分析不受影響，可以照常看。</p>
      </div>
    </div>

    <!-- 用 grid-rows 0fr↔1fr 收合，不必量高度 -->
    <div
      v-else
      class="grid transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none"
      :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
      :inert="!open"
    >
      <div class="min-h-0 overflow-hidden">
        <div v-if="status === 'loading'" class="mt-4 space-y-5">
          <div class="space-y-2.5">
            <SkeletonBlock class="h-3 w-full" />
            <SkeletonBlock class="h-3 w-11/12" />
            <SkeletonBlock class="h-3 w-4/5" />
          </div>
          <SkeletonBlock class="h-5 w-40" />
          <div class="space-y-2.5">
            <SkeletonBlock class="h-3 w-full" />
            <SkeletonBlock class="h-3 w-10/12" />
            <SkeletonBlock class="h-3 w-3/5" />
          </div>
        </div>

        <div
          v-if="text"
          :class="AI_TABLE_CLASS"
          class="mt-4 min-w-0 space-y-4 break-words text-body text-ink [&_pre]:overflow-x-auto [&_h2]:text-subtitle [&_h2]:font-semibold [&_h2]:text-accent [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:my-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_strong]:font-semibold [&_strong]:text-accent [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:marker:text-warn"
          v-html="html"
        />

        <div v-if="isNarrating" class="mt-5 flex flex-wrap items-center gap-3 border-t border-tint/10 pt-4" aria-live="polite">
          <span class="text-body text-ink-muted">{{ status === 'loading' ? '正在整理這次的解讀…' : 'AI 正在撰寫…' }}</span>
          <button
            class="cursor-pointer border-2 border-tint/15 bg-tint/5 px-4 py-1.5 font-pixel text-button text-ink transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
            type="button"
            @click="emit('stop')"
          >
            停止
          </button>
        </div>

        <div v-else-if="status === 'done' && !readOnly" class="mt-5 flex flex-wrap items-center gap-3 border-t border-tint/10 pt-4">
          <template v-if="canUseAi">
            <span class="text-body text-ink-muted">
              <template v-if="saved === true">已存進這筆紀錄。</template>
              <template v-else-if="saved === false">這篇沒有存進紀錄，可以再產生一次。</template>
              {{ isRecord ? '重新產生的解讀完成後，會取代紀錄裡的這一篇。' : '不滿意可以重新產生一篇。' }}
            </span>
            <button
              class="cursor-pointer border-2 border-accent-hue/30 bg-accent-hue/10 px-4 py-1.5 font-pixel text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[2px] active:translate-y-[2px]"
              type="button"
              @click="emit('request')"
            >
              重新產生
            </button>
          </template>
          <span v-else class="text-body text-ink-muted">AI 解讀尚未開通，無法重新產生；請聯絡管理者。</span>
        </div>

        <div v-else-if="(status === 'stopped' || status === 'error') && !readOnly" class="mt-5 flex flex-wrap items-center gap-3 border-t border-tint/10 pt-4">
          <span class="text-body text-ink-muted" role="status">
            <template v-if="status === 'stopped'">已停止產生，以上是目前寫出的部分。</template>
            <template v-else>{{ error }}可以先參考下方的組合分析，或稍後再試一次。</template>
          </span>
          <button
            v-if="canUseAi"
            class="cursor-pointer border-2 border-accent-hue/30 bg-accent-hue/10 px-4 py-1.5 font-pixel text-button text-accent transition hover:bg-accent-hue/20 active:translate-x-[2px] active:translate-y-[2px]"
            type="button"
            @click="emit('request')"
          >
            {{ status === 'stopped' ? '重新產生' : '再試一次' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
