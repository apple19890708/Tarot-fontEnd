import { describe, expect, it } from 'vitest'

import {
  changeSincePct,
  hasStockRecord,
  journalPathOf,
  newStockDraft,
  quantityText,
  stockDraftOf,
  stockJournalPath,
  stockKeyFromRoute,
  stockKeyOf,
  stockRecordOf,
  stockRows,
} from './stockJournal'

describe('股票鍵（和後端 services/stockJournal.js 同一套）', () => {
  it('台股用代號、美股與指數用 symbol，一律大寫', () => {
    expect(stockKeyOf({ market: 'tw', code: '0050', symbol: '0050.TW' })).toBe('tw:0050')
    expect(stockKeyOf({ market: 'us', code: null, symbol: 'nvda' })).toBe('us:NVDA')
    expect(stockKeyOf({ market: 'tw', code: null, symbol: '^TWII' })).toBe('tw:^TWII')
    // 真實的指數資料（和後端同一條規則）
    expect(stockKeyOf({ market: 'tw', kind: 'index', code: 't00', symbol: '^TWII' })).toBe('tw:^TWII')
    expect(stockKeyOf({ market: 'tw', kind: 'index', code: 'o00', symbol: null })).toBe('tw:O00')
    expect(stockKeyOf(null)).toBeNull()
  })

  it('網址 → 股票鍵；不合格式回 null', () => {
    expect(stockKeyFromRoute('tw', '00679b')).toBe('tw:00679B')
    expect(stockKeyFromRoute('US', 'mu')).toBe('us:MU')
    expect(stockKeyFromRoute('jp', '7203')).toBeNull()
    expect(stockKeyFromRoute('tw', 'a b')).toBeNull()
    expect(stockKeyFromRoute('tw', '')).toBeNull()
  })

  it('日記頁網址：股票一檔一本；^ 要編碼；舊的分析 id 交給日記頁轉址', () => {
    expect(stockJournalPath('tw:0050')).toBe('/journal/stock/tw/0050')
    expect(stockJournalPath('tw:^TWII')).toBe('/journal/stock/tw/%5ETWII')
    expect(journalPathOf('stock:us:NVDA')).toBe('/journal/stock/us/NVDA')
    expect(journalPathOf('reading:507f1f77bcf86cd799439011')).toBe('/journal/reading/507f1f77bcf86cd799439011')
    expect(journalPathOf('stock:507f1f77bcf86cd799439011')).toBe('/journal/stock/507f1f77bcf86cd799439011')
  })
})

describe('記錄股票的欄位', () => {
  it('新的一篇帶入現在的股價；只有帶入的股價不算有填', () => {
    const draft = newStockDraft('tw', { price: 152.5, date: '2026-11-20' })
    expect(draft).toMatchObject({ unit: 'lot', quoteAtWrite: 152.5, quoteDate: '2026-11-20' })
    expect(stockRecordOf(draft, 'tw')).toEqual({ value: null })
    expect(newStockDraft('us', null).unit).toBe('share')
  })

  it('填了就轉成數字（可以有千分位）；美股的單位一律是股；沒填數量就沒有單位', () => {
    const draft = { ...newStockDraft('tw', { price: 150, date: null }), action: 'buy' as const, price: '1,015', quantity: '2', targetPrice: '1200' }
    expect(stockRecordOf(draft, 'tw')).toEqual({
      value: { action: 'buy', price: 1015, quantity: 2, unit: 'lot', targetPrice: 1200, stopPrice: null, quoteAtWrite: 150, quoteDate: null },
    })
    const us = { ...newStockDraft('us', null), action: 'buy' as const, quantity: '3', unit: 'lot' as const }
    expect(stockRecordOf(us, 'us')).toMatchObject({ value: { unit: 'share' } })
    const noQty = { ...newStockDraft('tw', null), action: 'watch' as const }
    expect(stockRecordOf(noQty, 'tw')).toMatchObject({ value: { unit: null, quantity: null } })
  })

  it('沒選動作就不記；只存這個動作用得到的欄位', () => {
    expect(stockRecordOf({ ...newStockDraft('tw', null), price: '88', stopPrice: '80' }, 'tw')).toEqual({ value: null })
    // 先選買進填了停損價、再改成減碼：停損價與目標價不存
    const reduce = { ...newStockDraft('tw', null), action: 'reduce' as const, price: '88', quantity: '1', targetPrice: '100', stopPrice: '80' }
    expect(stockRecordOf(reduce, 'tw')).toMatchObject({ value: { price: 88, quantity: 1, targetPrice: null, stopPrice: null } })
    // 觀察只記目標價
    const watch = { ...newStockDraft('tw', null), action: 'watch' as const, price: '88', targetPrice: '100', stopPrice: '80' }
    expect(stockRecordOf(watch, 'tw')).toMatchObject({ value: { price: null, targetPrice: 100, stopPrice: null } })
    // 藏起來的欄位填錯不擋儲存
    expect(stockRecordOf({ ...reduce, stopPrice: 'abc' }, 'tw')).toHaveProperty('value')
  })

  it('填錯回錯誤訊息（負數、0、不是數字）', () => {
    for (const price of ['-1', '0', 'abc']) {
      expect(stockRecordOf({ ...newStockDraft('tw', null), action: 'buy', price }, 'tw')).toEqual({ error: '價格要填大於 0 的數字。' })
    }
  })

  it('改舊的一篇沿用當時存的，存回去不變', () => {
    const record = { action: 'sell' as const, price: 98.4, quantity: 500, unit: 'share' as const, quoteAtWrite: 97, quoteDate: '2026-11-01', targetPrice: null, stopPrice: null }
    expect(stockRecordOf(stockDraftOf(record, 'tw'), 'tw')).toEqual({ value: record })
    expect(stockDraftOf(null, 'us').unit).toBe('share')
  })

  it('顯示的欄位跟著動作，不用 @ 這類符號', () => {
    const base = { quoteAtWrite: null, quoteDate: null }
    expect(stockRows({ ...base, action: 'reduce', price: 88, quantity: 1, unit: 'lot', targetPrice: null, stopPrice: 80 })).toEqual([
      { label: '價格', value: '88' },
      { label: '數量', value: '1 張' },
    ])
    expect(stockRows({ ...base, action: 'buy', price: 995, quantity: null, unit: null, targetPrice: 1200, stopPrice: 930 }).map((row) => row.label)).toEqual(['價格', '目標價', '停損價'])
    expect(stockRows(null)).toEqual([])
  })

  it('列表用的文字與漲跌', () => {
    expect(hasStockRecord(null)).toBe(false)
    expect(hasStockRecord({ action: null, price: 88, quantity: null, unit: null, quoteAtWrite: 100, quoteDate: null, targetPrice: null, stopPrice: null })).toBe(false)
    expect(quantityText({ quantity: 2, unit: 'lot' })).toBe('2 張')
    expect(quantityText({ quantity: 1500, unit: 'share' })).toBe('1,500 股')
    expect(changeSincePct(100, 112.34)).toBe(12.3)
    expect(changeSincePct(100, 95)).toBe(-5)
    expect(changeSincePct(null, 95)).toBeNull()
    expect(changeSincePct(100, null)).toBeNull()
  })
})
