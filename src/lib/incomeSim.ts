// 存股試算 2.0 的計算（v20 2.9.9，2026-11-11）：純函式，元件只負責輸入與排版。
// 這是使用者輸入假設的試算，不是預測；規則見後端 doc/v20-portfolio-income-plan.md 的 2.9.9。
//
// 模型（每月一步）：
// - 每檔（holding）有自己的持有單位數；股價指數 P 從 1 起算，每月照「假設股價年漲幅」變動，所有檔共用。
// - 每單位一年的股利 D 從「殖利率 × P」起算，每月照「假設股利年成長」變動（和股價分開，不再綁在一起）。
// - 依配息頻率在對應月份入帳；用「月初」的單位數算，當月新投入的錢下個月才開始領。
// - 每次配息扣款：台股單次達門檻扣二代健保；美股扣預扣稅。台股股利所得稅每年結算一次（分離 28% 或合併計稅＋8.5% 抵減）。
// - 再投入：扣款後的股利買回同一檔；不再投入就累計成「領出來的」。

export type TaxMode = 'none' | 'separate' | 'combined'

export interface SimHolding {
  // 佔投入金額的比例（加總 1）
  weight: number
  // 殖利率（未扣款，%）
  yieldPct: number
  // 一年配息次數（12、4、2、1）
  payouts: number
  market: 'tw' | 'us'
}

export interface SimDeductions {
  nhi: boolean
  // 小數：2.11% 是 0.0211
  nhiRate: number
  nhiThreshold: number
  usWithholding: number
  taxMode: TaxMode
  // 合併計稅的級距（小數：0.05～0.4）
  taxBracket: number
}

export interface SimParams {
  holdings: SimHolding[]
  start: number
  monthly: number
  years: number
  // 以下都是 %
  priceGrowth: number
  dividendGrowth: number
  inflation: number
  reinvest: boolean
  deductions: SimDeductions
}

export interface SimRow {
  year: number
  value: number
  invested: number
  // 這一年領到的股利（扣款前）與扣掉的（健保＋美股預扣＋所得稅；退稅是負的）
  dividendsGross: number
  deducted: number
  // 不再投入時，累計領出來的（扣款後）
  cashOut: number
  // 以這一年底的持股，之後每月大約能領（扣款後）
  monthlyIncome: number
  // 換算成今天的錢（除以通膨累積倍數）
  realValue: number
  realMonthlyIncome: number
}

export const NHI_CAP = 10_000_000
const COMBINED_CREDIT_RATE = 0.085
const COMBINED_CREDIT_CAP = 80_000
const SEPARATE_RATE = 0.28

export const PAYOUTS: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }

// 一次配息的扣款（健保、美股預扣）；所得稅另外每年結算
function payoutDeduction(gross: number, market: 'tw' | 'us', d: SimDeductions) {
  if (gross <= 0) return 0
  if (market === 'us') return gross * d.usWithholding
  return d.nhi && gross >= d.nhiThreshold ? Math.min(gross, NHI_CAP) * d.nhiRate : 0
}

// 一年台股股利的所得稅（合併計稅的 8.5% 抵減可能大於稅額，差額退稅，結果是負的）
export function dividendTax(twGross: number, d: SimDeductions) {
  if (twGross <= 0 || d.taxMode === 'none') return 0
  if (d.taxMode === 'separate') return twGross * SEPARATE_RATE
  return twGross * d.taxBracket - Math.min(twGross * COMBINED_CREDIT_RATE, COMBINED_CREDIT_CAP)
}

// 一年扣款後的股利：每檔一年股利 annualGross[i]（扣款前）
export function annualNet(annualGross: number[], holdings: SimHolding[], d: SimDeductions) {
  let net = 0
  let twGross = 0
  holdings.forEach((h, i) => {
    const gross = annualGross[i] ?? 0
    if (gross <= 0) return
    const perPayout = gross / h.payouts
    net += gross - payoutDeduction(perPayout, h.market, d) * h.payouts
    if (h.market === 'tw') twGross += gross
  })
  return net - dividendTax(twGross, d)
}

