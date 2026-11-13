<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import FollowUpAnswer from './FollowUpAnswer.vue'
import FollowUpFanDraw from './FollowUpFanDraw.vue'
import SkeletonBlock from './SkeletonBlock.vue'
import { splitFollowUpAnswer } from '../lib/aiMarkdown'
import { canUseAi, isLoggedIn } from '../lib/auth'
import { cardImageUrl } from '../lib/cardStyle'
import type { FollowUpController } from '../lib/useFollowUps'
import { FOLLOW_UP_MAX_CARDS, FOLLOW_UP_MAX_ROUNDS, FOLLOW_UP_QUESTION_MAX, type ManualCardPick } from '../types'

// 抽牌追問（v23，2026-11-13 使用者要求）：放在牌陣下面。
// 由上到下：已經抽出的補充牌與各自的 AI 回答（每次追問一組）→ 專屬的 AI 追問按鈕 → 下一次追問的輸入與抽牌。
// AI 的回答是一篇，依「## 追問 N」切開放在各自的追問底下；「綜合來看」放進最後一個有回答的追問裡
// （再追問、重新回答時結論會變，跟著移到最新那一次）
// （2026-11-13 使用者要求；原本整篇接在 AI 解讀下面，要上下來回對照）。
const props = defineProps<{ followUp: FollowUpController }>()
// 未登入時按 AI 追問：交給外層帶去登入頁（先存好目前的結果）
const emit = defineEmits<{ requestLogin: [] }>()

const question = ref('')
const count = ref(1)
const COUNTS = Array.from({ length: FOLLOW_UP_MAX_CARDS }, (_, index) => index + 1)

const roundsLeft = computed(() => FOLLOW_UP_MAX_ROUNDS - props.followUp.rounds.length)
const canDraw = computed(() => question.value.trim().length > 0 && !props.followUp.drawing)

// 抽牌方式：自己抽（扇形牌堆，同手動抽牌，預設）或自動抽（2026-11-13 使用者要求能自己抽）
type DrawWay = 'fan' | 'auto'
const DRAW_WAYS: { key: DrawWay; label: string }[] = [
  { key: 'fan', label: '自己抽牌' },
  { key: 'auto', label: '自動抽牌' },
]
const drawWay = ref<DrawWay>('fan')
// 自己抽：按「開始抽牌」才展開牌堆（牌堆很高，不要一進頁面就擋住下面的內容）
const fanOpen = ref(false)

async function draw(picks?: ManualCardPick[]) {
  if (!canDraw.value) return
  const ok = await props.followUp.draw(question.value.trim(), picks?.length ?? count.value, picks)
  // 抽成功才清掉輸入、收起牌堆；失敗時留著，使用者不用重來
  if (ok) {
    question.value = ''
    fanOpen.value = false
  }
}

function startDraw() {
  if (!canDraw.value) return
  if (drawWay.value === 'fan') {
    fanOpen.value = true
  } else {
    void draw()
  }
}

// 換抽牌方式或抽滿了：收起牌堆
watch(drawWay, () => (fanOpen.value = false))

// 點補充牌看牌義，一次只開一張；換一組牌時收起來
const openCard = ref<string | null>(null)
const cardKey = (roundIndex: number, cardIndex: number) => `${roundIndex}-${cardIndex}`
function toggleCard(key: string) {
  openCard.value = openCard.value === key ? null : key
}
watch(
  () => props.followUp.rounds.length,
  (length, previous) => {
    if (length < previous) openCard.value = null
  },
)

const isAnswering = computed(
  () => props.followUp.narrationStatus === 'loading' || props.followUp.narrationStatus === 'streaming',
)
// 延伸回答寫完之後又追問：按鈕與說明要講清楚現在的回答還沒包含新的追問
const hasNewRounds = computed(
  () => props.followUp.narrationStatus === 'done' && props.followUp.answeredRounds < props.followUp.rounds.length,
)
const AI_LABELS = { first: '請 AI 回答追問', again: '重新回答', withNew: '請 AI 回答新的追問' } as const
const aiLabelKey = computed<keyof typeof AI_LABELS>(() => {
  if (hasNewRounds.value) return 'withNew'
  return props.followUp.narrationText ? 'again' : 'first'
})

