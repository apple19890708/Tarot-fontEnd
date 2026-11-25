<script setup lang="ts">
// 雷諾曼大藍圖（v27 階段 5，計畫書 3-4、3-9、3-12）：9×4 的格子，一格一個宮位。
// - 每格寫宮位（例如「24 愛情」）與落在這格的牌；中心（代表牌）加框、關鍵牌（L8 主題牌）另外標記，
//   沒出現時在它們的宮位那一格標「未出現」
// - 看法切換（單選篩選）：距離（離中心近、中、遠的深淺）、騎士跳（L 形落點）、鏡射（左右、上下、對角）
// - 點一格：下面顯示這張牌在第幾宮、離中心多遠、在中心的哪個方位、牌義與宮位主題
// 分組、落點、鏡射位置全部由後端算好（analysis.tableau），這裡只負責畫與標示，不重算規則；
// 牌義與宮位主題各自顯示，不在前端組句子。
// 手機（9 欄放不下牌名）：整張縮小到一個畫面寬，格子只留宮位號碼與牌面，點一格在下面看詳細，
// 這樣能一眼看到整張牌的分布（距離、騎士跳、鏡射都要看整體位置）；寬一點的螢幕才在格子裡寫牌名
import { computed, ref, watch } from 'vue'

import { cardImageUrl } from '../../lib/cardStyle'
import { DIRECTION_LABELS, DISTANCE_LABELS, MIRROR_LABELS } from '../../lib/lenormandLabels'
import type { LenormandCard, LenormandDirection, LenormandDistance, LenormandReadingCard, LenormandTableau, LenormandTextSection } from '../../types'

const props = defineProps<{
  cards: LenormandReadingCard[]
  tableau: LenormandTableau
  // 完整牌義（/cards）；還沒載到是空的
  cardsById: Map<number, LenormandCard>
  // 問題類型的名稱（例如「感情」），用在「感情的關鍵牌」
  domainLabel: string | null
  // 後端 formatter 的段落；大藍圖的幾段（中心與距離、宮位、主題牌、騎士跳、鏡射）跟著看法顯示在這裡
  sections: LenormandTextSection[]
}>()

// 各看法對應的後端段落（3-12 text.sections 的 key）；組合分析面板就不再重複這幾段
const SECTION_KEYS: Record<ViewMode, string[]> = {
  distance: ['center', 'houses', 'themeCard'],
  knight: ['knighting'],
  mirror: ['mirrors'],
}
const modeSections = computed(() => props.sections.filter((section) => SECTION_KEYS[mode.value].includes(section.key)))

type ViewMode = 'distance' | 'knight' | 'mirror'
const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'distance', label: '距離' },
  { value: 'knight', label: '騎士跳' },
  { value: 'mirror', label: '鏡射' },
]
const mode = ref<ViewMode>('distance')

// 預設選中心那一格
const selected = ref(props.tableau.center.index)
watch(
  () => props.tableau,
  (tableau) => {
    selected.value = tableau.center.index
  },
)

const COLS = 9

function nameOf(index: number) {
  const entry = props.cards[index]
  return entry ? `${entry.card.id} ${entry.card.nameZh}` : ''
}

// 每一格屬於哪個距離分組
const distanceOf = computed(() => {
  const map = new Map<number, LenormandDistance>()
  for (const key of ['near', 'middle', 'far'] as const) {
    for (const index of props.tableau.distances[key]) map.set(index, key)
  }
  return map
})

// 每一格在中心的哪些方位（同一列左右、同一欄上下）
const directionsOf = computed(() => {
  const map = new Map<number, LenormandDirection[]>()
  for (const key of ['past', 'future', 'conscious', 'subconscious'] as const) {
    for (const index of props.tableau.directions[key]) map.set(index, [...(map.get(index) ?? []), key])
  }
  return map
})

const ownHouse = computed(() => new Set(props.tableau.houses.own.map((item) => item.index)))
const centerIndex = computed(() => props.tableau.center.index)
const themeIndex = computed(() => props.tableau.themeCard?.index ?? null)

