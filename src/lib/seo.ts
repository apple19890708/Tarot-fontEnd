import type { RouteLocationNormalized } from 'vue-router'

import seo from '../seo.json'

// 換頁時更新 <title>、描述、canonical 與 noindex（v24 第六節 4-1、4-4）。
// 公開頁（seo.json 的 pages）用那裡的標題與描述；其他頁用路由的 meta.title 加上網站名稱、描述用網站預設。
// 第一次進站的 HTML 由 scripts/seo-pages.mjs 先寫好，這裡只負責之後在站內換頁
const pagesByPath = new Map(seo.pages.map((page) => [page.path, page]))

function setMeta(selector: string, create: () => HTMLElement, value: string | null) {
  let element = document.head.querySelector<HTMLElement>(selector)
  if (value === null) {
    element?.remove()
    return
  }
  if (!element) {
    element = create()
    document.head.append(element)
  }
  element.setAttribute(element.tagName === 'LINK' ? 'href' : 'content', value)
}

export function applySeo(to: RouteLocationNormalized) {
  // 路由路徑（不含 BASE_URL）去掉頭尾斜線，對應 seo.json 的 path（首頁是空字串）
  const key = to.path.replace(/^\/+|\/+$/g, '')
  const page = pagesByPath.get(key)
  const title = page?.title ?? (to.meta.title ? `${String(to.meta.title)}｜${seo.siteName}` : seo.pages[0]!.title)
  const description = page?.description ?? seo.description
  document.title = title
  setMeta('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), description)

  // canonical 只給公開頁，網址用目前的網域＋BASE_URL（和打包時寫進 HTML 的一致：結尾有斜線）
  const canonical = page ? new URL(`${import.meta.env.BASE_URL}${key ? `${key}/` : ''}`, window.location.origin).href : null
  setMeta('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), canonical)

  const noindex = Boolean(to.meta.auth || to.meta.role || to.meta.noindex)
  setMeta('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }), noindex ? 'noindex' : null)
}
