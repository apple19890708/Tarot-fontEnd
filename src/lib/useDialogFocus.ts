// 彈窗的焦點管理（2026-11-26 前端優化 6，從 ConfirmDialog 的作法抽出來）：
// - 打開時：記下原本的焦點，把焦點移進彈窗（指定的元素，沒指定就是第一個可聚焦的元素，再沒有就是彈窗本身）
// - 開著時：Tab／Shift+Tab 只在彈窗裡循環；Esc 呼叫 onEscape（通常是關閉）
// - 關閉時：焦點還回打開前的元素（例如點了哪張牌，關掉後焦點回到那張牌）
// 同時開好幾層（例如確認彈窗疊在別的彈窗上）時只有最上面那層處理按鍵。
//
// 用法：
//   彈窗本身就是一個元件、開著才掛載：useDialogFocus(panelRef, { onEscape: close })
//   元件一直掛著、用 v-if 開關：useDialogFocus(panelRef, { active: isOpen, onEscape: close })
import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

// 彈窗裡展開中的下拉／選單（見 onKeydown 的 Esc）
const OPEN_POPUP = '[aria-haspopup]:not([aria-haspopup="false"])[aria-expanded="true"], [role="combobox"][aria-expanded="true"]'

// 開著的彈窗，最後一個是最上層
const stack: symbol[] = []

function focusablesIn(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('inert') && !el.closest('[inert]') && el.getClientRects().length > 0,
  )
}

export function useDialogFocus(
  container: Readonly<Ref<HTMLElement | null>>,
  options: {
    // 用 v-if 開關的彈窗：給開關狀態；沒給就是「元件掛載＝打開」
    active?: Readonly<Ref<boolean>>
    // 打開時要先聚焦的元素（例如刪除確認的「取消」）
    initialFocus?: Readonly<Ref<HTMLElement | null>>
    onEscape?: () => void
  } = {},
) {
  const id = Symbol('dialog')
  let previousFocus: HTMLElement | null = null
  let open = false

  function onKeydown(event: KeyboardEvent) {
    if (stack[stack.length - 1] !== id) return
    const root = container.value
    if (!root) return
    if (event.key === 'Escape' && options.onEscape) {
      // 彈窗裡有展開中的下拉／選單（aria-haspopup 或 combobox 且 aria-expanded="true"，例如 SelectField、
      // 股票搜尋的候選、個股分析的「跳到段落」）：這次 Esc 交給它自己收起，彈窗不關。
      // 這裡是 window 的 capture，比彈窗裡元件自己的 keydown 先執行，不先讓開的話下拉還沒收起整個彈窗就關了。
      // 只認有 popup 的控制項；一般的折疊段落（只有 aria-expanded）展開時 Esc 照樣關彈窗
      if (root.querySelector(OPEN_POPUP)) return
      // 只關最上層，不要讓底下的彈窗也收到 Esc 一起關掉
      event.stopImmediatePropagation()
      event.preventDefault()
      options.onEscape()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusablesIn(root)
    if (!items.length) {
      event.preventDefault()
      root.focus()
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    const current = document.activeElement
    // 焦點跑到彈窗外面（例如點了背景）時，拉回第一個
    if (!(current instanceof Node) || !root.contains(current)) {
      event.preventDefault()
      first.focus()
      return
    }
    if (event.shiftKey && current === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function activate() {
    if (open) return
    open = true
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    stack.push(id)
    window.addEventListener('keydown', onKeydown, true)
    await nextTick()
    const root = container.value
    if (!root || !open) return
    const target = options.initialFocus?.value ?? focusablesIn(root)[0] ?? root
    if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }

  function deactivate() {
    if (!open) return
    open = false
    window.removeEventListener('keydown', onKeydown, true)
    const index = stack.indexOf(id)
    if (index >= 0) stack.splice(index, 1)
    // 原本的元素還在畫面上才還回去（例如換頁後就不在了）
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    previousFocus = null
  }

  if (options.active) {
    watch(options.active, (value) => (value ? void activate() : deactivate()), { immediate: true })
  } else {
    onMounted(() => void activate())
  }
  onBeforeUnmount(deactivate)
}
