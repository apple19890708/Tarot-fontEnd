// Google 登入（v17 規格 I）：載入 Google Identity Services 的官方腳本，畫出「使用 Google 登入」按鈕。
// 使用者選完帳號後 Google 給一張 ID token（credential），交給後端 /api/auth/google 驗證；前端不解讀它。
// Client ID 放 VITE_GOOGLE_CLIENT_ID；沒設定時 googleClientId 是空字串，畫面就不顯示 Google 按鈕。

export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? ''

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'

// 只用到的那幾個方法
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup' }): void
      renderButton(
        element: HTMLElement,
        options: {
          theme?: 'outline' | 'filled_blue' | 'filled_black'
          size?: 'large' | 'medium' | 'small'
          text?: 'signin_with' | 'signup_with' | 'continue_with'
          shape?: 'rectangular' | 'pill'
          width?: number
          locale?: string
        },
      ): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}

// 整個網站只載一次；載入失敗時下次再試
let loading: Promise<GoogleIdentity> | null = null

export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (loading) return loading
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google 登入載入失敗')))
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google 登入載入失敗'))
    }
    document.head.appendChild(script)
  })
  return loading
}
