<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { createReading, fetchHealth, fetchSpreads } from './lib/api'
import type { HealthResponse, ReadingResponse, Spread } from './types'

const spreads = ref<Spread[]>([])
const selectedSpreadKey = ref('timeline')
const question = ref('')
const reading = ref<ReadingResponse | null>(null)
const health = ref<HealthResponse | null>(null)
const errorMessage = ref('')
const isLoading = ref(false)
const isBootstrapping = ref(true)

const selectedSpread = computed(
  () => spreads.value.find((spread) => spread.key === selectedSpreadKey.value) || null,
)

const statusLabel = computed(() => {
  if (!health.value) {
    return '正在檢查後端狀態'
  }

  return health.value.database.ready
    ? `MongoDB 已連線，已載入 ${health.value.database.cardCount} 張牌`
    : 'MongoDB 尚未連線，請先完成 seed'
})

function formatOrientation(orientation: 'upright' | 'reversed') {
  return orientation === 'upright' ? '正位' : '逆位'
}

function formatSuit(suit: string | null) {
  if (!suit) {
    return '大阿卡納'
  }

  const map: Record<string, string> = {
    wands: '權杖',
    cups: '聖杯',
    swords: '寶劍',
    pentacles: '星幣',
  }

  return map[suit] || suit
}

