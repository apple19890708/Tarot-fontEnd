// 占卜步驟 2（抽牌）的狀態（2026-11-21 從 HomeView 搬出來）：三種抽牌方式（自動／手動扇形／輸入已抽到的牌）、
// 洗好的牌堆、依序選出的牌、輸入的牌、不指定牌陣時的自訂位置。
// 張數（targetCount）由步驟 1 的牌陣決定；張數一變，輸入的牌與自訂位置補滿或截短，已填的留著。
// v27：牌的型別改成泛型，塔羅（CardSummary，預設）與雷諾曼（LenormandDrawCard）共用；
// 牌庫由 loadCards 載入，沒給就是塔羅的 /api/cards。orientations 為 false（雷諾曼）時一律正位，不能切換
import { computed, ref, watch, type Ref } from 'vue'

import { fetchCards } from './api'
import type { CardSummary, CustomPosition, DeckOf, DrawableCard, DrawMode, InputOf } from '../types'

export interface DrawStateOptions<C extends DrawableCard> {
  targetCount: Readonly<Ref<number>>
  // 只用來判斷有沒有指定牌陣（沒有時才用自訂位置）
  selectedSpread: Readonly<Ref<{ key: string } | null>>
  loadCards?: () => Promise<C[]>
  // 有沒有正逆位；預設有（塔羅）
  orientations?: boolean
}

