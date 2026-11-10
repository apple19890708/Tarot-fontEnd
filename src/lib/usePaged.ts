import { computed, ref, watch, type Ref } from 'vue'

// 前端分頁（2026-11-10 使用者要求：清單股票多的時候每一區都要能分頁，每頁筆數可以自己選）。
// 和 components/ListPager.vue 一起用：
//   const fills = usePaged(twItems, 'income-fills')
//   <div v-for="item in fills.items.value" …>
//   <ListPager v-model:page="fills.page.value" v-model:page-size="fills.pageSize.value" :total="fills.total.value" />
// 每頁筆數記在 localStorage（每個列表各自一個 key，讀寫失敗就用預設）；清單變短、換筆數時頁碼自動拉回有效範圍
export const PAGE_SIZES = [5, 10, 15, 20, 50] as const
const STORE_PREFIX = 'page-size:'

function readSize(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(STORE_PREFIX + key))
    return (PAGE_SIZES as readonly number[]).includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function usePaged<T>(list: Ref<T[]>, key: string, defaultSize = 10) {
  const pageSize = ref(readSize(key, defaultSize))
  const page = ref(1)
  const total = computed(() => list.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const items = computed(() => list.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

  watch(pageSize, (size) => {
    page.value = 1
    try {
      localStorage.setItem(STORE_PREFIX + key, String(size))
    } catch {
      // 存不了只是下次不記得
    }
  })
  // 清單變短（換清單、刪股票）時，頁碼不能停在已經不存在的頁
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })

  return { page, pageSize, total, pageCount, items }
}