export function simulate(p: SimParams): SimRow[] {
  const monthlyPrice = (1 + p.priceGrowth / 100) ** (1 / 12)
  const monthlyDividend = (1 + p.dividendGrowth / 100) ** (1 / 12)
  const inflationOf = (year: number) => (1 + p.inflation / 100) ** year
  let price = 1
  const perUnit = p.holdings.map((h) => h.yieldPct / 100)
  const units = p.holdings.map((h) => (p.start * h.weight) / price)
  let invested = p.start
  let cashOut = 0
  let yearGross = 0
  let yearDeducted = 0
  let yearTwGross = 0

  const snapshot = (year: number): SimRow => {
    const value = units.reduce((sum, u) => sum + u * price, 0)
    const income = annualNet(units.map((u, i) => u * perUnit[i]!), p.holdings, p.deductions) / 12
    return {
      year,
      value,
      invested,
      dividendsGross: yearGross,
      deducted: yearDeducted,
      cashOut,
      monthlyIncome: income,
      realValue: value / inflationOf(year),
      realMonthlyIncome: income / inflationOf(year),
    }
  }

  const rows: SimRow[] = [snapshot(0)]
  for (let month = 1; month <= Math.round(p.years) * 12; month += 1) {
    const eligible = [...units]
    price *= monthlyPrice
    for (let i = 0; i < perUnit.length; i += 1) perUnit[i]! *= monthlyDividend
    p.holdings.forEach((h, i) => {
      if (h.payouts <= 0 || month % Math.round(12 / h.payouts) !== 0) return
      const gross = (eligible[i]! * perUnit[i]!) / h.payouts
      if (gross <= 0) return
      const cut = payoutDeduction(gross, h.market, p.deductions)
      yearGross += gross
      yearDeducted += cut
      if (h.market === 'tw') yearTwGross += gross
      const net = gross - cut
      if (p.reinvest) units[i]! += net / price
      else cashOut += net
    })
    p.holdings.forEach((h, i) => {
      units[i]! += (p.monthly * h.weight) / price
    })
    invested += p.monthly
    if (month % 12 === 0) {
      // 所得稅每年結算：再投入時從持股按比例扣（等於賣一點來繳），不再投入時從領出來的扣
      const tax = dividendTax(yearTwGross, p.deductions)
      if (tax !== 0) {
        yearDeducted += tax
        if (p.reinvest) {
          const value = units.reduce((sum, u) => sum + u * price, 0)
          if (value > 0) for (let i = 0; i < units.length; i += 1) units[i]! *= Math.max(0, 1 - tax / value)
        } else cashOut -= tax
      }
      rows.push(snapshot(month / 12))
      yearGross = 0
      yearDeducted = 0
      yearTwGross = 0
    }
  }
  return rows
}

// 反推：每月想領 want 元（扣款後），要投入多少本金。扣款有門檻（健保），所以用二分搜尋而不是直接除
export function capitalFor(want: number, holdings: SimHolding[], d: SimDeductions) {
  const netOf = (capital: number) => annualNet(holdings.map((h) => (capital * h.weight * h.yieldPct) / 100), holdings, d) / 12
  if (netOf(1e12) < want) return null
  let low = 0
  let high = 1e12
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2
    if (netOf(mid) >= want) high = mid
    else low = mid
  }
  return high
}

// ---- 試算與比較共用的小工具 ----
export type YieldBasis = 'average' | 'recent'

// 殖利率用哪一段（未扣款，%）：多年平均沒有時退回近 12 個月。股利頁清單的股票與自選一檔（dividend-profile）都有這兩個欄位
export function yieldOf(source: { dividendAverage?: { months: number; yieldPct: number | null } | null; currentYield: number | null }, basis: YieldBasis) {
  const average = source.dividendAverage?.yieldPct
  if (basis === 'average' && average) return { pct: average, label: `近 ${source.dividendAverage!.months} 個月平均`, fallback: false }
  return source.currentYield ? { pct: source.currentYield, label: '近 12 個月', fallback: basis === 'average' } : null
}

// 配息頻率 → 一年幾次（沒配過當一年一次，殖利率是 0 也不影響）
export const payoutsOf = (frequency: string | undefined) => PAYOUTS[frequency ?? ''] ?? 1

// 一檔的台幣價格：美股乘匯率，取不到匯率是 null
export function priceTwdOf(profile: { price: number | null; usdTwd: number | null; target: { market: 'tw' | 'us' } }) {
  if (!profile.price) return null
  if (profile.target.market === 'tw') return profile.price
  return profile.usdTwd ? profile.price * profile.usdTwd : null
}
