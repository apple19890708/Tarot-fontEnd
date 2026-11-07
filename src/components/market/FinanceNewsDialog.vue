<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { fetchFinanceNewsDigest } from '../../lib/api'
import { NEWS_TONES } from '../../lib/newsTone'
import { useScrollLock } from '../../lib/useScrollLock'
import SkeletonBlock from '../SkeletonBlock.vue'
import type { FinanceNewsDigest, FinanceNewsItem, FinanceNewsTheme } from '../../types'

// 新聞重點彈窗（v17 規格 G）：後端從原文節錄的重點句、提及個股、語氣與可能影響族群（不呼叫 AI），附原文連結。
// 文字一律是後端給的，前端只排版與上色
const props = defineProps<{ item: FinanceNewsItem; themes: FinanceNewsTheme[] }>()
// watched：彈窗讀完全文後，我追蹤的個股（台股名稱、美股代號，和列表的「與我追蹤相關」同格式）
const emit = defineEmits<{ close: []; watched: [labels: string[]] }>()
// 彈窗開著時背後頁面不能捲動
useScrollLock()

const digest = ref<FinanceNewsDigest | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchFinanceNewsDigest(props.item.id)
    if (id !== requestId) return
    digest.value = result.digest
    status.value = 'ready'
    // 列表只看標題與摘要，全文可能提到更多：讓列表卡片跟彈窗一致
    emit(
      'watched',
      result.digest.stocks.filter((s) => s.watched).map((s) => (s.market === 'tw' ? s.name : s.symbol)),
    )
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '重點整理暫時讀不到。'
    status.value = 'error'
  }
}

// 語氣標籤和清單卡片共用（lib/newsTone.ts）
const TONES = NEWS_TONES

// 族群依據的主要主題（後端用全文判斷，可能和列表上的主題標籤不同）
const themeLabels = computed(() => (digest.value?.groups ?? []).map((g) => g.label))
const twGroups = computed(() => [...new Set((digest.value?.groups ?? []).flatMap((g) => g.tw))])
const usGroups = computed(() => [...new Set((digest.value?.groups ?? []).flatMap((g) => g.us))])

// 提及個股：我追蹤的排前面，其他維持後端的順序（標題裡的在前）；超過 6 個先收起來
const STOCK_PREVIEW = 6
const showAllStocks = ref(false)
const sortedStocks = computed(() => {
  const stocks = digest.value?.stocks ?? []
  return [...stocks.filter((s) => s.watched), ...stocks.filter((s) => !s.watched)]
})
const visibleStocks = computed(() => (showAllStocks.value ? sortedStocks.value : sortedStocks.value.slice(0, STOCK_PREVIEW)))
const hiddenStockCount = computed(() => Math.max(0, sortedStocks.value.length - STOCK_PREVIEW))
const lang = computed(() => (props.item.lang === 'en' ? 'en' : 'zh-TW'))

const publishedText = computed(() =>
  new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(props.item.publishedAt)),
)

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
})