const answer = computed(() => splitFollowUpAnswer(props.followUp.narrationText))
// 綜合來看放在哪一次追問裡：最後一個有回答的。AI 沒照標題寫（一節都切不出來）時是 -1，改放在所有追問的最後
const summaryIndex = computed(() => {
  const rounds = answer.value.rounds
  for (let index = rounds.length - 1; index >= 0; index -= 1) {
    if (rounds[index]) return index
  }
  return -1
})
// 寫完之後又追問的那幾次還沒有回答
const isUnanswered = (roundIndex: number) =>
  props.followUp.narrationStatus === 'done' && roundIndex >= props.followUp.answeredRounds

const orientationLabel = (orientation: 'upright' | 'reversed') => (orientation === 'upright' ? '正位' : '逆位')
</script>

<template>
  <section class="min-w-0 border-2 border-tint/10 bg-sink/45 p-3 sm:p-5">
    <p class="text-[10px] uppercase tracking-[0.2em] text-ink-muted sm:text-xs sm:tracking-[0.3em]">Follow-up</p>
    <h3 class="mt-2 text-subtitle font-semibold text-ink">追問與補充牌</h3>
    <p class="mt-1 text-caption text-ink-muted">
      還想知道更多？針對同一件事再問、再抽 1～{{ FOLLOW_UP_MAX_CARDS }} 張補充牌，最多 {{ FOLLOW_UP_MAX_ROUNDS }} 次。補充牌和上面的牌來自同一副，不會重複。
    </p>

    <!-- 已經抽出的補充牌：每次追問一組 -->
    <ol v-if="followUp.rounds.length > 0" class="mt-4 space-y-4">
      <li
        v-for="(round, roundIndex) in followUp.rounds"
        :key="roundIndex"
        class="min-w-0 border-2 border-tint/10 bg-tint/5 p-3 sm:p-4"
      >
        <p class="text-caption text-ink-muted">追問 {{ roundIndex + 1 }}</p>
        <p class="mt-1 break-words text-body font-medium text-accent">{{ round.question }}</p>

        <div class="mt-3 flex flex-wrap gap-3">
          <button
            v-for="(entry, cardIndex) in round.cards"
            :key="entry.card.id"
            type="button"
            class="flex w-[7.5em] cursor-pointer flex-col items-center gap-2 border-2 p-2 text-center transition hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
            :class="
              openCard === cardKey(roundIndex, cardIndex) ? 'border-ink-soft/60 bg-tint/10' : 'border-tint/10 bg-sink/30'
            "
            :aria-expanded="openCard === cardKey(roundIndex, cardIndex)"
            :aria-label="`${entry.card.nameZh}${orientationLabel(entry.orientation)}，看牌義`"
            @click="toggleCard(cardKey(roundIndex, cardIndex))"
          >
            <img
              v-if="cardImageUrl(entry.card.image)"
              :src="cardImageUrl(entry.card.image)"
              :alt="entry.card.nameZh"
              class="h-24 w-14 object-cover shadow-lg"
              :class="{ 'rotate-180': entry.orientation === 'reversed' }"
            />
            <span class="block w-full truncate text-body text-ink" :title="entry.card.nameZh">{{ entry.card.nameZh }}</span>
            <span class="border-2 border-accent-hue/20 bg-accent-hue/10 px-2 py-0.5 text-caption text-accent">
              {{ orientationLabel(entry.orientation) }}
            </span>
          </button>
        </div>

        <!-- 點了哪一張就在這組下面顯示它的牌義 -->
        <template v-for="(entry, cardIndex) in round.cards" :key="`meaning-${entry.card.id}`">
          <div
            v-if="openCard === cardKey(roundIndex, cardIndex)"
            class="mt-3 max-h-[18rem] min-w-0 overflow-y-auto border-2 border-tint/10 bg-sink/30 p-3"
          >
            <p class="text-body font-medium text-ink">{{ entry.card.nameZh }}・{{ orientationLabel(entry.orientation) }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="keyword in entry.card.keywords.slice(0, 4)"
                :key="keyword"
                class="bg-tint/8 px-2 py-0.5 text-caption text-ink-soft"
              >
                {{ keyword }}
              </span>
            </div>
            <div v-if="entry.meaning?.length" class="mt-3 space-y-3">
              <div v-for="group in entry.meaning" :key="group.heading">
                <p class="text-caption font-medium text-accent">{{ group.heading }}</p>
                <ul class="mt-1 space-y-1 text-body text-ink-soft">
                  <li v-for="line in group.lines" :key="line">{{ line }}</li>
                </ul>
              </div>
            </div>
            <ul v-else class="mt-3 space-y-1 text-body text-ink-soft">
              <li v-for="line in entry.highlights" :key="line">{{ line }}</li>
            </ul>
          </div>
        </template>

        <!-- 這次追問的 AI 回答 -->
        <FollowUpAnswer
          v-if="answer.rounds[roundIndex]"
          class="mt-3"
          title="AI 回答"
          :text="answer.rounds[roundIndex]!"
          :summary="roundIndex === summaryIndex ? answer.summary : ''"
        />
        <div v-else-if="isAnswering" class="mt-3 space-y-2.5" aria-hidden="true">
          <SkeletonBlock class="h-3 w-full" />
          <SkeletonBlock class="h-3 w-11/12" />
          <SkeletonBlock class="h-3 w-3/5" />
        </div>
        <p v-else-if="isUnanswered(roundIndex)" class="mt-3 text-caption text-ink-muted">
          這次追問還沒有 AI 回答，到下面按「請 AI 回答新的追問」。
        </p>
      </li>
    </ol>

    <!-- AI 沒照「## 追問 N」寫、切不出各次的回答時，整篇放在所有追問的最後，不會不見 -->
    <FollowUpAnswer v-if="answer.summary && summaryIndex < 0" class="mt-4" title="AI 回答" text="" :summary="answer.summary" />

    <!-- 專屬的 AI 追問按鈕：有補充牌才出現。放在所有追問與綜合來看的正下方，
         看完回答就能按「重新回答」，不用越過下一次追問的輸入區（2026-11-13 使用者要求） -->
    <div v-if="followUp.rounds.length > 0" class="mt-4 flex flex-wrap items-center gap-3 border-t border-tint/10 pt-4">
      <template v-if="isAnswering">
        <span class="text-caption text-ink-muted" aria-live="polite">
          {{ followUp.narrationStatus === 'loading' ? '正在整理追問的回答…' : 'AI 正在撰寫，回答會出現在每個追問底下…' }}
        </span>
        <button
          type="button"
          class="h-8 cursor-pointer border-2 border-tint/15 bg-tint/5 px-4 text-button text-ink transition hover:bg-tint/10 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
          @click="followUp.stop()"
        >
          停止
        </button>
      </template>
      <template v-else-if="canUseAi">
        <button
          type="button"
          class="grid h-9 cursor-pointer items-center border-2 border-accent-hue/40 bg-accent-hue/15 px-5 text-button font-medium text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
          @click="followUp.ask()"
        >
          <span
            v-for="(label, key) in AI_LABELS"
            :key="key"
            class="[grid-area:1/1] text-center"
            :class="aiLabelKey === key ? '' : 'invisible'"
            :aria-hidden="aiLabelKey !== key"
          >
            {{ label }}
          </span>
        </button>
        <span class="min-w-0 flex-1 basis-[14em] text-caption text-ink-muted">
          <template v-if="followUp.narrationStatus === 'error'">{{ followUp.narrationError }}</template>
          <template v-else-if="followUp.narrationStatus === 'stopped'">已停止，以上是目前寫出的部分。</template>
          <template v-else-if="hasNewRounds">最新的追問還沒有回答；之前的回答會保留，只寫新的與綜合來看。</template>
          <template v-else-if="followUp.synced === true">回答已存進這筆紀錄。</template>
          <template v-else-if="followUp.synced === false">這次的回答沒有存進紀錄，可以再回答一次。</template>
          <template v-else-if="followUp.narrationStatus === 'done'">不滿意可以重新回答，只會重寫最後一次追問與綜合來看。</template>
          <template v-else>AI 會把原本的牌陣和所有補充牌放在一起看，回答放在每個追問底下。</template>
        </span>
      </template>
      <template v-else-if="!isLoggedIn">
        <button
          type="button"
          class="h-9 cursor-pointer border-2 border-accent-hue/40 bg-accent-hue/15 px-5 text-button font-medium text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px] font-pixel"
          @click="emit('requestLogin')"
        >
          請 AI 回答追問（需登入）
        </button>
        <span class="min-w-0 flex-1 basis-[14em] text-caption text-ink-muted">補充牌的牌義不用登入就能看；AI 回答會產生費用，登入後才能用。</span>
      </template>
      <span v-else class="text-caption text-ink-muted">AI 解讀尚未開通，無法請 AI 回答追問；補充牌的牌義可以照常看。</span>
    </div>

    <!-- 追問的輸入與抽牌：有追問時和上面的回答、按鈕用分隔線隔開 -->
    <div v-if="roundsLeft > 0" class="mt-4 space-y-3" :class="{ 'border-t border-tint/10 pt-4': followUp.rounds.length > 0 }">
      <label class="block">
        <span class="text-caption text-ink-soft">
          想追問什麼？（還可以追問 {{ roundsLeft }} 次）
        </span>
        <textarea
          v-model="question"
          rows="2"
          :maxlength="FOLLOW_UP_QUESTION_MAX"
          :disabled="followUp.drawing"
          placeholder="例如：接下來三個月要注意什麼？有什麼是我還沒看到的？"
          class="mt-1 block w-full resize-y border-2 border-tint/15 bg-sink/40 px-3 py-2 text-body text-ink placeholder:text-ink-muted focus:border-accent-hue/50 focus:outline-none disabled:opacity-60"
        />
      </label>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div class="flex items-center gap-2">
          <span class="whitespace-nowrap text-caption text-ink-soft">抽幾張</span>
          <div class="flex gap-1" role="group" aria-label="補充牌張數">
            <button
              v-for="option in COUNTS"
              :key="option"
              type="button"
              class="h-8 w-9 cursor-pointer border-2 text-button transition active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 font-pixel"
              :class="
                count === option
                  ? 'border-ink-soft/60 bg-tint/10 text-ink'
                  : 'border-tint/15 text-ink-muted hover:bg-tint/10'
              "
              :aria-pressed="count === option"
              :disabled="followUp.drawing"
              @click="count = option"
            >
              {{ option }}
            </button>
          </div>
        </div>

        <!-- 抽牌方式：單選，選中用中性色（同頁的篩選類按鈕，見 ui-check 第 0 節） -->
        <div class="flex gap-1" role="group" aria-label="抽牌方式">
          <button
            v-for="way in DRAW_WAYS"
            :key="way.key"
            type="button"
            class="h-8 cursor-pointer whitespace-nowrap border-2 px-3 text-button transition active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 font-pixel"
            :class="drawWay === way.key ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:bg-tint/10'"
            :aria-pressed="drawWay === way.key"
            :disabled="followUp.drawing"
            @click="drawWay = way.key"
          >
            {{ way.label }}
          </button>
        </div>

        <!-- 兩種字疊在同一格，抽牌中按鈕不變寬；自己抽時牌堆展開後就不顯示這顆 -->
        <button
          v-if="!fanOpen"
          type="button"
          class="grid h-8 cursor-pointer items-center border-2 border-accent-hue/40 bg-accent-hue/15 px-4 text-button font-medium text-accent transition hover:bg-accent-hue/25 active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-60 font-pixel"
          :disabled="!canDraw"
          @click="startDraw"
        >
          <span class="[grid-area:1/1]" :class="followUp.drawing ? 'invisible' : ''" :aria-hidden="followUp.drawing">
            {{ drawWay === 'fan' ? '開始抽牌' : '抽補充牌' }}
          </span>
          <span class="[grid-area:1/1]" :class="followUp.drawing ? '' : 'invisible'" :aria-hidden="!followUp.drawing">抽牌中…</span>
        </button>
        <span v-if="!question.trim() && !followUp.drawing" class="text-caption text-ink-muted">先寫下追問的內容才能抽牌。</span>
      </div>

      <!-- 自己抽：扇形牌堆（洗牌 → 切牌 → 點牌），桌上已有的牌不會出現 -->
      <FollowUpFanDraw
        v-if="fanOpen"
        :count="count"
        :exclude-ids="followUp.usedCardIds"
        :busy="followUp.drawing"
        @submit="draw"
        @cancel="fanOpen = false"
      />

      <p v-if="followUp.drawError" class="border-2 border-danger-hue/20 bg-danger-hue/10 px-3 py-2 text-caption text-danger">
        {{ followUp.drawError }}
      </p>
    </div>
    <p v-else class="mt-4 border-t border-tint/10 pt-4 text-caption text-ink-muted">已經追問 {{ FOLLOW_UP_MAX_ROUNDS }} 次，這次占卜的追問用完了。</p>

  </section>
</template>
