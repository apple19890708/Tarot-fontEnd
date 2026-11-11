import type { IncomeCalendarEntry, IncomeItem } from '../types'

// 某個月有哪幾檔除息（原本股利月曆的判斷，2026-11-10 月曆改成每月小卡後搬到這裡共用）。
// 本月以後用預估（projection.months）：已公告／已除息用除息日；推估用後端推的日期（去年同一次加一年），推不出日期的 date 是 null。
// 過去用實際紀錄（pastEvents），當時有沒有持股、應收多少看應收股利（entitlement），和「應收股利對照」同一份計算。
// projectionMonths：後端 report.months（從本月起）；thisMonth：YYYY-MM

function projectedEntry(item: IncomeItem, projectionIndex: number): IncomeCalendarEntry | null {
  const entry = item.projection?.months[projectionIndex]
  if (!entry || (!entry.cash && !entry.stock)) return null
  const estimated = entry.cash?.source === 'estimated' && !entry.cash.exDate
  // 董事會已決議：金額確定，除息日還沒訂 → 日期和推估一樣用推的
  const dateGuessed = (entry.cash?.source === 'estimated' || entry.cash?.source === 'decided') && !entry.cash.exDate
  const date = entry.cash?.exDate ?? entry.stock?.exDate ?? (dateGuessed ? entry.cash?.estimatedDate ?? null : null)
  return { item, cash: entry.cash, stock: entry.stock, date, estimated, dateGuessed, held: item.quantity > 0, past: false, heldKnown: true }
}

// 同一天的現金股利和配股合成一筆
function pastEntries(item: IncomeItem, inMonth: (date: string) => boolean): IncomeCalendarEntry[] {
  const events = (item.pastEvents ?? []).filter((e) => inMonth(e.date))
  const dates = [...new Set(events.map((e) => e.date))]
  const owed = item.entitlement?.events ?? []
  const heldKnown = Boolean(item.entitlement?.available)
  return dates.map((date) => {
    const cashEvent = events.find((e) => e.date === date && e.type === 'cash')
    const stockEvent = events.find((e) => e.date === date && e.type === 'stock')
    const cashOwed = owed.find((e) => e.type === 'cash' && e.exDate === date)
    const stockOwed = owed.find((e) => e.type === 'stock' && e.exDate === date)
    return {
      item,
      cash: cashEvent
        ? { perShare: cashEvent.perShare ?? 0, source: 'exDone', exDate: date, gross: cashOwed?.gross ?? null, deduction: cashOwed?.deduction ?? null, net: cashOwed?.net ?? null }
        : null,
      stock: stockEvent ? { exDate: date, ratio: stockEvent.ratio ?? 0, addShares: stockOwed?.addShares ?? 0, addQuantity: stockOwed?.addQuantity ?? 0 } : null,
      date,
      estimated: false,
      dateGuessed: false,
      held: Boolean(cashOwed || stockOwed),
      past: true,
      heldKnown,
    }
  })
}

const codeOf = (entry: IncomeCalendarEntry) => entry.item.target.code || entry.item.target.symbol || entry.item.target.name

// 這個月的每一筆（只有個股；沒持股的也列，held 是 false）。排序：有持股在前，再依日期（日期未定放最後）、代號
export function monthEntries(items: IncomeItem[], projectionMonths: string[], thisMonth: string, month: string): IncomeCalendarEntry[] {
  const stocks = items.filter((item) => item.target.kind === 'stock')
  let list: IncomeCalendarEntry[]
  if (month < thisMonth) {
    list = stocks.flatMap((item) => pastEntries(item, (date) => date.startsWith(month)))
  } else {
    const projectionIndex = projectionMonths.indexOf(month)
    list = stocks.flatMap((item) => {
      const projected = projectionIndex >= 0 ? projectedEntry(item, projectionIndex) : null
      // 本月：預估只會有一次（本月已除息的那次），月初到今天之間其他已經除息的從實際紀錄補上
      const earlier = month === thisMonth ? pastEntries(item, (date) => date.startsWith(month) && date !== projected?.date) : []
      return [...earlier, ...(projected ? [projected] : [])]
    })
  }
  return list.sort(
    (a, b) =>
      Number(b.held) - Number(a.held) ||
      (a.date ?? '9999').localeCompare(b.date ?? '9999') ||
      codeOf(a).localeCompare(codeOf(b)),
  )
}