export function useDrawState<C extends DrawableCard = CardSummary>({
  targetCount,
  selectedSpread,
  loadCards,
  orientations = true,
}: DrawStateOptions<C>) {
  const load = loadCards ?? (fetchCards as unknown as () => Promise<C[]>)

  // 預設手動抽牌：自己洗牌挑牌是這個站的重點，自動抽牌是想快一點時才用
  const drawMode = ref<DrawMode>('fan')
  // 泛型的陣列放進 ref 會被 UnwrapRef 展開成另一個型別，這裡直接標成 Ref<C[]>
  const allCards = ref([]) as Ref<C[]>
  const cardsError = ref('')
  const cardSearch = ref('')

  // 手動抽牌：洗好的牌堆與依序選出的牌
  const deck = ref([]) as Ref<DeckOf<C>[]>
  const picked = ref([]) as Ref<DeckOf<C>[]>

  // 輸入已抽到的牌。長度一直等於牌陣張數，index 就是位置順序，空位是 undefined，
  // 使用者才能直接點某個位置把牌放上去，不必照順序一張一張加
  const inputCards = ref([]) as Ref<(InputOf<C> | undefined)[]>

  // 給像素夜景的抽牌事件：每多一張就劃一顆流星、逆位就雲遮月。
  // 自動抽牌是一次出結果，沒有逐張事件，夜景只會跟著步驟明暗
  const sceneDrawn = computed(() =>
    drawMode.value === 'input'
      ? inputCards.value.flatMap((card) => (card ? [card.orientation] : []))
      : picked.value.map((card) => card.orientation),
  )

  // 張數改變時補滿或截短，已經放好的牌留著
  watch(
    targetCount,
    (count) => {
      inputCards.value = Array.from({ length: count }, (_, index) => inputCards.value[index])
    },
    { immediate: true },
  )

  function resetInputCards() {
    inputCards.value = Array.from({ length: targetCount.value }, () => undefined)
  }

  // 不指定牌陣時，使用者自己定義的位置。張數改變時補滿或截短，已填的內容留著
  const customPositions = ref<CustomPosition[]>([])
  watch(
    targetCount,
    (count) => {
      customPositions.value = Array.from({ length: count }, (_, index) => customPositions.value[index] ?? { label: '', prompt: '' })
    },
    { immediate: true },
  )

  // 拖曳換位：兩張牌互換，中間的牌不動（插入式搬移會把中間整排推移，不是使用者要的）。
  // 位置定義留在原地，動的只有落在那個位置上的牌。
  function reorderInputCards(from: number, to: number) {
    const list = inputCards.value
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
      return
    }
    const a = list[from]
    const b = list[to]
    list[from] = b
    list[to] = a
  }

  function updateCustomPosition(index: number, patch: Partial<CustomPosition>) {
    const current = customPositions.value[index]
    if (current) {
      customPositions.value[index] = { ...current, ...patch }
    }
  }

  // 全部留白就不送，後端會維持「無位置」的舊行為；只要有填就必須每一格都有名稱
  const customPositionsParam = computed(() => {
    if (selectedSpread.value) {
      return undefined
    }
    const filled = customPositions.value.filter((item) => item.label.trim())
    if (filled.length !== customPositions.value.length || filled.length === 0) {
      return undefined
    }
    return customPositions.value.map((item) => ({ label: item.label.trim(), prompt: item.prompt.trim() }))
  })

  async function ensureCardsLoaded() {
    if (allCards.value.length > 0) {
      return
    }
    cardsError.value = ''
    try {
      allCards.value = await load()
    } catch (error) {
      cardsError.value = error instanceof Error ? error.message : '無法載入牌卡清單'
    }
  }

  // 洗牌：每張配一個亂數鍵再排序（這是均勻的；sort(() => Math.random() - 0.5) 不是）。
  // 正逆位在這裡就決定，不能等使用者選完才抽，否則「手動」只是換個介面的自動抽牌。
  // 沒有正逆位的牌組一律正位
  function shuffleDeck() {
    deck.value = allCards.value
      .map((card) => ({ card, key: Math.random() }))
      .sort((a, b) => a.key - b.key)
      .map(({ card }) => ({
        ...card,
        orientation: orientations && Math.random() > 0.5 ? 'reversed' : 'upright',
        picked: false,
      }))

    picked.value = []
  }

  // 換抽牌方式：手動與輸入要先有牌庫，手動第一次進來要洗牌
  async function setDrawMode(next: DrawMode) {
    drawMode.value = next
    if (next === 'fan' || next === 'input') {
      await ensureCardsLoaded()
    }
    if (next === 'fan' && deck.value.length === 0) {
      shuffleDeck()
    }
  }

  function pickFromDeck(index: number) {
    const card = deck.value[index]
    if (!card || card.picked || picked.value.length >= targetCount.value) {
      return
    }
    card.picked = true
    picked.value.push(card)
  }

  function undoPick() {
    const last = picked.value.pop()
    if (last) {
      last.picked = false
    }
  }

  // 指定位置放牌。同一張牌原本在別的位置就先清掉，不要同時出現兩次
  function setInputCard(index: number, card: C) {
    const list = inputCards.value
    if (index < 0 || index >= list.length) {
      return
    }
    const existing = list.findIndex((item) => item?.id === card.id)
    if (existing >= 0) {
      list[existing] = undefined
    }
    list[index] = { ...card, orientation: 'upright' }
  }

  function removeInputCard(index: number) {
    inputCards.value[index] = undefined
  }

  function toggleInputOrientation(index: number) {
    const card = inputCards.value[index]
    if (card && orientations) {
      card.orientation = card.orientation === 'upright' ? 'reversed' : 'upright'
    }
  }

  // 清掉這次選的牌（手動選的、輸入的）與牌堆；下次 setDrawMode 會重洗
  function clearPicks() {
    picked.value = []
    resetInputCards()
    deck.value = []
  }

  return {
    drawMode,
    allCards,
    cardsError,
    cardSearch,
    deck,
    picked,
    inputCards,
    sceneDrawn,
    customPositions,
    customPositionsParam,
    resetInputCards,
    reorderInputCards,
    updateCustomPosition,
    ensureCardsLoaded,
    shuffleDeck,
    setDrawMode,
    pickFromDeck,
    undoPick,
    setInputCard,
    removeInputCard,
    toggleInputOrientation,
    clearPicks,
  }
}
