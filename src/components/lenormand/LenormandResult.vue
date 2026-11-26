<script setup lang="ts">
// 雷諾曼的結果頁（v27 階段 4，小牌陣）：問題、排列圖、逐張牌面與牌義、組合分析、撲克花色。
// 沒有正逆位。保存紀錄（階段 6）照塔羅結果頁的手感：預設不存，按了才存，存好顯示「已保存」；AI 解讀是階段 7。
// 紀錄頁、日記頁也用這個元件顯示一筆紀錄（hide-flow-actions：不顯示保存、重抽、重新開始）。
// 牌義來自 GET /api/lenormand/cards（api.ts 快取），抽牌回應只有精簡的牌資料（3-12）
import { computed } from 'vue'

import GrandTableau from './GrandTableau.vue'
import LenormandAnalysisPanel from './LenormandAnalysisPanel.vue'
import LenormandNarration from './LenormandNarration.vue'
import LenormandSuitPanel from './LenormandSuitPanel.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import SpreadLayout from '../SpreadLayout.vue'
import { cardImageUrl } from '../../lib/cardStyle'
import { MEANING_BY_DOMAIN, TONE_LABELS, toneClass } from '../../lib/lenormandLabels'
import type { LenormandCard, LenormandPlayingCardGuide, LenormandReadingResponse, NarrationStatus, SaveStatus, SpreadShape } from '../../types'

const props = defineProps<{
  reading: LenormandReadingResponse
  // 排列圖用的完整牌陣定義（位置座標）
  spread: SpreadShape | null
  // 完整牌義（/cards）；還沒載到是空的
  cardsById: Map<number, LenormandCard>
  guide: LenormandPlayingCardGuide | null
  meaningsLoading: boolean
  meaningsError: string
  // 保存紀錄；沒給就不顯示保存按鈕
  saveStatus?: SaveStatus
  saveError?: string
  // 紀錄頁、日記頁：不顯示保存、重抽、重新開始
  hideFlowActions?: boolean
  // AI 解讀（階段 7）：沒給就不顯示 AI 區；readOnly＝只看（日記頁）
  narration?: { status: NarrationStatus; text: string; error: string; saved: boolean | null; isRecord: boolean; readOnly?: boolean }
}>()

const emit = defineEmits<{ restart: []; redraw: []; saveReading: []; requestNarration: []; stopNarration: [] }>()

// 解讀還在寫時按保存：等寫完連同解讀一起存（後端沒有事後補存解讀的 API），按鈕先說明
const narrating = computed(() => props.narration?.status === 'loading' || props.narration?.status === 'streaming')
const saveLabel = computed(() => {
  if (props.saveStatus === 'saving') return narrating.value ? '解讀寫完後保存…' : '保存中…'
  return props.saveStatus === 'saved' ? '已保存' : '保存紀錄'
})

const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' } as const

const analysis = computed(() => props.reading.analysis)
const sections = computed(() => props.reading.text?.sections ?? [])
const suitSection = computed(() => sections.value.find((section) => section.key === 'suits') ?? null)

// 依問題類型多顯示一段牌義（感情、工作、金錢、健康才有）
const domainMeaning = computed(() => {
  const key = analysis.value.domain.key
  return key ? (MEANING_BY_DOMAIN[key] ?? null) : null
})

// 被當成形容詞的牌（modifier 關係的 to）：多顯示「當作形容詞時」那段牌義
const modifierIndexes = computed(
  () => new Set(analysis.value.pairs.items.filter((pair) => pair.kind === 'modifier').map((pair) => pair.to)),
)

const cardNames = computed(() => new Map([...props.cardsById.values()].map((card) => [card.id, card.nameZh])))

const significatorName = computed(() => {
  const id = props.reading.significator
  if (!id) return ''
  return props.cardsById.get(id)?.nameZh ?? (id === 28 ? '紳士' : '淑女')
})

