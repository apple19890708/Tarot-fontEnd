<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'

import { fetchFinanceNews, fetchFinanceNewsAnalysis, streamFinanceNewsAnalysis } from '../../lib/api'
import { canUseAi } from '../../lib/auth'
import { NEWS_TONES } from '../../lib/newsTone'
import { useCooldown } from '../../lib/useCooldown'
import RefreshButton from '../RefreshButton.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import FinanceNewsDialog from './FinanceNewsDialog.vue'
import FinanceNewsReportDialog from './FinanceNewsReportDialog.vue'
import type {
  FinanceNewsAnalysisDetail,
  FinanceNewsItem,
  FinanceNewsScopeRegion,
  FinanceNewsView,
  StockAnalysisQuota,
} from '../../types'

// 財經新聞（v17 規格 G）：國內外最新財經新聞（標題、摘要、連結），依區域與主題篩選；
// 有 AI 權限的人可以手動要求 AI 分析「目前篩選範圍」的新聞會影響哪些族群與股票（會計費，放行與次數限制在後端）
const view = ref<FinanceNewsView | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
let requestId = 0

async function load() {
  const id = (requestId += 1)
  if (!view.value) status.value = 'loading'
  error.value = ''
  try {
    const result = await fetchFinanceNews()
    if (id !== requestId) return
    view.value = result
    quota.value = result.quota
    // 沒有正在顯示的分析時，先帶出最近一份
    // 這裡只顯示今天的分析；以前的在「我的紀錄 › 財經新聞分析」
    if (aiStatus.value === 'idle' && !shown.value && result.latest && isTodayInTaipei(result.latest.createdAt)) shown.value = result.latest
    status.value = 'ready'
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '財經新聞暫時讀不到。'
    if (!view.value) status.value = 'error'
  }
}

// 手動更新：按完 30 秒內不能再按（後端 15 分鐘才會重抓來源）
const cooldown = useCooldown(30, 'finance-news-refresh')
// 已經有資料時 load() 不會進入 loading（畫面不換成骨架），按鈕要自己知道「更新中」
const refreshing = ref(false)
const refresh = () =>
  cooldown.run(async () => {
    refreshing.value = true
    try {
      await load()
    } finally {
      refreshing.value = false
    }
  })

onMounted(load)
// 放在 KeepAlive 裡：切回這個分頁時更新
let first = true
onActivated(() => {
  if (first) {
    first = false
    return
  }
  void load()
})

// 點新聞開的「新聞重點」彈窗
const opened = ref<FinanceNewsItem | null>(null)

// 彈窗讀了全文後回報我追蹤的個股：合併進列表那一則，卡片外面和彈窗裡面才會一致
function syncWatched(labels: string[]) {
  const id = opened.value?.id
  if (!id || !view.value) return
  view.value = {
    ...view.value,
    news: view.value.news.map((item) =>
      item.id === id ? { ...item, watched: [...new Set([...(item.watched ?? []), ...labels])] } : item,
    ),
  }
}

// ---- 篩選 ----
const REGION_OPTIONS: { key: FinanceNewsScopeRegion; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'tw', label: '國內' },
  { key: 'intl', label: '國外' },
]
const region = ref<FinanceNewsScopeRegion>('all')
const theme = ref<string | null>(null)
const onlyWatched = ref(false)

const news = computed(() => view.value?.news ?? [])
const inRegion = computed(() => news.value.filter((item) => region.value === 'all' || item.region === region.value))
const filtered = computed(() =>
  inRegion.value
    .filter((item) => !theme.value || item.themes.includes(theme.value))
    .filter((item) => !onlyWatched.value || (item.watched?.length ?? 0) > 0),
)
// 同一件事的多則報導合併成一張卡（後端給的 clusterId）：計數一律算「幾件事」
const clusterOf = (item: FinanceNewsItem) => item.clusterId ?? item.id
const eventCount = (items: FinanceNewsItem[]) => new Set(items.map(clusterOf)).size
const regionCount = (key: FinanceNewsScopeRegion) => eventCount(news.value.filter((item) => key === 'all' || item.region === key))
// 主題依目前區域的件數排序，沒有新聞的主題不顯示
const themeOptions = computed(() =>
  (view.value?.themes ?? [])
    .map((t) => ({ ...t, count: eventCount(inRegion.value.filter((item) => item.themes.includes(t.key))) }))
    .filter((t) => t.count > 0 || t.key === theme.value)
    .sort((a, b) => b.count - a.count),
)
const watchedCount = computed(() => eventCount(inRegion.value.filter((item) => (item.watched?.length ?? 0) > 0)))

