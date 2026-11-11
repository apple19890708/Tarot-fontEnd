<script setup lang="ts">
// 共用表格（2026-11-11 使用者要求：表格統一規範，內容一律靠左）。
// 外框與橫向捲動、表頭底色與字級、儲存格內距、列分隔線、靠左、第一欄固定都在這裡定；各表格只寫欄位內容與顏色。
// 規則用 :where() 包起來（權重 0），個別儲存格要例外（例如箭頭欄窄一點）直接加 class 就能蓋過。
// 只套用到自己這一層的 th/td（用 > 子層選擇器），表格裡再包一張精簡表格不會互相影響。
//
// 第一欄固定在左邊（2026-11-11 使用者要求「表格都把左側欄位固定」）：手機左右捲時股票、市場這類列標題不跟著捲走。
// - 固定欄要有實心底色蓋住捲過去的內容，顏色讀 CSS 變數 --sticky-bg（預設面板底色 surface）。
//   表頭與有底色的列（滑過、展開、強調）要換成「surface 混上同樣比例的 tint」，用 lib/table.ts 的 ROW_TINT／ROW_HOVER，
//   否則固定欄會是一塊不同色的方塊。
// - 跨欄（colspan）的格子不固定、不套不換行：例如填息追蹤展開的明細列，本來就佔滿整列。
//
// variant：
// - default：有外框、表頭淡底、內文 text-body；一般資料表
// - compact：沒有外框、text-caption、內距窄；卡片裡的小表、展開的明細
// frameless：default 樣式但不要外框（外框由外層包，例如表格下面還接著別的內容、要框在一起時）
// tableClass：表格本身的 class，通常是手機要橫向捲動時的最小寬度（例如 min-w-[36rem]）
// 插槽：#head 放表頭的 <tr>，預設插槽放表身的 <tr>
withDefaults(defineProps<{ variant?: 'default' | 'compact'; frameless?: boolean; tableClass?: string }>(), {
  variant: 'default',
  frameless: false,
  tableClass: '',
})
</script>

<template>
  <!-- relative：表格裡的絕對定位元素（例如 sr-only 的文字）才會被這個捲動框裁切；少了它，表格比框寬時
       sr-only 會留在框外把整頁撐寬，手機上整頁被縮小、看起來靠左（填息追蹤的「展開」，2026-11-11） -->
  <div class="relative overflow-x-auto" :class="variant === 'default' && !frameless ? 'border-2 border-tint/10' : ''">
    <!-- 每列第一欄（股票、市場這類列標題）不換行：表頭不換行會讓表格變寬，第一欄被擠成一字一行（「台股」直排，2026-11-11） -->
    <table
      class="w-full text-left tabular-nums [:where(&)>tbody>tr]:border-t [:where(&)>tbody>tr]:border-tint/10 [:where(&)>*>tr>*]:text-left [:where(&)>*>tr>th]:font-normal [:where(&)>thead>tr>th]:whitespace-nowrap [:where(&)>thead]:text-ink-muted [:where(&)>*>tr>:first-child:not([colspan])]:sticky [:where(&)>*>tr>:first-child:not([colspan])]:left-0 [:where(&)>*>tr>:first-child:not([colspan])]:z-10 [:where(&)>*>tr>:first-child:not([colspan])]:whitespace-nowrap [:where(&)>*>tr>:first-child:not([colspan])]:bg-[var(--sticky-bg,var(--c-surface))] [:where(&)>*>tr>:first-child:not([colspan])]:shadow-[2px_0_0_var(--c-line)]"
      :class="[
        variant === 'default'
          ? 'text-body [:where(&)>*>tr>*]:px-3 [:where(&)>*>tr>*]:py-2 [:where(&)>thead]:bg-tint/5 [:where(&)>thead]:[--sticky-bg:color-mix(in_oklab,var(--c-tint)_5%,var(--c-surface))] [:where(&)>thead]:text-caption'
          : 'text-caption [:where(&)>*>tr>*]:py-1 [:where(&)>*>tr>*]:pr-3 [:where(&)>*>tr>*:last-child]:pr-0',
        tableClass,
      ]"
    >
      <thead v-if="$slots.head">
        <slot name="head" />
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
  </div>
</template>
