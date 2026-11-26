// 占卜的三步驟流程（v27 3-9，從 HomeView 抽出來）：1 問題（選牌陣）→ 2 抽牌（自動／扇形／輸入）→ 3 結果。
// 塔羅（HomeView）與雷諾曼（LenormandView）共用；兩邊不同的地方由呼叫端傳入：
// - 牌陣怎麼載、牌庫怎麼載、有沒有正逆位、各牌陣能用哪些抽牌方式
// - 自動抽牌與手動送出各打哪支 API（問題、問題類型、代表牌這些參數由呼叫端自己帶）
// - 結果出來、重新開始、重抽時要另外清什麼（塔羅的 AI 解讀、保存、追問、結果快照）
// 這裡只管流程本身：步驟、牌陣選擇、抽牌狀態、載入中與錯誤訊息
import { computed, ref, type Ref } from 'vue'

import { useDrawState } from './useDrawState'
import type { DeckOf, DrawableCard, DrawMode, InputOf, SpreadShape } from '../types'

export type ReadingStep = 1 | 2 | 3

export const READING_STEPS = [
  { value: 1, label: '問題' },
  { value: 2, label: '抽牌' },
  { value: 3, label: '結果' },
] as const

export interface ReadingFlowOptions<S extends SpreadShape, C extends DrawableCard, R> {
  // 預設選哪個牌陣；載入後清單裡沒有就改用第一個
  defaultSpreadKey: string
  fetchSpreads: () => Promise<S[]>
  loadCards?: () => Promise<C[]>
  orientations?: boolean
  // 不指定牌陣時的張數（只有塔羅有「不指定牌陣」）
  freeCardCount?: Ref<number>
  // 這個牌陣能用哪些抽牌方式（順序不拘）；進抽牌時目前的方式不在裡面就換成第一個
  modesFor: (spread: S | null) => DrawMode[]
  // 自動抽牌（一定有牌陣）
  drawAuto: (spread: S) => Promise<R>
  // 扇形或輸入選好的牌送出（依位置順序）
  drawManual: (cards: (DeckOf<C> | InputOf<C>)[], spread: S | null) => Promise<R>
  // 新的結果出來時（reading 已換成新結果、還沒切到步驟 3）
  onResult?: (result: R) => void
  // 重新開始與重抽前，清掉這次結果附帶的東西
  onReset?: () => void
}

