<script setup lang="ts">
// 撲克花色（v27 3-11）：獨立一區。上面是這次抽到的花色分布（L9 的結構化結果）與後端的花色段落，
// 下面是後端提供的解說表（四種花色、紅黑、人頭牌與 A）。解說表每次都一樣，做成可以收合、記住開關。
// 文字全部來自後端（text.sections 的 suits、GET /cards 的 playingCardGuide），前端不自己寫
import { computed } from 'vue'

import SkeletonBlock from '../SkeletonBlock.vue'
import { useStoredToggle } from '../../lib/useStoredToggle'
import type { LenormandAnalysis, LenormandPlayingCardGuide, LenormandSuit, LenormandTextSection } from '../../types'

const props = defineProps<{
  suits: LenormandAnalysis['suits']
  section: LenormandTextSection | null
  // 解說表在 /cards 裡，還沒載到或載入失敗時是 null
  guide: LenormandPlayingCardGuide | null
  guideError: string
}>()

const guideOpen = useStoredToggle('lenormand-suit-guide', true)

const SUIT_ORDER: LenormandSuit[] = ['hearts', 'diamonds', 'clubs', 'spades']

// 花色的符號與名稱用解說表的（後端給）；解說表還沒載到時先用符號
const FALLBACK_SYMBOL: Record<LenormandSuit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }
const suitInfo = computed(() =>
  SUIT_ORDER.map((suit) => {
    const info = props.guide?.suits.find((item) => item.suit === suit)
    return {
      suit,
      symbol: info?.symbol ?? FALLBACK_SYMBOL[suit],
      name: info?.name ?? '',
      red: suit === 'hearts' || suit === 'diamonds',
      count: props.suits.counts[suit] ?? 0,
      dominant: props.suits.dominant.includes(suit),
    }
  }),
)
</script>

<template>
  <section class="space-y-4 border-2 border-tint/10 bg-sink/45 p-4 sm:p-5">
    <h2 class="font-pixel text-title text-ink">撲克花色</h2>

    <!-- 這次的花色分布：四格固定，0 張也顯示，手機兩欄 -->
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div
        v-for="item in suitInfo"
        :key="item.suit"
        class="flex items-center gap-3 border-2 px-3 py-2"
        :class="item.dominant ? 'border-accent-hue/50 bg-accent-hue/10' : 'border-tint/10 bg-tint/5'"
      >
        <span class="text-title leading-none" :class="item.red ? 'text-danger' : 'text-ink'" aria-hidden="true">{{ item.symbol }}</span>
        <span class="min-w-0">
          <span class="block text-caption text-ink-muted">{{ item.name || item.suit }}</span>
          <span class="block text-subtitle tabular-nums text-ink">{{ item.count }} 張</span>
        </span>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 text-caption">
      <span class="border-2 border-tint/15 bg-tint/5 px-2 py-0.5 tabular-nums text-ink-soft">紅色 {{ suits.colors.red }}</span>
      <span class="border-2 border-tint/15 bg-tint/5 px-2 py-0.5 tabular-nums text-ink-soft">黑色 {{ suits.colors.black }}</span>
      <span v-if="suits.skipped" class="border-2 border-tint/15 bg-tint/5 px-2 py-0.5 tabular-nums text-ink-muted">
        沒有撲克對應 {{ suits.skipped }}
      </span>
    </div>

    <!-- 後端的花色段落（L9）：主導花色、紅黑、人頭牌與 A 是哪幾張都在這裡，上面不再重複列 -->
    <ul v-if="section?.lines.length" class="space-y-1.5 text-body text-ink-soft">
      <li v-for="(line, index) in section.lines" :key="index" class="flex gap-2">
        <span class="shrink-0 text-ink-muted" aria-hidden="true">・</span>
        <span class="min-w-0">{{ line }}</span>
      </li>
    </ul>

    <!-- 解說表：可以收合，收起來時標題列仍在 -->
    <div class="border-t-2 border-tint/10 pt-3">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 text-left text-subtitle font-medium text-accent active:translate-x-[2px] active:translate-y-[2px]"
        :aria-expanded="guideOpen"
        @click="guideOpen = !guideOpen"
      >
        <span class="inline-block transition-transform motion-reduce:transition-none" :class="guideOpen ? 'rotate-90' : ''" aria-hidden="true">▸</span>
        {{ guide?.title ?? '撲克花色代表什麼' }}
      </button>

      <div v-if="guideOpen" class="mt-3 space-y-4">
        <p v-if="guideError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-body text-danger">{{ guideError }}</p>
        <template v-else-if="guide">
          <p class="text-caption text-ink-muted">{{ guide.disclaimer }}</p>

          <div class="grid gap-3 md:grid-cols-2">
            <div v-for="item in guide.suits" :key="item.suit" class="space-y-1 border-2 border-tint/10 bg-tint/5 p-3">
              <p class="text-body font-medium text-ink">
                <span :class="item.color === 'red' ? 'text-danger' : 'text-ink'" aria-hidden="true">{{ item.symbol }}</span>
                {{ item.name }}：{{ item.summary }}
              </p>
              <p class="text-body text-ink-soft">{{ item.meaning }}</p>
              <ul v-if="item.readings?.length" class="space-y-1 pt-1 text-body text-ink-soft">
                <li v-for="reading in item.readings" :key="reading.label">
                  <span class="text-accent">{{ reading.label }}</span>　{{ reading.text }}
                </li>
              </ul>
            </div>
          </div>

          <div class="space-y-1">
            <p v-for="item in guide.colors" :key="item.color" class="text-body text-ink-soft">
              <span class="font-medium text-ink">{{ item.name }}</span>　{{ item.meaning }}
            </p>
            <p class="text-caption text-ink-muted">{{ guide.colorNote }}</p>
          </div>

          <div class="space-y-1">
            <p v-for="item in guide.ranks" :key="item.rank" class="text-body text-ink-soft">
              <span class="font-medium text-ink">{{ item.name }}</span>　{{ item.meaning }}
            </p>
            <p class="text-caption text-ink-muted">{{ guide.rankNote }}</p>
          </div>
        </template>
        <!-- 解說表和牌義一起從 /cards 載入；還沒到時放同樣形狀的骨架 -->
        <div v-else class="grid gap-3 md:grid-cols-2" aria-hidden="true">
          <div v-for="n in 4" :key="n" class="space-y-2 border-2 border-tint/10 bg-tint/5 p-3">
            <SkeletonBlock class="h-4 w-32 rounded-none" />
            <SkeletonBlock class="h-3 w-full rounded-none" />
            <SkeletonBlock class="h-3 w-2/3 rounded-none" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
