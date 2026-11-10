import { ref } from 'vue'

// 追蹤清單的版本號（v20）：任何會改到追蹤清單、持股、自選清單或交易成本的 API 成功後加 1（在 api.ts 的 watchlistMutation 裡加，
// 不靠各元件記得呼叫）。股市追蹤的分頁都在 KeepAlive 裡，切回來時比對版本號，變了才重抓自己用到的清單資料。
// 起因：2026-11-10 在自訂股票追蹤刪掉股票，切回股市總覽還在（總覽只抓一次清單）。
export const watchlistVersion = ref(0)

export function markWatchlistChanged() {
  watchlistVersion.value += 1
}

// 包住改清單的請求：成功才加版本號，失敗原樣丟出
export function watchlistMutation<T>(request: Promise<T>): Promise<T> {
  return request.then((result) => {
    markWatchlistChanged()
    return result
  })
}