export function useReadingFlow<S extends SpreadShape, C extends DrawableCard, R>(options: ReadingFlowOptions<S, C, R>) {
  const step = ref<ReadingStep>(1)

  // ---- 步驟 1 ----
  // 泛型的陣列放進 ref 會被 UnwrapRef 展開成另一個型別，這裡直接標成 Ref<S[]>
  const spreads = ref([]) as Ref<S[]>
  const selectedSpreadKey = ref(options.defaultSpreadKey)
  const selectedSpread = computed(() => spreads.value.find((spread) => spread.key === selectedSpreadKey.value) || null)
  const targetCount = computed(() => selectedSpread.value?.cardCount ?? options.freeCardCount?.value ?? 0)
  const availableModes = computed(() => options.modesFor(selectedSpread.value))

  // ---- 步驟 2 ----
  const draw = useDrawState<C>({
    targetCount,
    selectedSpread,
    loadCards: options.loadCards,
    orientations: options.orientations,
  })

  // ---- 步驟 3 ----
  const reading = ref(null) as Ref<R | null>
  // 自動抽牌的結果先放這裡，等 StepDraw 把牌一張一張發到牌陣上，動畫跑完才進結果頁
  const pendingAutoReading = ref(null) as Ref<R | null>

  const errorMessage = ref('')
  const isLoading = ref(false)
  const isBootstrapping = ref(true)

  // 抽牌請求的編號（2026-11-26 前端優化 2，照 useReadingMarket 的寫法）：換步驟（回到問題、重新開始、重抽、重新進抽牌）
  // 就加一，還在路上的回應回來時編號對不上就丟掉。原本按「回到問題」後，晚到的結果還是會把畫面帶到結果頁
  let drawRequestId = 0
  function invalidateDraws() {
    drawRequestId += 1
    isLoading.value = false
    pendingAutoReading.value = null
  }

  // 載牌陣清單；預設的牌陣不在清單裡就改用第一個
  async function bootstrap() {
    isBootstrapping.value = true
    errorMessage.value = ''

    try {
      const list = await options.fetchSpreads()
      spreads.value = list

      if (!list.some((spread) => spread.key === selectedSpreadKey.value) && list[0]) {
        selectedSpreadKey.value = list[0].key
      }
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : '無法取得初始化資料'
    } finally {
      isBootstrapping.value = false
    }
  }

  // 換抽牌方式時清掉上一個方式留下的錯誤訊息
  async function setDrawMode(next: DrawMode) {
    errorMessage.value = ''
    await draw.setDrawMode(next)
  }

  function onReadingReady(result: R) {
    reading.value = result
    options.onResult?.(result)
    step.value = 3
  }

  async function goToDraw() {
    invalidateDraws()
    errorMessage.value = ''
    step.value = 2
    // 上一次抽到、還沒進結果頁的牌不要留到這一次
    pendingAutoReading.value = null
    // 換牌陣後張數可能對不上，已選的牌一律清掉重來
    draw.clearPicks()

    // 目前的抽牌方式這個牌陣不能用（例如不指定牌陣時不能自動抽）：換成第一個能用的
    const modes = availableModes.value
    if (!modes.includes(draw.drawMode.value) && modes[0]) {
      draw.drawMode.value = modes[0]
    }
    await setDrawMode(draw.drawMode.value)
  }

  async function handleAutoDraw() {
    const spread = selectedSpread.value
    if (!spread) {
      return
    }
    const requestId = (drawRequestId += 1)
    errorMessage.value = ''
    isLoading.value = true
    pendingAutoReading.value = null

    try {
      const result = await options.drawAuto(spread)
      if (requestId === drawRequestId) pendingAutoReading.value = result
    } catch (error) {
      if (requestId === drawRequestId) errorMessage.value = error instanceof Error ? error.message : '抽牌失敗'
    } finally {
      if (requestId === drawRequestId) isLoading.value = false
    }
  }

  function onAutoDealDone() {
    const result = pendingAutoReading.value
    pendingAutoReading.value = null
    if (result) {
      onReadingReady(result)
    }
  }

  async function handleManualSubmit() {
    const source: (DeckOf<C> | InputOf<C>)[] =
      draw.drawMode.value === 'fan'
        ? draw.picked.value
        : draw.inputCards.value.filter((card): card is InputOf<C> => Boolean(card))
    if (source.length !== targetCount.value) {
      return
    }
    const requestId = (drawRequestId += 1)
    errorMessage.value = ''
    isLoading.value = true

    try {
      const result = await options.drawManual(source, selectedSpread.value)
      if (requestId === drawRequestId) onReadingReady(result)
    } catch (error) {
      if (requestId === drawRequestId) errorMessage.value = error instanceof Error ? error.message : '解讀失敗'
    } finally {
      if (requestId === drawRequestId) isLoading.value = false
    }
  }

  // 抽牌步驟的「回到問題」：還在路上的抽牌結果丟掉，不會晚一步把畫面帶去結果頁
  function backToQuestion() {
    invalidateDraws()
    errorMessage.value = ''
    step.value = 1
  }

  // 回到步驟 1：結果直接丟棄，不跳確認
  function restart() {
    invalidateDraws()
    options.onReset?.()
    reading.value = null
    draw.clearPicks()
    step.value = 1
  }

  // 重抽：保留問題與牌陣，只清結果與已選的牌，牌堆重洗。
  // 走和進抽牌一樣的 setDrawMode：重新整理或登入回來還原的結果沒有載過牌庫，
  // 原本直接洗牌會洗出空的牌堆、輸入模式也搜不到牌（2026-11-21 重構後實際走流程時發現）
  async function redraw() {
    invalidateDraws()
    options.onReset?.()
    reading.value = null
    draw.clearPicks()
    step.value = 2
    await setDrawMode(draw.drawMode.value)
  }

  return {
    step,
    spreads,
    selectedSpreadKey,
    selectedSpread,
    targetCount,
    availableModes,
    draw,
    reading,
    pendingAutoReading,
    errorMessage,
    isLoading,
    isBootstrapping,
    bootstrap,
    setDrawMode,
    onReadingReady,
    goToDraw,
    handleAutoDraw,
    onAutoDealDone,
    handleManualSubmit,
    restart,
    redraw,
    backToQuestion,
  }
}
