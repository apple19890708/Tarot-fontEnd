// 存股試算的扣款與稅（股利頁的「每月能領多少」「要投入多少」都靠這幾個函式）
import { describe, expect, it } from 'vitest'

import { annualNet, capitalFor, dividendTax, type SimDeductions, type SimHolding } from './incomeSim'

const NONE: SimDeductions = { nhi: false, nhiRate: 0.0211, nhiThreshold: 20000, usWithholding: 0.3, taxMode: 'none', taxBracket: 0.05 }
const tw = (payouts = 4): SimHolding => ({ weight: 1, yieldPct: 5, payouts, market: 'tw' })

describe('dividendTax', () => {
  it('不計稅、沒有股利時是 0', () => {
    expect(dividendTax(100_000, NONE)).toBe(0)
    expect(dividendTax(0, { ...NONE, taxMode: 'separate' })).toBe(0)
  })

  it('分離課稅 28%', () => {
    expect(dividendTax(100_000, { ...NONE, taxMode: 'separate' })).toBeCloseTo(28_000)
  })

  it('合併計稅：級距稅額減掉 8.5% 抵減（上限 8 萬），抵減大於稅額時是負的（退稅）', () => {
    const combined = (bracket: number) => ({ ...NONE, taxMode: 'combined' as const, taxBracket: bracket })
    expect(dividendTax(100_000, combined(0.05))).toBeCloseTo(5_000 - 8_500)
    expect(dividendTax(100_000, combined(0.2))).toBeCloseTo(20_000 - 8_500)
    // 股利 200 萬：抵減 17 萬被上限壓到 8 萬
    expect(dividendTax(2_000_000, combined(0.2))).toBeCloseTo(400_000 - 80_000)
  })
})

describe('annualNet', () => {
  it('沒有任何扣款時等於股利總額', () => {
    expect(annualNet([60_000], [tw()], NONE)).toBeCloseTo(60_000)
  })

  it('健保補充保費只扣單次配息達門檻的', () => {
    const withNhi = { ...NONE, nhi: true }
    // 一年 6 萬、季配：每次 1.5 萬，沒到 2 萬門檻，不扣
    expect(annualNet([60_000], [tw(4)], withNhi)).toBeCloseTo(60_000)
    // 一年 10 萬、季配：每次 2.5 萬，每次扣 2.11%
    expect(annualNet([100_000], [tw(4)], withNhi)).toBeCloseTo(100_000 - 25_000 * 0.0211 * 4)
  })

  it('美股預扣 30%，而且不算進台股的所得稅', () => {
    const us: SimHolding = { weight: 1, yieldPct: 4, payouts: 4, market: 'us' }
    const separate = { ...NONE, taxMode: 'separate' as const }
    expect(annualNet([10_000], [us], separate)).toBeCloseTo(7_000)
  })
})

describe('capitalFor', () => {
  it('反推要投入多少本金：每月領 5,000、殖利率 5%、不扣款 → 120 萬', () => {
    expect(capitalFor(5_000, [tw()], NONE)).toBeCloseTo(1_200_000, -1)
  })

  it('有扣款時要投入更多', () => {
    const withTax = { ...NONE, taxMode: 'separate' as const }
    expect(capitalFor(5_000, [tw()], withTax)!).toBeGreaterThan(1_200_000)
  })

  it('殖利率是 0、永遠領不到時回傳 null', () => {
    expect(capitalFor(5_000, [{ ...tw(), yieldPct: 0 }], NONE)).toBeNull()
  })
})