function cardTags(index: number) {
  const entry = props.reading.cards[index]
  if (!entry) return []
  const tags: { key: string; label: string; class: string }[] = []
  // 問題類型的關鍵牌（L8 的主題牌；改叫關鍵牌，避免和主題牌陣的「主題牌」位置混在一起）
  if (analysis.value.domain.themeIndex === index) {
    tags.push({ key: 'theme', label: '關鍵牌', class: 'border-accent-hue/50 bg-selected text-on-selected' })
  }
  if (props.reading.significator && entry.card.id === props.reading.significator) {
    tags.push({ key: 'significator', label: '代表牌', class: 'border-info-hue/40 bg-info-hue/10 text-info' })
  }
  tags.push({ key: 'tone', label: TONE_LABELS[entry.card.tone], class: toneClass(entry.card.tone) })
  return tags
}

function playingCardText(index: number) {
  const playing = props.reading.cards[index]?.card.playingCard
  return playing ? `${SUIT_SYMBOL[playing.suit]}${playing.rank}` : ''
}

function isRedSuit(index: number) {
  const suit = props.reading.cards[index]?.card.playingCard?.suit
  return suit === 'hearts' || suit === 'diamonds'
}
</script>

<template>
  <!-- @container：牌義卡片的欄數照這個元件自己的寬度決定（和塔羅結果頁一樣） -->
  <div class="@container flex min-w-0 flex-col gap-5">
    <div class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-caption text-ink-muted">
            {{ reading.spread.name }}・{{ reading.cards.length }} 張{{ reading.mode === 'manual' ? '・自己挑選的牌' : '' }}
          </p>
          <p v-if="significatorName" class="text-caption text-ink-muted">代表你的牌：{{ significatorName }}</p>
        </div>
        <div v-if="!hideFlowActions" class="flex flex-wrap gap-2">
          <!-- 結果預設不留存，按這個才會存進「雷諾曼紀錄」（和塔羅結果頁一樣） -->
          <button
            v-if="saveStatus"
            class="cursor-pointer border-2 px-3 py-1.5 font-pixel text-button text-accent transition disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-[2px] active:translate-y-[2px]"
            :class="saveStatus === 'saved' ? 'border-accent-hue/40 bg-accent-hue/15' : 'border-accent-hue/30 bg-accent-hue/10 hover:bg-accent-hue/20'"
            type="button"
            :disabled="saveStatus === 'saving' || saveStatus === 'saved'"
            @click="emit('saveReading')"
          >
            {{ saveLabel }}
          </button>
          <button
            class="cursor-pointer border-2 border-tint/15 px-3 py-1.5 font-pixel text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
            type="button"
            @click="emit('redraw')"
          >
            重抽
          </button>
          <button
            class="cursor-pointer border-2 border-tint/15 px-3 py-1.5 font-pixel text-button text-ink-soft transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px]"
            type="button"
            @click="emit('restart')"
          >
            重新開始
          </button>
        </div>
      </div>
      <!-- 問題是整頁的主詞，給足字級 -->
      <p class="text-subtitle font-medium text-accent">
        {{ reading.question || '未填寫問題，這次以當下整體的狀況為主。' }}
      </p>
      <!-- 大藍圖的 overview 是 36 個位置一字排開，和下面的格子重複又佔版面，不顯示 -->
      <p v-if="reading.overview && !analysis.tableau" class="text-body text-ink-soft">{{ reading.overview }}</p>
      <p v-if="saveError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-4 py-3 text-body text-danger">{{ saveError }}</p>
      <p v-else-if="saveStatus === 'saved'" class="text-body text-ink-muted">
        已經存進「雷諾曼紀錄」，之後可以從會員選單回去重看這次的牌與分析。
      </p>
    </div>

    <!-- 大藍圖（36 張）：用 GrandTableau 畫 9×4 並看距離、騎士跳、鏡射；逐張牌義改成點一格再看，不一次列 36 張 -->
    <div v-if="analysis.tableau" class="border-2 border-tint/10 bg-sink/45 p-3 sm:p-5">
      <GrandTableau
        :cards="reading.cards"
        :tableau="analysis.tableau"
        :cards-by-id="cardsById"
        :domain-label="analysis.domain.label"
        :sections="sections"
      />
    </div>
    <div v-else-if="spread" class="border-2 border-tint/10 bg-sink/45 p-3 sm:p-5">
      <SpreadLayout :spread="spread" :cards="reading.cards" />
    </div>

    <!-- 逐張牌面與牌義：牌義從 /cards 來，還沒載到時放骨架 -->
    <div v-if="!analysis.tableau" class="grid min-w-0 gap-4 @3xl:grid-cols-2">
      <article
        v-for="(entry, index) in reading.cards"
        :key="`${entry.position.key}-${entry.card.id}`"
        class="flex min-w-0 flex-col border-2 bg-sink/45 p-4 sm:p-5"
        :class="analysis.domain.themeIndex === index ? 'border-accent-hue/40' : 'border-tint/10'"
      >
        <div class="flex min-w-0 items-start gap-3">
          <img
            v-if="cardImageUrl(entry.card.image)"
            :src="cardImageUrl(entry.card.image)"
            width="350"
            height="600"
            loading="lazy"
            decoding="async"
            :alt="entry.card.nameZh"
            class="h-24 w-14 shrink-0 object-cover shadow-lg"
          />
          <div class="min-w-0 flex-1">
            <p class="text-caption text-ink-muted">{{ entry.position.label }}</p>
            <h3 class="mt-1 break-words font-pixel text-title text-ink">{{ entry.card.id }} {{ entry.card.nameZh }}</h3>
            <p class="text-caption text-ink-muted">
              {{ entry.card.nameEn }}
              <span v-if="playingCardText(index)" :class="isRedSuit(index) ? 'text-danger' : 'text-ink'">　{{ playingCardText(index) }}</span>
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span v-for="tag in cardTags(index)" :key="tag.key" class="border-2 px-2 py-0.5 text-caption font-medium" :class="tag.class">
              {{ tag.label }}
            </span>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-1.5">
          <span v-for="keyword in entry.card.keywords" :key="keyword" class="bg-tint/8 px-2 py-0.5 text-caption text-ink-soft">{{ keyword }}</span>
        </div>

        <div class="mt-3 space-y-2">
          <template v-if="cardsById.get(entry.card.id)">
            <div>
              <p class="text-caption font-medium text-accent">核心</p>
              <p class="text-body text-ink-soft">{{ cardsById.get(entry.card.id)!.meaning.core }}</p>
            </div>
            <div v-if="domainMeaning">
              <p class="text-caption font-medium text-accent">{{ domainMeaning.label }}</p>
              <p class="text-body text-ink-soft">{{ cardsById.get(entry.card.id)!.meaning[domainMeaning.key] }}</p>
            </div>
            <div v-if="modifierIndexes.has(index)">
              <p class="text-caption font-medium text-accent">當作形容詞時</p>
              <p class="text-body text-ink-soft">{{ cardsById.get(entry.card.id)!.meaning.modifier }}</p>
            </div>
          </template>
          <p v-else-if="meaningsError" class="text-body text-danger">{{ meaningsError }}</p>
          <template v-else-if="meaningsLoading">
            <SkeletonBlock class="h-3.5 w-12 rounded-none" />
            <SkeletonBlock class="h-4 w-full rounded-none" />
            <SkeletonBlock class="h-4 w-4/5 rounded-none" />
          </template>
        </div>
      </article>
    </div>

    <!-- AI 解讀：放在牌義（或大藍圖）之後、組合分析之前，和塔羅結果頁同一個順序 -->
    <LenormandNarration
      v-if="narration"
      :status="narration.status"
      :text="narration.text"
      :error="narration.error"
      :saved="narration.saved"
      :is-record="narration.isRecord"
      :read-only="narration.readOnly"
      @request="emit('requestNarration')"
      @stop="emit('stopNarration')"
    />

    <LenormandAnalysisPanel :analysis="analysis" :sections="sections" :cards="reading.cards" :card-names="cardNames" />

    <LenormandSuitPanel
      :suits="analysis.suits"
      :section="suitSection"
      :guide="guide"
      :guide-error="meaningsError"
    />

    <p v-if="reading.guidance" class="border-2 border-tint/10 bg-tint/5 px-4 py-3 text-body text-ink-soft">{{ reading.guidance }}</p>
  </div>
</template>