// 換另一則新聞：舊的請求作廢
watch(
  () => props.item.id,
  () => {
    digest.value = null
    showAllStocks.value = false
    void load()
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  requestId += 1
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex md:items-center md:justify-center md:bg-black/70 md:p-6" @click.self="close">
      <div
        class="flex h-full w-full flex-col bg-[#0f1526] text-stone-100 md:h-auto md:max-h-[90vh] md:max-w-2xl md:border-2 md:border-[#3b2618] md:shadow-[6px_6px_0_rgba(0,0,0,0.5)]"
        role="dialog"
        aria-modal="true"
        :aria-label="`新聞重點：${item.title}`"
      >
        <div class="flex items-start justify-between gap-3 border-b-2 border-[#3b2618] px-4 py-3">
          <div class="min-w-0">
            <p class="text-caption uppercase tracking-[0.2em] text-stone-300">News Digest</p>
            <p class="font-pixel text-[12px] text-amber-100">新聞重點</p>
          </div>
          <button
            type="button"
            class="-mr-1 shrink-0 cursor-pointer border-2 border-white/10 px-3 py-1.5 font-pixel text-button text-stone-200 transition hover:bg-white/10 active:translate-x-[2px] active:translate-y-[2px]"
            @click="close"
          >
            關閉
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <!-- 標題與來源 -->
          <div>
            <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-stone-300">
              <span class="border px-1.5" :class="item.region === 'tw' ? 'border-amber-200/30 text-amber-100' : 'border-sky-200/30 text-sky-100'">
                {{ item.region === 'tw' ? '國內' : '國外' }}
              </span>
              <span>{{ item.sourceLabel }}</span>
              <time :datetime="item.publishedAt">{{ publishedText }}</time>
            </p>
            <h3 class="mt-2 text-subtitle font-semibold text-stone-50" :lang="lang">{{ item.title }}</h3>
          </div>

          <!-- 載入中：標籤列、三句重點、族群、按鈕 -->
          <div v-if="status === 'loading'" class="space-y-4">
            <div class="flex flex-wrap gap-1.5">
              <SkeletonBlock class="h-6 w-20 rounded-none" />
              <SkeletonBlock v-for="n in 3" :key="n" class="h-6 w-24 rounded-none" />
            </div>
            <div class="space-y-2 border-2 border-white/10 p-4">
              <SkeletonBlock class="h-3 w-20 rounded-none" />
              <SkeletonBlock v-for="n in 3" :key="n" class="h-10 w-full rounded-none" />
            </div>
            <div class="space-y-2 border-2 border-white/10 p-4">
              <SkeletonBlock class="h-3 w-24 rounded-none" />
              <div class="flex flex-wrap gap-1.5">
                <SkeletonBlock v-for="n in 5" :key="n" class="h-6 w-24 rounded-none" />
              </div>
            </div>
            <p class="text-caption text-stone-300">第一次打開這則新聞時要讀原文，約需幾秒鐘…</p>
          </div>

          <!-- 失敗：至少顯示來源摘要 -->
          <div v-else-if="status === 'error'" class="space-y-3">
            <div class="flex flex-wrap items-center gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-body text-rose-100">
              <span>{{ error }}</span>
              <button type="button" class="cursor-pointer border-2 border-rose-200/30 px-3 py-1 text-button font-pixel" @click="load">重試</button>
            </div>
            <p v-if="item.summary" class="text-body text-stone-300" :lang="lang">{{ item.summary }}</p>
          </div>

          <template v-else-if="digest">
            <!-- 標籤：語氣、提及個股 -->
            <div class="flex flex-wrap items-center gap-1.5 text-caption">
              <span class="border px-2 py-0.5" :class="TONES[digest.tone].class">{{ TONES[digest.tone].label }}</span>
              <span
                v-for="stock in visibleStocks"
                :key="`${stock.market}:${stock.symbol}`"
                class="border px-2 py-0.5 tabular-nums"
                :class="stock.watched ? 'border-amber-200/50 bg-amber-200/15 text-amber-50' : 'border-white/15 text-stone-200'"
                :title="stock.watched ? '在你的追蹤清單裡' : undefined"
              >
                <!-- 名稱、代號、市場之間用 margin 分開（模板裡的空白會被壓掉） -->
                <span>{{ stock.name }}</span>
                <span v-if="stock.name !== (stock.code ?? stock.symbol)" class="ml-1">{{ stock.code ?? stock.symbol }}</span>
                <span class="ml-1 text-stone-300">{{ stock.market === 'tw' ? '台股' : '美股' }}</span>
                <span v-if="stock.watched" class="ml-1">★</span>
              </span>
              <button
                v-if="hiddenStockCount"
                type="button"
                class="cursor-pointer border border-white/15 px-2 py-0.5 text-caption text-stone-300 transition hover:bg-white/10 hover:text-stone-200"
                :aria-expanded="showAllStocks"
                @click="showAllStocks = !showAllStocks"
              >
                {{ showAllStocks ? '收合' : `更多（+${hiddenStockCount}）` }}
              </button>
              <span v-if="!digest.stocks.length" class="text-stone-300">沒有比對到特定個股</span>
            </div>

            <!-- 重點摘要（原文節錄） -->
            <section class="border-2 border-white/10 bg-white/5 p-4">
              <p class="font-pixel text-[12px] text-stone-200">重點摘要</p>
              <ul v-if="digest.points.length" class="mt-2 list-disc space-y-2 pl-5 text-body text-stone-100/90 marker:text-amber-200/60" :lang="lang">
                <li v-for="(point, index) in digest.points" :key="index">{{ point }}</li>
              </ul>
              <p v-else class="mt-2 text-body text-stone-300">這則新聞是表格或公告，沒有可以節錄的句子，請看原文。</p>
              <p class="mt-3 text-caption text-stone-300">
                <template v-if="digest.basis === 'article'">從原文節錄的句子，未經改寫。</template>
                <template v-else-if="digest.articleRead">原文主要是表格，挑不出完整的句子<template v-if="digest.points.length">，以上是來源提供的摘要</template>。</template>
                <template v-else>原文網站不開放讀取<template v-if="digest.points.length">，以上是來源提供的摘要</template>。</template>
                <template v-if="item.lang === 'en'">英文新聞節錄原句，不另外翻譯。</template>
              </p>
            </section>

            <!-- 可能影響族群（依主題對照） -->
            <section v-if="twGroups.length || usGroups.length" class="space-y-2 border-2 border-white/10 bg-white/5 p-4 text-caption">
              <p class="font-pixel text-[12px] text-stone-200">可能影響族群</p>
              <p v-if="twGroups.length" class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-stone-300">台股</span>
                <span v-for="group in twGroups" :key="group" class="border border-amber-200/25 px-2 py-0.5 text-amber-50/90">{{ group }}</span>
              </p>
              <p v-if="usGroups.length" class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-stone-300">美股</span>
                <span v-for="group in usGroups" :key="group" class="border border-sky-200/25 px-2 py-0.5 text-sky-50/90">{{ group }}</span>
              </p>
              <p class="text-stone-300">依新聞主題（{{ themeLabels.join('、') }}）對照的參考族群，不代表新聞寫到這些族群；要看因果推論請用「AI 影響分析」。</p>
            </section>
          </template>

          <!-- 原文連結 -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p class="text-caption text-stone-300">標籤是規則比對的結果，僅供參考，不是投資建議。</p>
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="shrink-0 border-2 border-amber-200/40 bg-amber-200/10 px-3 py-1 font-pixel text-button text-amber-50 transition hover:bg-amber-200/20"
            >
              閱讀原文 ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