// 騎士跳：落點屬於中心還是關鍵牌（兩邊都跳得到時兩個都標）
const knightTargets = computed(() => {
  const map = new Map<number, ('center' | 'theme')[]>()
  for (const jump of props.tableau.knighting) {
    for (const index of jump.targets) map.set(index, [...(map.get(index) ?? []), jump.from])
  }
  return map
})

// 鏡射：每一格是誰的哪一種鏡射
const mirrorMarks = computed(() => {
  const map = new Map<number, { from: 'center' | 'theme'; axis: keyof typeof MIRROR_LABELS }[]>()
  for (const mirror of props.tableau.mirrors) {
    for (const axis of ['leftRight', 'topBottom', 'diagonal'] as const) {
      const index = mirror[axis]
      if (index === null) continue
      map.set(index, [...(map.get(index) ?? []), { from: mirror.from, axis }])
    }
  }
  return map
})

// 「感情的關鍵牌」；沒有問題類型時只寫「關鍵牌」
const keyCardName = computed(() => (props.domainLabel ? `${props.domainLabel}的關鍵牌` : '關鍵牌'))

// 騎士跳、鏡射的起點怎麼稱呼，和後端文字一致（2026-11-25 後端調整）：
// 代表牌沒出現時叫「中心（第 29 宮）」、關鍵牌沒出現時叫「關鍵牌的宮位（第 24 宮）」，不把那一格的牌叫成代表牌或關鍵牌
const FROM_LABEL = computed(() => ({
  center: props.tableau.center.present ? '代表牌' : `中心（第 ${props.tableau.center.house} 宮）`,
  theme: props.tableau.themeCard?.present ? keyCardName.value : `關鍵牌的宮位（第 ${props.tableau.themeCard?.house ?? ''} 宮）`,
}))

// 這個看法有沒有從關鍵牌出發的那一筆：代表牌沒出現、關鍵牌又剛好落在中心那一格時，後端只給 from: 'center' 一筆
const hasThemeEntry = computed(() =>
  mode.value === 'knight'
    ? props.tableau.knighting.some((jump) => jump.from === 'theme')
    : props.tableau.mirrors.some((mirror) => mirror.from === 'theme'),
)

// 格子的底色：距離模式依近中遠深淺；騎士跳、鏡射模式只標落點（中心那邊用金、關鍵牌那邊用藍）。
// 深色底上 /30 和 /12 幾乎分不出來（2026-11-25 截圖確認），拉開成 /55、/22
const NEAR = 'bg-accent-hue/55'
const MIDDLE = 'bg-accent-hue/22'
const FAR = 'bg-sink/40'
const THEME = 'bg-info-hue/45'
function cellTone(index: number) {
  if (mode.value === 'distance') {
    const group = distanceOf.value.get(index)
    if (group === 'near') return NEAR
    if (group === 'middle') return MIDDLE
    return FAR
  }
  if (mode.value === 'knight') {
    const from = knightTargets.value.get(index)
    if (!from) return FAR
    return from.includes('center') ? NEAR : THEME
  }
  const marks = mirrorMarks.value.get(index)
  if (!marks) return FAR
  return marks.some((mark) => mark.from === 'center') ? NEAR : THEME
}

// 格子右上角的小記號（騎士跳 ♞、鏡射的軸）
function cellMark(index: number) {
  if (mode.value === 'knight' && knightTargets.value.has(index)) return '♞'
  if (mode.value === 'mirror') {
    const marks = mirrorMarks.value.get(index)
    if (marks?.length) return marks.map((mark) => ({ leftRight: '↔', topBottom: '↕', diagonal: '⤡' })[mark.axis]).join('')
  }
  return ''
}

