// 拖曳排序（滑鼠、手指都能用）：按住把手上下拖，經過隔壁那一列的一半時就換位置，畫面即時跟著動。
// 不用 HTML5 的 draggable（手機觸控不支援）。把手要加 touch-none，拖的時候頁面才不會跟著捲。
// 移動與放開聽在 window 上，不用 setPointerCapture：換位置時 Vue 會搬動列的 DOM，被搬的元素會失去 capture，拖到一半就斷掉。
// 鍵盤：把手取得焦點時按上下方向鍵移動一格。
// listEl：列的父元素（每個子元素是一列，順序和資料一致）；move(from, to)：呼叫端搬資料。
// layout：list＝一列一個、上下排（過了隔壁的一半就換）；wrap＝左右排、會換行的小卡片（同一行比左右、不同行比上下）
import { onBeforeUnmount, ref, type Ref } from 'vue'

export function usePointerReorder(
  listEl: Readonly<Ref<HTMLElement | null>>,
  move: (from: number, to: number) => void,
  count: () => number,
  layout: 'list' | 'wrap' = 'list',
) {
  // 正在拖的那一列目前的位置（拖的途中會跟著換）
  const dragging = ref<number | null>(null)

  // 指標在這個元素「前面」（該換到它前面）／「後面」
  const isBefore = (event: PointerEvent, rect: DOMRect) =>
    layout === 'list'
      ? event.clientY < rect.top + rect.height / 2
      : event.clientY < rect.top || (event.clientY <= rect.bottom && event.clientX < rect.left + rect.width / 2)
  const isAfter = (event: PointerEvent, rect: DOMRect) =>
    layout === 'list'
      ? event.clientY > rect.top + rect.height / 2
      : event.clientY > rect.bottom || (event.clientY >= rect.top && event.clientX > rect.left + rect.width / 2)

  function onPointerMove(event: PointerEvent) {
    const index = dragging.value
    if (index === null || !listEl.value) return
    const rows = Array.from(listEl.value.children) as HTMLElement[]
    const prev = rows[index - 1]
    const next = rows[index + 1]
    if (prev && isBefore(event, prev.getBoundingClientRect())) {
      move(index, index - 1)
      dragging.value = index - 1
      return
    }
    if (next && isAfter(event, next.getBoundingClientRect())) {
      move(index, index + 1)
      dragging.value = index + 1
    }
  }

  function stop() {
    dragging.value = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }

  function onPointerDown(event: PointerEvent, index: number) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    dragging.value = index
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  function onKeydown(event: KeyboardEvent, index: number) {
    const back = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    const target = back ? index - 1 : forward ? index + 1 : null
    if (target === null) return
    event.preventDefault()
    if (target >= 0 && target < count()) move(index, target)
  }

  // 拖到一半元件被拆掉（例如切換分頁）時把監聽拿掉
  onBeforeUnmount(stop)

  return { dragging, onPointerDown, onKeydown }
}
