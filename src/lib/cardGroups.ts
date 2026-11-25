// 「輸入已抽到的牌」選牌器的分組（v27 從 StepDraw 搬出來，塔羅與雷諾曼各一套，StepDraw 只負責畫）。
// cols 寫成完整的 Tailwind class 字串，Tailwind 才會產生（不能用變數拼出來）
import type { CardPickerGroup, CardSummary, LenormandDrawCard } from '../types'

// 宮廷牌由後端的 kind 判斷（編號在不同牌組不一致）；
// 舊版後端沒有這個欄位時，退回用小牌編號 11～14 粗略判斷
function isCourt(card: CardSummary) {
  return card.kind ? card.kind === 'court' : card.arcanaType === 'minor' && card.number >= 11
}

// 塔羅：依搜尋字串過濾，再依大牌／四花色分組。
// 每個花色裡數字牌在上、宮廷牌另起一排接在下面：同花色的牌放在一起好找，
// 宮廷牌又和一到十的進程分開一排，不會混在一起。
// 數字牌（或大牌）一排五張（一到十剛好兩排），宮廷牌一排四張（侍者到國王剛好一排）；手機放不下牌名，一律一排兩張
export function tarotCardGroups(cards: CardSummary[], search: string): CardPickerGroup<CardSummary>[] {
  const keyword = search.trim().toLowerCase()
  const match = (card: CardSummary) =>
    !keyword || card.nameZh.toLowerCase().includes(keyword) || (card.nameEn || '').toLowerCase().includes(keyword)

  const groups = [
    { key: 'major', label: '大阿爾克那', cards: [] as CardSummary[], courts: [] as CardSummary[] },
    { key: 'wands', label: '權杖', cards: [] as CardSummary[], courts: [] as CardSummary[] },
    { key: 'cups', label: '聖杯', cards: [] as CardSummary[], courts: [] as CardSummary[] },
    { key: 'swords', label: '寶劍', cards: [] as CardSummary[], courts: [] as CardSummary[] },
    { key: 'pentacles', label: '錢幣', cards: [] as CardSummary[], courts: [] as CardSummary[] },
  ]
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]))

  cards.filter(match).forEach((card) => {
    if (card.arcanaType === 'major') {
      byKey.major?.cards.push(card)
      return
    }
    const bucket = byKey[card.suit ?? '']
    if (isCourt(card)) {
      bucket?.courts.push(card)
    } else {
      bucket?.cards.push(card)
    }
  })

  return groups
    .filter((group) => group.cards.length > 0 || group.courts.length > 0)
    .map((group) => ({
      key: group.key,
      label: group.label,
      rows: [
        { key: 'cards', cols: 'grid-cols-2 sm:grid-cols-5', cards: group.cards },
        { key: 'courts', cols: 'grid-cols-2 sm:grid-cols-4', cards: group.courts },
      ].filter((row) => row.cards.length > 0),
    }))
}

// 雷諾曼（3-9）：1～36 傳統牌一組、37～52 擴充牌一組。可以用牌號搜尋：
// 輸入純數字時比對牌號（「3」只找第 3 張，不會連 13、23、30～36 都跑出來），否則比對中英文牌名
export function lenormandCardGroups(cards: LenormandDrawCard[], search: string): CardPickerGroup<LenormandDrawCard>[] {
  const keyword = search.trim().toLowerCase()
  const asNumber = /^\d+$/.test(keyword) ? Number(keyword) : null
  const match = (card: LenormandDrawCard) =>
    !keyword ||
    (asNumber !== null
      ? card.number === asNumber
      : card.nameZh.toLowerCase().includes(keyword) || card.nameEn.toLowerCase().includes(keyword))

  const sorted = cards.filter(match).sort((a, b) => a.number - b.number)
  const groups = [
    { key: 'traditional', label: '傳統牌 1～36', cards: sorted.filter((card) => card.number <= 36) },
    { key: 'extended', label: '擴充牌 37～52', cards: sorted.filter((card) => card.number > 36) },
  ]
  return groups
    .filter((group) => group.cards.length > 0)
    .map((group) => ({
      key: group.key,
      label: group.label,
      rows: [{ key: 'cards', cols: 'grid-cols-2 sm:grid-cols-4', cards: group.cards }],
    }))
}

// 雷諾曼選牌器按鈕上的字：牌號＋牌名（實體牌上印著牌號，照著找比較快）
export function lenormandCardLabel(card: LenormandDrawCard) {
  return `${card.number} ${card.nameZh}`
}