// ---- 選中的那一格 ----
const detail = computed(() => {
  const index = selected.value
  const entry = props.cards[index]
  if (!entry) return null
  const isCenter = index === centerIndex.value
  const isTheme = index === themeIndex.value
  const tags: { key: string; label: string; class: string }[] = []
  if (isCenter) {
    tags.push({
      key: 'center',
      label: props.tableau.center.present ? '中心：代表牌' : '中心：代表牌未出現，以這個宮位為中心',
      class: 'border-accent-hue/50 bg-accent-hue/15 text-accent',
    })
  }
  if (isTheme && props.tableau.themeCard) {
    tags.push({
      key: 'theme',
      label: props.tableau.themeCard.present ? keyCardName.value : `${keyCardName.value}未出現，看這個宮位`,
      class: 'border-info-hue/40 bg-info-hue/10 text-info',
    })
  }
  if (ownHouse.value.has(index)) tags.push({ key: 'own', label: '落在自己的宮位', class: 'border-ok-hue/40 bg-ok-hue/10 text-ok' })
  const distance = distanceOf.value.get(index)
  if (distance) tags.push({ key: 'distance', label: `離中心：${DISTANCE_LABELS[distance]}`, class: 'border-tint/15 bg-tint/5 text-ink-soft' })
  for (const direction of directionsOf.value.get(index) ?? []) {
    tags.push({ key: direction, label: `在中心的${DIRECTION_LABELS[direction]}`, class: 'border-tint/15 bg-tint/5 text-ink-soft' })
  }
  return {
    index,
    house: entry.position.house ?? index + 1,
    houseTheme: entry.position.houseTheme ?? '',
    name: nameOf(index),
    meaning: props.cardsById.get(entry.card.id)?.meaning.core ?? '',
    tags,
  }
})
</script>

