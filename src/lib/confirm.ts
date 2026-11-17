import { ref } from 'vue'

// 全站共用的確認彈窗（取代瀏覽器的 window.confirm）。畫面只有一份 ConfirmDialog，放在 App.vue。
// 用法：if (!(await confirmDialog({ title: '移除追蹤', message: '確定要移除…？', confirmText: '移除', danger: true }))) return
export interface ConfirmOptions {
  title?: string
  message: string
  // 確定按鈕的文字，預設「確定」；刪除類建議寫成動作本身（「移除」「刪除」）
  confirmText?: string
  cancelText?: string
  // 刪除、移除這類無法復原的動作：確定按鈕用紅色，鍵盤焦點預設停在「取消」
  danger?: boolean
  // 只是告知、不需要選擇：只有一顆確定按鈕（例如 Google 登入後告知舊密碼已停用）
  alert?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export const confirmState = ref<PendingConfirm | null>(null)

export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options
  // 已經有一個開著（不應該發生）：舊的當成取消
  confirmState.value?.resolve(false)
  return new Promise((resolve) => {
    confirmState.value = { ...opts, resolve }
  })
}

// ConfirmDialog 按下按鈕、按 Esc 或點背景時呼叫
export function settleConfirm(ok: boolean) {
  const pending = confirmState.value
  confirmState.value = null
  pending?.resolve(ok)
}