// 篩選後依事件分組：卡片顯示最新的那則，其他報導收在「另有 N 則相關報導」
const events = computed(() => {
  const groups = new Map<string, { head: FinanceNewsItem; others: FinanceNewsItem[] }>()
  for (const item of filtered.value) {
    const key = clusterOf(item)
    const group = groups.get(key)
    if (group) group.others.push(item)
    else groups.set(key, { head: item, others: [] })
  }
  return [...groups.values()]
})
// 展開了「相關報導」的事件
const expanded = ref(new Set<string>())
function toggleRelated(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
const themeLabel = (key: string | null) => view.value?.themes.find((t) => t.key === key)?.label ?? key ?? ''

function toggleTheme(key: string) {
  theme.value = theme.value === key ? null : key
}

// 只顯示前 60 件，按「顯示更多」再加
const PAGE = 60
const limit = ref(PAGE)
const visible = computed(() => events.value.slice(0, limit.value))

const failedSources = computed(() => (view.value?.status.sources ?? []).filter((s) => s.ok === false))

const REGION_LABELS: Record<string, string> = { all: '國內外', tw: '國內', intl: '國外' }
function scopeLabel(scope: { region: FinanceNewsScopeRegion; theme: string | null }) {
  return `${REGION_LABELS[scope.region]}${scope.theme ? `・${themeLabel(scope.theme)}` : ''}`
}

// 冷卻倒數要每秒更新；新聞的「幾分鐘前」每分鐘更新就好（避免整個列表每秒重繪）
const nowMs = ref(Date.now())
const clock = setInterval(() => (nowMs.value = Date.now()), 1000)
const minuteMs = ref(Date.now())
const minuteClock = setInterval(() => (minuteMs.value = Date.now()), 60000)
onBeforeUnmount(() => {
  clearInterval(clock)
  clearInterval(minuteClock)
  controller?.abort()
})
// 相對時間：1 小時內寫幾分鐘前，24 小時內寫幾小時前，再早寫日期
function timeAgo(iso: string) {
  const diff = Math.max(0, minuteMs.value - Date.parse(iso))
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分鐘前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`
  return dateTime(iso)
}
function dateTime(iso: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

// ---- AI 影響分析（會計費）----
type AiStatus = 'idle' | 'streaming' | 'done' | 'stopped' | 'error'
const aiStatus = ref<AiStatus>('idle')
const aiText = ref('')
const aiError = ref('')
const aiSaveFailed = ref(false)
// 畫面上正在看的那份已存分析（最近一份、剛跑完的，或從過去的分析選的）
const shown = ref<FinanceNewsAnalysisDetail | null>(null)
const quota = ref<StockAnalysisQuota | null>(null)
let controller: AbortController | null = null

const retryIn = computed(() => {
  const at = quota.value?.retryAt ? Date.parse(quota.value.retryAt) : 0
  return Math.max(0, Math.ceil((at - nowMs.value) / 1000))
})
const retryText = computed(() => `${Math.floor(retryIn.value / 60)}:${String(retryIn.value % 60).padStart(2, '0')}`)
const usedUp = computed(() => quota.value !== null && quota.value.dailyLimit !== null && quota.value.usedToday >= quota.value.dailyLimit)
const scopeCount = computed(() => inRegion.value.filter((item) => !theme.value || item.themes.includes(theme.value)).length)
const canRun = computed(() => aiStatus.value !== 'streaming' && retryIn.value === 0 && !usedUp.value && scopeCount.value > 0)
const runLabel = computed(() => {
  if (aiStatus.value === 'streaming') return '分析中…'
  if (retryIn.value > 0) return `再分析（${retryText.value}）`
  return shown.value || aiText.value ? '重新分析' : '分析影響'
})

// 報告彈窗：按下分析時自動打開；過去的分析點一下也在這裡看
const reportOpen = ref(false)
// 正在跑的那次分析的範圍（串流中還沒有存好的紀錄可以看）
const runScope = ref<{ region: FinanceNewsScopeRegion; theme: string | null } | null>(null)
const reportMeta = computed(() => {
  const showSaved = (aiStatus.value === 'idle' || aiStatus.value === 'done') && shown.value
  if (showSaved && shown.value) {
    return { scopeText: scopeLabel(shown.value), createdAt: shown.value.createdAt, newsCount: shown.value.newsCount, news: shown.value.news }
  }
  return { scopeText: runScope.value ? scopeLabel(runScope.value) : '', createdAt: null, newsCount: null, news: [] }
})

// 畫面顯示的文字：串流中或沒存成功時顯示當下收到的文字，否則顯示已存的分析
const displayText = computed(() => (aiStatus.value === 'idle' || aiStatus.value === 'done') && shown.value ? shown.value.text : aiText.value)

async function runAi() {
  if (!canRun.value) return
  controller = new AbortController()
  const ownController = controller
  const scope = { region: region.value, theme: theme.value }
  runScope.value = scope
  reportOpen.value = true
  aiStatus.value = 'streaming'
  aiText.value = ''
  aiError.value = ''
  aiSaveFailed.value = false
  shown.value = null
  try {
    const result = await streamFinanceNewsAnalysis(scope, {
      signal: ownController.signal,
      onDelta: (text) => {
        if (controller === ownController) aiText.value += text
      },
    })
    if (controller !== ownController) return
    aiSaveFailed.value = !result.analysis
    if (result.analysis) {
      // 取回含新聞清單的完整紀錄，[n] 才對得回新聞；取不到就先用當下的文字
      try {
        shown.value = (await fetchFinanceNewsAnalysis(result.analysis.id)).analysis
      } catch {
        shown.value = { ...result.analysis, text: aiText.value, news: [] }
      }
    }
    aiStatus.value = 'done'
  } catch (err) {
    if (controller !== ownController) return
    if (err instanceof DOMException && err.name === 'AbortError') {
      aiStatus.value = 'stopped'
    } else {
      // 403（沒有權限）、429（冷卻或今天用完）、422（範圍內沒有新聞）都顯示後端的原因
      aiError.value = err instanceof Error ? err.message : 'AI 分析失敗，請再試一次。'
      aiStatus.value = 'error'
      // 還沒開始產生就失敗：關掉彈窗，原因顯示在分頁上
      if (!aiText.value) reportOpen.value = false
    }
  } finally {
    if (controller === ownController) controller = null
    void refreshQuota()
  }
}

function stopAi() {
  controller?.abort()
}

async function refreshQuota() {
  try {
    quota.value = (await fetchFinanceNews()).quota
  } catch {
    // 額度只是提示，讀不到不影響畫面
  }
}

// 台北時間的「今天」（股市頁只留今天的分析）
const taipeiDate = (value: string | number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
function isTodayInTaipei(iso: string) {
  return taipeiDate(iso) === taipeiDate(Date.now())
}
</script>

<template>
  <section class="space-y-5 border-2 border-white/10 bg-[#0f1526] p-4 sm:p-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-caption uppercase tracking-[0.2em] text-stone-300 sm:tracking-[0.3em]">Finance News</p>
        <h2 class="mt-1 text-title font-semibold text-stone-50">財經新聞</h2>
        <p class="mt-1 text-body text-stone-300">
          國內外最近 3 天的財經新聞（CNBC、MarketWatch、鉅亨網、Yahoo 股市），點新聞看重點摘要、提及個股與可能影響族群，裡面有原文連結。主題標籤是關鍵字比對，只用來篩選。
        </p>
      </div>
      <RefreshButton label="更新" :loading="status === 'loading' || refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <!-- 載入中：區域切換、主題標籤、AI 區塊、新聞列表 -->
    <div v-if="status === 'loading'" class="space-y-4">
      <div class="flex gap-1.5">
        <SkeletonBlock v-for="n in 3" :key="n" class="h-7 w-20 rounded-none" />
      </div>
      <div class="flex flex-wrap gap-1.5">
        <SkeletonBlock v-for="n in 8" :key="n" class="h-6 w-24 rounded-none" />
      </div>
      <SkeletonBlock class="h-24 w-full rounded-none" />
      <ul class="space-y-2">
        <li v-for="n in 8" :key="n" class="space-y-2 border-2 border-white/10 p-3">
          <SkeletonBlock class="h-3 w-40 rounded-none" />
          <SkeletonBlock class="h-4 w-11/12 rounded-none" />
          <SkeletonBlock class="h-3 w-3/4 rounded-none" />
        </li>
      </ul>
    </div>

    <div v-else-if="status === 'error'" class="flex flex-wrap items-center gap-3 border-2 border-rose-200/20 bg-rose-300/10 px-4 py-3 text-body text-rose-100">
      <span>{{ error }}</span>
      <RefreshButton label="重試" loading-label="重試中…" tone="danger" :loading="refreshing" :failed="!!error" :cooldown="cooldown" @click="refresh" />
    </div>

    <template v-else-if="view">
      <p class="text-caption text-stone-300">
        <template v-if="view.status.syncedAt">來源更新於 {{ dateTime(view.status.syncedAt) }}</template>
        <template v-if="failedSources.length">｜暫時抓不到：{{ failedSources.map((s) => `${s.label}${s.region === 'tw' ? '（國內）' : '（國外）'}`).join('、') }}</template>
        <template v-if="error">｜{{ error }}</template>
      </p>

      <!-- ── 篩選 ── -->
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="新聞區域">
          <button
            v-for="option in REGION_OPTIONS"
            :key="option.key"
            type="button"
            role="tab"
            :aria-selected="region === option.key"
            class="shrink-0 cursor-pointer whitespace-nowrap border px-2.5 py-1 text-button transition"
            :class="region === option.key ? 'border-amber-200/50 bg-amber-200/15 text-amber-50' : 'border-white/10 text-stone-300 hover:bg-white/10'"
            @click="region = option.key; limit = PAGE"
          >
            {{ option.label }}（{{ regionCount(option.key) }}）
          </button>
          <!-- 手機：自己一行、靠左和其他篩選對齊；桌機：同一行最右邊 -->
          <label class="flex w-full cursor-pointer items-center gap-1.5 pt-1 text-caption text-stone-300 sm:ml-auto sm:w-auto sm:pt-0">
            <input v-model="onlyWatched" type="checkbox" class="accent-amber-300" @change="limit = PAGE" />
            只看與我追蹤相關（{{ watchedCount }}）
          </label>
        </div>
        <div v-if="themeOptions.length" class="flex flex-wrap gap-1.5" aria-label="主題">
          <button
            v-for="option in themeOptions"
            :key="option.key"
            type="button"
            :aria-pressed="theme === option.key"
            class="cursor-pointer border px-2 py-0.5 text-button transition"
            :class="theme === option.key ? 'border-rose-200/50 bg-rose-300/15 text-rose-50' : 'border-white/10 text-stone-300 hover:bg-white/10 hover:text-stone-200'"
            @click="toggleTheme(option.key); limit = PAGE"
          >
            {{ option.label }}（{{ option.count }}）
          </button>
        </div>
      </div>

      <!-- ── AI 影響分析 ── -->
      <section class="border-2 border-amber-200/25 bg-amber-200/5 p-4" aria-live="polite">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-pixel text-[12px] text-amber-100">AI 影響分析</p>
            <p class="mt-1 text-caption text-stone-300">
              <template v-if="!canUseAi">AI 分析需要管理者開通，請聯絡管理者。</template>
              <template v-else>
                分析範圍：{{ scopeLabel({ region, theme }) }}（最近 24 小時最多 40 則）
                <template v-if="quota && quota.dailyLimit !== null"> · 今天已用 {{ quota.usedToday }}／{{ quota.dailyLimit }} 次</template>
                <template v-else-if="quota"> · 今天已用 {{ quota.usedToday }} 次</template>
              </template>
            </p>
          </div>
          <div v-if="canUseAi" class="flex gap-2">
            <button
              v-if="aiStatus === 'streaming'"
              type="button"
              class="cursor-pointer border-2 border-white/15 px-3 py-1 font-pixel text-button text-stone-200 transition hover:bg-white/10"
              @click="stopAi"
            >
              停止
            </button>
            <button
              type="button"
              class="cursor-pointer border-2 border-amber-200/40 bg-amber-200/10 px-3 py-1 font-pixel text-button text-amber-50 transition hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-[2px] active:translate-y-[2px]"
              :disabled="!canRun"
              @click="runAi"
            >
              {{ runLabel }}
            </button>
          </div>
        </div>

        <p v-if="canUseAi && usedUp && aiStatus !== 'streaming'" class="mt-3 text-body text-amber-100/80">今天的新聞 AI 分析已用完，明天再試。</p>
        <p v-if="canUseAi && scopeCount === 0" class="mt-3 text-body text-stone-300">這個範圍沒有新聞，換個區域或主題再分析。</p>
        <!-- 還沒開始產生就失敗（沒有權限、冷卻中、今天用完）時，原因顯示在這裡 -->
        <p v-if="aiError" class="mt-3 border-2 border-rose-200/20 bg-rose-300/10 px-3 py-2 text-body text-rose-100">{{ aiError }}</p>

        <!-- 報告在彈窗裡看，這裡只放一列摘要 -->
        <div
          v-if="aiStatus === 'streaming' || aiText || shown"
          class="mt-3 flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/20 px-3 py-2 text-body"
        >
          <span class="min-w-0 text-stone-300">
            <template v-if="aiStatus === 'streaming'">分析中…{{ aiText ? `已收到 ${aiText.length} 字` : 'AI 正在讀新聞' }}</template>
            <template v-else-if="aiStatus === 'stopped'">已停止的分析（未完成，沒有存進紀錄）</template>
            <template v-else-if="aiStatus === 'error' && aiText">中途失敗的分析（未完成）</template>
            <template v-else-if="shown">今天最新：{{ dateTime(shown.createdAt) }} · {{ scopeLabel(shown) }} · {{ shown.newsCount }} 則新聞</template>
            <template v-else>剛完成的分析（沒有存進紀錄）</template>
          </span>
          <button
            type="button"
            class="shrink-0 cursor-pointer border-2 border-amber-200/40 bg-amber-200/10 px-3 py-1 font-pixel text-button text-amber-50 transition hover:bg-amber-200/20"
            @click="reportOpen = true"
          >
            查看報告
          </button>
        </div>

        <!-- 以前的分析放在「我的紀錄」，這裡只留今天最新的一份 -->
        <p class="mt-4 border-t border-white/10 pt-3 text-body text-stone-300">
          <template v-if="!shown && aiStatus === 'idle'">今天還沒有分析。</template>
          以前的分析在
          <router-link
            :to="{ name: 'history', query: { tab: 'news' } }"
            class="text-amber-100 underline underline-offset-2 hover:text-amber-50"
          >我的紀錄 › 財經新聞分析</router-link>。
        </p>

        <p class="mt-3 text-caption text-stone-300">AI 只根據上面的新聞標題與摘要撰寫，族群與個股是依產業關聯推估，僅供參考，不是投資建議。</p>
      </section>

      <!-- ── 新聞列表 ── -->
      <p v-if="!filtered.length" class="border-2 border-white/10 px-4 py-6 text-center text-body text-stone-300">
        {{ news.length ? '這個篩選條件下沒有新聞。' : '目前抓不到新聞，稍後再按更新。' }}
      </p>
      <ul v-else class="space-y-2">
        <li v-for="{ head: item, others } in visible" :key="item.id" class="border-2 border-white/10 bg-white/[0.03] p-3">
          <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-stone-300">
            <span class="border px-1.5" :class="item.region === 'tw' ? 'border-amber-200/30 text-amber-100' : 'border-sky-200/30 text-sky-100'">
              {{ item.region === 'tw' ? '國內' : '國外' }}
            </span>
            <span>{{ item.sourceLabel }}</span>
            <time :datetime="item.publishedAt" :title="dateTime(item.publishedAt)">{{ timeAgo(item.publishedAt) }}</time>
            <!-- 語氣：只標偏多、偏空（中性不標，卡片才不會太雜）；用詞統計，不是預測 -->
            <span
              v-if="item.tone && item.tone !== 'neutral'"
              class="border px-1.5"
              :class="NEWS_TONES[item.tone].class"
              title="依標題與內容的漲跌用詞判斷，不是預測"
            >
              {{ NEWS_TONES[item.tone].label }}
            </span>
            <!-- 最多列 2 檔，其他的顯示「更多（+N）」（不展開，點新聞進彈窗看全部） -->
            <span v-if="item.watched?.length" class="border border-rose-300/40 bg-rose-300/10 px-1.5 text-rose-100" :title="item.watched.join('、')">
              與我追蹤相關：{{ item.watched.slice(0, 2).join('、') }}<span v-if="item.watched.length > 2" class="ml-1 text-rose-200/70">更多（+{{ item.watched.length - 2 }}）</span>
            </span>
          </p>
          <!-- 點標題或摘要開「新聞重點」彈窗（裡面有原文連結） -->
          <button
            type="button"
            class="group mt-1.5 block w-full cursor-pointer text-left"
            :aria-label="`看新聞重點：${item.title}`"
            @click="opened = item"
          >
            <span
              class="block text-subtitle font-medium text-stone-50 underline-offset-2 group-hover:text-amber-100 group-hover:underline"
              :lang="item.lang === 'en' ? 'en' : 'zh-TW'"
            >
              {{ item.title }}
            </span>
            <span v-if="item.summary" class="mt-1 line-clamp-2 block text-body text-stone-300" :lang="item.lang === 'en' ? 'en' : 'zh-TW'">{{ item.summary }}</span>
          </button>
          <p v-if="item.themes.length" class="mt-2 flex flex-wrap gap-1">
            <button
              v-for="key in item.themes"
              :key="key"
              type="button"
              class="cursor-pointer border border-white/10 px-1.5 text-button text-stone-300 hover:bg-white/10 hover:text-stone-200"
              @click="theme = key; limit = PAGE"
            >
              {{ themeLabel(key) }}
            </button>
          </p>
          <!-- 同一件事的其他報導 -->
          <div v-if="others.length" class="mt-2 border-t border-white/10 pt-2 text-caption">
            <button
              type="button"
              class="cursor-pointer text-stone-300 hover:text-stone-200"
              :aria-expanded="expanded.has(item.id)"
              @click="toggleRelated(item.id)"
            >
              {{ expanded.has(item.id) ? '▾' : '▸' }} 另有 {{ others.length }} 則相關報導
            </button>
            <ul v-if="expanded.has(item.id)" class="mt-1.5 space-y-1">
              <li v-for="other in others" :key="other.id" class="flex gap-2 leading-5">
                <span class="shrink-0 text-stone-300">{{ other.sourceLabel }} · {{ timeAgo(other.publishedAt) }}</span>
                <button
                  type="button"
                  class="min-w-0 cursor-pointer text-left text-stone-300 underline-offset-2 hover:text-amber-100 hover:underline"
                  :lang="other.lang === 'en' ? 'en' : 'zh-TW'"
                  @click="opened = other"
                >
                  {{ other.title }}
                </button>
              </li>
            </ul>
          </div>
        </li>
      </ul>
      <div v-if="events.length > visible.length" class="text-center">
        <button
          type="button"
          class="cursor-pointer border-2 border-white/15 px-4 py-1.5 text-button text-stone-300 transition hover:bg-white/10 font-pixel"
          @click="limit += PAGE"
        >
          顯示更多（還有 {{ events.length - visible.length }} 件）
        </button>
      </div>
    </template>

    <FinanceNewsDialog v-if="opened && view" :item="opened" :themes="view.themes" @close="opened = null" @watched="syncWatched" />
    <FinanceNewsReportDialog
      v-if="reportOpen"
      :scope-text="reportMeta.scopeText"
      :created-at="reportMeta.createdAt"
      :news-count="reportMeta.newsCount"
      :news="reportMeta.news"
      :text="displayText"
      :status="aiStatus"
      :error="aiError"
      :save-failed="aiSaveFailed"
      @close="reportOpen = false"
      @stop="stopAi"
    />
  </section>
</template>
