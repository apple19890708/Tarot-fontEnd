// 月曆（v26 計畫 1）的日期小工具。後端的日期一律是台北時間的 YYYY-MM-DD 字串；
// 月曆格子給的是瀏覽器本地的 Date，只取它的年月日（月曆上的「一天」不是某個時刻），
// 不經過 toISOString（那會換成 UTC，台灣早上 8 點前會變成前一天）。

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const pad = (value: number) => String(value).padStart(2, '0')

// 本地 Date → YYYY-MM-DD
export function dayKeyOf(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 本地 Date → YYYY-MM
export function monthKeyOf(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

// 月曆畫面的範圍（可能從上個月底開始）→ 這個畫面主要顯示的月份：取範圍中間那天的月份
export function visibleMonthOf(start: Date, end: Date) {
  return monthKeyOf(new Date((start.getTime() + end.getTime()) / 2))
}

// 「11 月 3 日（二）」；是今天時前面加「今天．」
export function dayTitle(key: string, today?: string) {
  const [year, month, day] = key.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()]
  return `${key === today ? '今天．' : ''}${month} 月 ${day} 日（${weekday}）`
}

// 紀錄時間 → 「14:05」（台北時間）
export function timeOf(iso: string) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

// 月曆格子裡的牌名簡寫（2026-11-20 使用者要求：圖太佔位置，改成「杖2」「幣后逆」「審判」這樣）
// 小牌：花色一個字＋點數（王牌是 1）；宮廷牌：花色＋侍／騎／后／王；大牌照原名，四個字的縮成兩個字；逆位加「逆」
const SUITS: Record<string, string> = { 權杖: '杖', 聖杯: '杯', 寶劍: '劍', 錢幣: '幣' }
const RANKS: Record<string, string> = {
  王牌: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  十: '10',
  侍者: '侍',
  騎士: '騎',
  皇后: '后',
  國王: '王',
}
const MAJOR_SHORT: Record<string, string> = { 命運之輪: '命運' }

export function cardShortName(nameZh: string, orientation: 'upright' | 'reversed') {
  const suit = Object.keys(SUITS).find((key) => nameZh.startsWith(key))
  let short = nameZh
  if (suit) {
    const rank = nameZh.slice(suit.length)
    short = `${SUITS[suit]}${RANKS[rank] ?? rank}`
  } else {
    short = MAJOR_SHORT[nameZh] ?? nameZh
  }
  return orientation === 'reversed' ? `${short}逆` : short
}