async function bootstrap() {
  isBootstrapping.value = true
  errorMessage.value = ''

  try {
    const [healthResponse, spreadResponse] = await Promise.all([fetchHealth(), fetchSpreads()])
    health.value = healthResponse
    spreads.value = spreadResponse

    if (!spreadResponse.some((spread) => spread.key === selectedSpreadKey.value) && spreadResponse[0]) {
      selectedSpreadKey.value = spreadResponse[0].key
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '無法取得初始化資料'
  } finally {
    isBootstrapping.value = false
  }
}

async function handleDraw() {
  errorMessage.value = ''
  isLoading.value = true

  try {
    reading.value = await createReading({
      question: question.value.trim(),
      spreadKey: selectedSpreadKey.value,
    })

    health.value = await fetchHealth()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '抽牌失敗'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  bootstrap()
})
</script>

<template>
  <main class="min-h-screen text-stone-100">
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-5 py-8 md:px-8 xl:px-10">
      <section class="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div class="space-y-5 rounded-[2rem] border border-white/10 bg-white/8 p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur">
          <div class="inline-flex items-center rounded-full border border-amber-200/20 bg-amber-100/10 px-3 py-1 text-xs uppercase tracking-[0.35em] text-amber-100/80">
            Tarot Divination Studio
          </div>
          <div class="space-y-4">
            <p class="text-sm uppercase tracking-[0.4em] text-rose-100/60">Vite + Vue + Tailwind + Node + MongoDB</p>
            <h1 class="max-w-3xl text-4xl font-semibold leading-tight text-stone-50 md:text-6xl">
              以你的塔羅文本資料，直接生成可抽牌的全端占卜專案。
            </h1>
            <p class="max-w-2xl text-base leading-7 text-stone-200/80 md:text-lg">
              前端提供直覺式占卜體驗，後端則用 MongoDB 管理牌義資料，並從你現有的牌卡文字檔進行 seed。
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-3xl border border-white/10 bg-black/15 p-4">
              <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">牌陣數量</p>
              <p class="mt-2 text-3xl font-semibold text-amber-100">{{ spreads.length || '...' }}</p>
            </div>
            <div class="rounded-3xl border border-white/10 bg-black/15 p-4">
              <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">資料庫狀態</p>
              <p class="mt-2 text-lg font-medium text-stone-50">{{ health?.database.ready ? 'Connected' : 'Pending' }}</p>
            </div>
            <div class="rounded-3xl border border-white/10 bg-black/15 p-4">
              <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">已載入牌卡</p>
              <p class="mt-2 text-3xl font-semibold text-amber-100">{{ health?.database.cardCount ?? 0 }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-[2rem] border border-white/10 bg-black/25 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">Service Status</p>
          <p class="mt-3 text-2xl font-semibold text-stone-50">{{ statusLabel }}</p>
          <p class="mt-3 text-sm leading-6 text-stone-200/70">
            {{ health?.database.message || '請先啟動 backend API，再由前端取得健康檢查與牌陣資料。' }}
          </p>
          <button
            class="mt-5 rounded-full border border-amber-200/30 bg-amber-200/10 px-4 py-2 text-sm font-medium text-amber-50 transition hover:bg-amber-200/20"
            type="button"
            @click="bootstrap"
          >
            重新檢查 API
          </button>
        </div>
      </section>

      <section class="flex flex-col md:flex-row flex-1 gap-6 min-h-0 md:h-[680px]">
        <aside class="rounded-[2rem] border border-white/10 bg-slate-950/45 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur w-full md:flex-shrink-0 md:w-[380px]">
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.35em] text-stone-300/60">占卜設定</p>
            <h2 class="text-2xl font-semibold text-stone-50">抽一組目前最需要的訊息</h2>
          </div>

          <form class="mt-6 space-y-5" @submit.prevent="handleDraw">
            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">問題</span>
              <textarea
                v-model="question"
                rows="4"
                class="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-50 outline-none transition placeholder:text-stone-400/60 focus:border-amber-200/40 focus:bg-white/8"
                placeholder="例如：我接下來三個月的工作發展會如何？"
              />
            </label>

            <label class="block space-y-2">
              <span class="text-sm font-medium text-stone-200">牌陣</span>
              <select
                v-model="selectedSpreadKey"
                class="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-50 outline-none transition focus:border-amber-200/40 focus:bg-white/8"
              >
                <option v-for="spread in spreads" :key="spread.key" :value="spread.key">
                  {{ spread.name }} · {{ spread.cardCount }} 張
                </option>
              </select>
            </label>

            <div v-if="selectedSpread" class="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-stone-200/75">
              <p class="font-medium text-stone-50">{{ selectedSpread.name }}</p>
              <p class="mt-2">{{ selectedSpread.description }}</p>
            </div>

            <button
              class="w-full rounded-full bg-gradient-to-r from-amber-300 via-rose-300 to-orange-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              :disabled="isLoading || isBootstrapping || spreads.length === 0"
            >
              {{ isLoading ? '抽牌中...' : '開始占卜' }}
            </button>
          </form>

          <p v-if="errorMessage" class="mt-4 rounded-3xl border border-rose-200/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
            {{ errorMessage }}
          </p>
        </aside>

        <section class="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.35)] backdrop-blur flex-1 min-h-0 overflow-y-auto max-h-[calc(100vh-300px)] md:max-h-full">
          <div v-if="reading" class="space-y-6">
            <div class="flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.35em] text-stone-300/60">Reading Result</p>
                <h2 class="mt-2 text-3xl font-semibold text-stone-50">{{ reading.spread.name }}</h2>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-stone-200/80">
                  {{ reading.question || '未填寫問題，這次抽牌以當下整體能量為主。' }}
                </p>
              </div>
              <div class="rounded-3xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-stone-200/75">
                {{ reading.overview }}
              </div>
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
              <article
                v-for="entry in reading.cards"
                :key="`${entry.position.key}-${entry.card.id}`"
                class="rounded-[1.75rem] border border-white/10 bg-slate-950/45 p-5 transition hover:-translate-y-0.5"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs uppercase tracking-[0.28em] text-stone-400">{{ entry.position.label }}</p>
                    <h3 class="mt-2 text-2xl font-semibold text-stone-50">{{ entry.card.nameZh }}</h3>
                    <p class="mt-1 text-sm text-stone-300/75">{{ entry.card.nameEn || formatSuit(entry.card.suit) }}</p>
                  </div>
                  <span class="rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1 text-xs font-medium text-amber-50">
                    {{ formatOrientation(entry.orientation) }}
                  </span>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  <span
                    v-for="keyword in entry.card.keywords.slice(0, 4)"
                    :key="keyword"
                    class="rounded-full bg-white/8 px-3 py-1 text-xs text-stone-200/70"
                  >
                    {{ keyword }}
                  </span>
                </div>

                <p class="mt-5 text-sm leading-7 text-stone-200/85">
                  {{ entry.interpretation }}
                </p>

                <ul class="mt-4 space-y-2 text-sm text-stone-300/80">
                  <li v-for="highlight in entry.highlights" :key="highlight">{{ highlight }}</li>
                </ul>
              </article>
            </div>

            <div class="rounded-[1.75rem] border border-amber-100/10 bg-gradient-to-r from-amber-100/10 via-white/5 to-rose-100/10 p-5">
              <p class="text-xs uppercase tracking-[0.3em] text-stone-300/60">Guidance</p>
              <p class="mt-3 text-base leading-8 text-stone-100/85">{{ reading.guidance }}</p>
            </div>
          </div>

          <div v-else class="flex h-full min-h-[420px] items-center justify-center rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 p-8 text-center">
            <div class="max-w-xl space-y-4">
              <p class="text-xs uppercase tracking-[0.4em] text-stone-400">Awaiting Reading</p>
              <h2 class="text-3xl font-semibold text-stone-50">先選擇牌陣，再讓系統替你抽出當下最關鍵的牌。</h2>
              <p class="text-sm leading-7 text-stone-300/80">
                這個版本已經串好 API、牌陣與 MongoDB seed 流程。當後端連線完成後，你可以直接從現有塔羅文本資料產生占卜結果。
              </p>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
