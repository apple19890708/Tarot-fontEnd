// 表格共用的 class（搭配 components/DataTable.vue）。
// DataTable 的第一欄固定在左邊，底色讀 CSS 變數 --sticky-bg（預設面板底色）。列本身有底色時，
// 固定欄要換成「面板底色混上同樣比例的 tint」，才不會出現一塊不同色的方塊，所以列的底色一律用這裡的組合：

// 強調／展開中的列（淡底）
export const ROW_TINT = 'bg-tint/5 [--sticky-bg:color-mix(in_oklab,var(--c-tint)_5%,var(--c-surface))]'
// 可以點的列：滑過變淡底
export const ROW_HOVER = 'hover:bg-tint/5 hover:[--sticky-bg:color-mix(in_oklab,var(--c-tint)_5%,var(--c-surface))]'
// 可以點的列：滑過變比較明顯的底（股市總覽的表格）
export const ROW_HOVER_STRONG = 'hover:bg-tint/10 hover:[--sticky-bg:color-mix(in_oklab,var(--c-tint)_10%,var(--c-surface))]'
// 展開的明細列（往下壓暗）；裡面再包的精簡表格也會繼承這個變數，固定欄跟著同色
export const ROW_SINK = 'bg-sink/10 [--sticky-bg:color-mix(in_oklab,var(--c-sink)_10%,var(--c-surface))]'