<template>
  <div class="space-y-3">
    <!-- 看法切換：同一頁裡的篩選，選中用中性色（ui-check：換頁的分頁才用金色） -->
    <div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="大藍圖的看法">
      <button
        v-for="option in VIEW_OPTIONS"
        :key="option.value"
        type="button"
        role="radio"
        :aria-checked="mode === option.value"
        class="cursor-pointer border-2 px-3 py-1 font-pixel text-button transition active:translate-x-[2px] active:translate-y-[2px]"
        :class="mode === option.value ? 'border-ink-soft/60 bg-tint/10 text-ink' : 'border-tint/15 text-ink-muted hover:text-ink'"
        @click="mode = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 圖例：每種看法的顏色代表什麼 -->
    <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
      <template v-if="mode === 'distance'">
        <span><span class="mr-1 inline-block h-3 w-3 border border-tint/20 align-middle" :class="NEAR" aria-hidden="true" />近</span>
        <span><span class="mr-1 inline-block h-3 w-3 border border-tint/20 align-middle" :class="MIDDLE" aria-hidden="true" />中</span>
        <span><span class="mr-1 inline-block h-3 w-3 border border-tint/20 align-middle" :class="FAR" aria-hidden="true" />遠</span>
        <span>（離中心的距離，越近影響越直接）</span>
      </template>
      <template v-else>
        <span><span class="mr-1 inline-block h-3 w-3 border border-tint/20 align-middle" :class="NEAR" aria-hidden="true" />從{{ FROM_LABEL.center }}</span>
        <span v-if="hasThemeEntry"><span class="mr-1 inline-block h-3 w-3 border border-tint/20 align-middle" :class="THEME" aria-hidden="true" />從{{ FROM_LABEL.theme }}</span>
        <span v-if="mode === 'mirror'">↔ 左右　↕ 上下　⤡ 對角</span>
        <span v-else>♞ 騎士跳的落點</span>
      </template>
    </p>

    <!-- 9×4：一律縮到容器寬度（手機也是），不左右捲動，整張的分布一眼看得到 -->
    <!-- 桌機也收在 44rem 內：太寬時每張牌約 200px 高，四列就超過一個畫面，看不到整張 -->
    <div class="mx-auto w-full max-w-[44rem]">
      <ul class="grid gap-0.5 sm:gap-1.5" :style="{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }" aria-label="大藍圖">
        <li v-for="(entry, index) in cards" :key="index" class="min-w-0">
          <button
            type="button"
            class="relative flex w-full cursor-pointer flex-col items-center gap-0.5 border-2 p-0.5 transition active:translate-x-[1px] active:translate-y-[1px] sm:p-1"
            :class="[
              cellTone(index),
              index === centerIndex ? 'border-accent-hue' : index === themeIndex ? 'border-info-hue' : 'border-tint/10',
              index === selected ? 'outline-2 outline-offset-1 outline-ink' : '',
            ]"
            :aria-pressed="index === selected"
            :aria-label="`第 ${entry.position.house ?? index + 1} 宮 ${entry.position.houseTheme ?? ''}：${nameOf(index)}`"
            @click="selected = index"
          >
            <span class="w-full truncate text-center text-caption leading-tight text-ink-muted">
              {{ entry.position.house ?? index + 1 }}<span class="hidden md:inline">&nbsp;{{ entry.position.houseTheme }}</span>
            </span>
            <img
              v-if="cardImageUrl(entry.card.image)"
              :src="cardImageUrl(entry.card.image)"
              :alt="entry.card.nameZh"
              class="aspect-[7/12] w-full object-cover"
              :class="cellTone(index) === FAR && index !== centerIndex && index !== themeIndex ? 'opacity-60' : ''"
            />
            <span class="hidden w-full truncate text-center text-caption leading-tight text-ink sm:block">{{ entry.card.nameZh }}</span>
            <!-- 記號放在牌面右上角（不是格子右上角），才不會蓋住宮位名稱 -->
            <span v-if="cellMark(index)" class="absolute right-1 top-6 bg-surface/85 px-0.5 text-caption leading-none text-accent sm:right-1.5 sm:top-7" aria-hidden="true">
              {{ cellMark(index) }}
            </span>
            <!-- 代表牌、關鍵牌沒出現：在它們的宮位這格標出來 -->
            <span
              v-if="index === centerIndex && !tableau.center.present"
              class="absolute inset-x-0 bottom-0 bg-accent-hue/90 text-center text-caption leading-tight text-on-selected"
            >
              中心
            </span>
            <span
              v-else-if="index === themeIndex && tableau.themeCard && !tableau.themeCard.present"
              class="absolute inset-x-0 bottom-0 bg-info-hue/80 text-center text-caption leading-tight text-surface"
            >
              關鍵
            </span>
          </button>
        </li>
      </ul>
    </div>

    <!-- 中心與關鍵牌的狀態（沒出現時要說） -->
    <div class="flex flex-wrap gap-2 text-caption">
      <span class="border-2 border-accent-hue/50 bg-accent-hue/10 px-2 py-0.5 text-accent">
        {{
          tableau.center.present
            ? `中心：代表牌 ${nameOf(tableau.center.index)}（第 ${tableau.center.house} 宮）`
            : `代表牌未出現，以第 ${tableau.center.house} 宮為中心`
        }}
      </span>
      <span v-if="tableau.themeCard" class="border-2 border-info-hue/40 bg-info-hue/10 px-2 py-0.5 text-info">
        {{
          tableau.themeCard.present
            ? `${keyCardName}：${nameOf(tableau.themeCard.index)}（第 ${tableau.themeCard.house} 宮，${tableau.themeCard.steps === 0 ? '就在中心' : `離中心${DISTANCE_LABELS[tableau.themeCard.distance]}、${tableau.themeCard.steps} 步`}）`
            : `${keyCardName}未出現，看第 ${tableau.themeCard.house} 宮`
        }}
      </span>
    </div>
    <!-- L7：第 n 張牌剛好落在第 n 宮，主題特別強。可能很多張（輸入實體牌時），標題只寫一次、牌名排成一列，點一張就選中那一格 -->
    <div v-if="tableau.houses.own.length" class="flex flex-wrap items-center gap-1.5 text-caption">
      <span class="text-ok">落在自己的宮位：</span>
      <button
        v-for="item in tableau.houses.own"
        :key="item.index"
        type="button"
        class="cursor-pointer border-2 border-ok-hue/40 bg-ok-hue/10 px-1.5 py-0.5 text-ok transition hover:bg-ok-hue/20 active:translate-x-[1px] active:translate-y-[1px]"
        @click="selected = item.index"
      >
        {{ nameOf(item.index) }}
      </button>
    </div>

    <!-- 選中那一格的詳細 -->
    <div v-if="detail" class="space-y-2 border-2 border-tint/10 bg-tint/5 p-3 sm:p-4" aria-live="polite">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p class="text-subtitle font-medium text-ink">{{ detail.name }}</p>
        <p class="text-body text-accent">第 {{ detail.house }} 宮・{{ detail.houseTheme }}</p>
      </div>
      <div v-if="detail.tags.length" class="flex flex-wrap gap-1.5 text-caption">
        <span v-for="tag in detail.tags" :key="tag.key" class="border-2 px-2 py-0.5" :class="tag.class">{{ tag.label }}</span>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div>
          <p class="text-caption font-medium text-accent">牌義</p>
          <p class="text-body text-ink-soft">{{ detail.meaning || '牌義載入中…' }}</p>
        </div>
        <div>
          <p class="text-caption font-medium text-accent">宮位主題</p>
          <p class="text-body text-ink-soft">第 {{ detail.house }} 宮：{{ detail.houseTheme }}（這張牌的意思落在這個主題上）</p>
        </div>
      </div>
    </div>

    <!-- 這個看法的後端解讀段落（成對的句子、距離與宮位的說明） -->
    <div v-for="section in modeSections" :key="section.key" class="space-y-1.5">
      <h3 class="text-subtitle font-medium text-accent">{{ section.title }}</h3>
      <ul class="space-y-1.5 text-body text-ink-soft">
        <li v-for="(line, lineIndex) in section.lines" :key="lineIndex" class="flex gap-2">
          <span class="shrink-0 text-ink-muted" aria-hidden="true">・</span>
          <span class="min-w-0">{{ line }}</span>
        </li>
      </ul>
    </div>

    <!-- 騎士跳、鏡射的成對清單：點一張就在上面選中那一格 -->
    <div v-if="mode === 'knight'" class="space-y-2">
      <div v-for="jump in tableau.knighting" :key="jump.from" class="space-y-1">
        <p class="text-body text-ink-soft">
          從{{ FROM_LABEL[jump.from] }}「{{ nameOf(jump.origin) }}」跳到 {{ jump.targets.length }} 張：
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="target in jump.targets"
            :key="target"
            type="button"
            class="cursor-pointer border-2 border-tint/15 bg-tint/5 px-2 py-0.5 text-caption text-ink-soft transition hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
            @click="selected = target"
          >
            {{ nameOf(jump.origin).split(' ')[1] }} ↔ {{ nameOf(target) }}
          </button>
        </div>
      </div>
    </div>
    <div v-else-if="mode === 'mirror'" class="space-y-2">
      <div v-for="mirror in tableau.mirrors" :key="mirror.from" class="space-y-1">
        <p class="text-body text-ink-soft">{{ FROM_LABEL[mirror.from] }}「{{ nameOf(mirror.origin) }}」的鏡射：</p>
        <div class="flex flex-wrap gap-1.5">
          <template v-for="axis in (['leftRight', 'topBottom', 'diagonal'] as const)" :key="axis">
            <button
              v-if="mirror[axis] !== null"
              type="button"
              class="cursor-pointer border-2 border-tint/15 bg-tint/5 px-2 py-0.5 text-caption text-ink-soft transition hover:bg-tint/10 active:translate-x-[1px] active:translate-y-[1px]"
              @click="selected = mirror[axis]!"
            >
              {{ MIRROR_LABELS[axis] }}：{{ nameOf(mirror[axis]!) }}
            </button>
            <span v-else class="border-2 border-dashed border-tint/15 px-2 py-0.5 text-caption text-ink-muted">{{ MIRROR_LABELS[axis] }}：在中間欄，對到自己</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
