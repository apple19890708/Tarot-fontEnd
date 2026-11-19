import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'

import { renderAiMarkdown } from './aiMarkdown'

// 紀錄匯出成 PDF（v13 階段 5）。這個檔只在按下匯出時才動態載入（jspdf、html2canvas 不進主程式）。
//
// 做法：把匯出用的 Markdown 轉成 HTML，排在畫面外一張固定寬度的白紙上，依段落分頁，
// 每頁用 html2canvas 畫成圖再放進 A4 的 PDF。
// - 中文用瀏覽器本身的字型畫，不用把好幾 MB 的中文字型塞進 PDF
// - 用 html2canvas-pro 而不是 html2canvas：Tailwind 4 的顏色是 oklch，原版不支援會直接失敗
// - 一頁一張圖，不畫成一整張長圖：手機（iOS）的 canvas 有面積上限，長的塔羅紀錄會超過
// - 代價是 PDF 裡的字不能選取、搜尋；連結另外用 PDF 的連結區塊補上，點得到

// A4：210 × 297 mm，左右上下留 14 mm
const PAGE_W_MM = 210
const PAGE_H_MM = 297
const MARGIN_MM = 14
const FOOTER_MM = 6
const CONTENT_W_MM = PAGE_W_MM - MARGIN_MM * 2
const CONTENT_H_MM = PAGE_H_MM - MARGIN_MM * 2 - FOOTER_MM
// 紙張在畫面上的寬度（px）；高度依同樣比例換算
const PAPER_W_PX = 720
const PX_PER_MM = PAPER_W_PX / CONTENT_W_MM
const PAGE_H_PX = Math.floor(CONTENT_H_MM * PX_PER_MM)
// 畫成圖的解析度倍數：2 倍印出來字才清楚，再高檔案就太大
const SCALE = 2

// 紙上的樣式：固定白底深字，不跟著網站的日夜模式（網站的顏色變數在黑夜時是淺色字）
const CSS = `
.rp-page { width: ${PAPER_W_PX}px; box-sizing: border-box; background: #ffffff; color: #1f2430;
  font-family: "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", "Heiti TC", sans-serif;
  font-size: 15px; line-height: 1.75; letter-spacing: 0.01em; overflow: hidden; }
.rp-page > :first-child { margin-top: 0 !important; }
.rp-page h1 { font-size: 24px; line-height: 1.35; margin: 0 0 10px; color: #111827; }
.rp-page h2 { font-size: 19px; line-height: 1.4; margin: 22px 0 8px; padding-bottom: 4px; color: #92400e; border-bottom: 2px solid #f3d9a4; }
.rp-page h3 { font-size: 16px; line-height: 1.5; margin: 16px 0 6px; color: #111827; }
.rp-page h4, .rp-page h5, .rp-page h6 { font-size: 15px; margin: 12px 0 4px; color: #111827; }
.rp-page p { margin: 6px 0; }
.rp-page h1, .rp-page h2, .rp-page h3, .rp-page h4, .rp-page h5, .rp-page h6 { font-weight: 700; }
/* 清單符號自己畫（見 addListMarks）：html2canvas 畫原生的符號會貼著字、編號少了點 */
.rp-page ul, .rp-page ol { margin: 0; padding-left: 4px; list-style: none; }
.rp-page li { position: relative; padding-left: 1.4em; }
.rp-page .rp-mark { position: absolute; left: 0; top: 0; color: #b45309; }
.rp-page ol > li { padding-left: 1.9em; }
.rp-page li { margin: 3px 0; }
.rp-page li::marker { color: #b45309; }
.rp-page strong { font-weight: 700; color: #92400e; }
.rp-page a { color: #1d4ed8; text-decoration: underline; }
.rp-page hr { border: 0; border-top: 1px solid #d1d5db; margin: 18px 0 8px; }
.rp-page table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 14px; }
.rp-page th, .rp-page td { border: 1px solid #d1d5db; padding: 5px 8px; text-align: left; vertical-align: top; }
.rp-page th { background: #f3f4f6; font-weight: 600; }
.rp-page .rp-table { margin: 8px 0; }
.rp-page .rp-up { color: #dc2626; font-weight: 700; white-space: nowrap; }
.rp-page .rp-down { color: #16a34a; font-weight: 700; white-space: nowrap; }
.rp-page .rp-warn { color: #b45309; font-weight: 700; white-space: nowrap; }
.rp-page .rp-muted { color: #6b7280; font-weight: 700; white-space: nowrap; }
.rp-page .rp-nowrap { white-space: nowrap; }
.rp-page .rp-current > td { background: #fef3c7; }
.rp-page .rp-spread { display: flex; flex-wrap: wrap; gap: 12px 10px; margin: 10px 0 14px; }
.rp-page .rp-fig { margin: 0; width: 96px; text-align: center; font-size: 12px; line-height: 1.45; color: #4b5563; }
.rp-page .rp-img { display: block; width: 96px; height: 164px; object-fit: cover; border: 1px solid #d1d5db; border-radius: 3px; margin-bottom: 4px; }
.rp-page .rp-rev { transform: rotate(180deg); }
.rp-page .rp-card { display: flex; gap: 14px; margin: 12px 0; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 6px; }
.rp-page .rp-thumb { flex-shrink: 0; width: 64px; height: 110px; object-fit: cover; border: 1px solid #d1d5db; border-radius: 3px; }
.rp-page .rp-card-body { min-width: 0; flex: 1; }
.rp-page .rp-card h3 { margin: 0 0 2px; font-size: 18px; }
.rp-page .rp-pos { margin: 0; font-size: 12px; letter-spacing: 0.12em; color: #6b7280; }
.rp-page .rp-kw { margin: 2px 0 6px; font-size: 13px; color: #4b5563; }
.rp-page .rp-group { margin: 8px 0 2px; font-size: 14px; font-weight: 700; color: #92400e; }
`

// 圖片（牌卡）要用跨網域模式重新載入，html2canvas 才畫得進去（後端的 CORS 已允許前端網域）。
// 加一個查詢參數避開瀏覽器快取：畫面上那張圖是一般模式載入的，快取裡的回應沒有跨網域標頭，直接沿用會被擋
// 等全部載完（失敗或超過 10 秒也放行，少一張圖不擋整份 PDF）才量高度、分頁
async function loadImages(root: HTMLElement) {
  const images = [...root.querySelectorAll('img')]
  await Promise.all(
    images.map((img) => {
      const src = img.getAttribute('src') ?? ''
      img.removeAttribute('src')
      img.crossOrigin = 'anonymous'
      try {
        const url = new URL(src, window.location.href)
        if (/^https?:$/.test(url.protocol) && url.origin !== window.location.origin) url.searchParams.set('pdf', '1')
        img.src = url.href
      } catch {
        img.src = src
      }
      return new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth) return resolve()
        const timer = setTimeout(resolve, 10000)
        const done = () => {
          clearTimeout(timer)
          resolve()
        }
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    }),
  )
}

// renderAiMarkdown 給的是網站用的 Tailwind class（顏色跟著日夜模式變），換成紙上固定的顏色。
// 哪一格要上色仍然照 renderAiMarkdown 的判斷，這裡不重寫規則
function toPaperClasses(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[class]').forEach((el) => {
    const cls = el.className
    // rp- 開頭的是匯出內容自己寫的（牌卡區塊），保留
    if (cls.startsWith('rp-')) return
    const next: string[] = []
    if (el.tagName === 'DIV' && el.querySelector(':scope > table')) next.push('rp-table')
    if (/\btext-up\b/.test(cls)) next.push('rp-up')
    else if (/\btext-down\b/.test(cls)) next.push('rp-down')
    else if (/\btext-(warn|accent)\b/.test(cls)) next.push('rp-warn')
    else if (/\btext-ink-muted\b/.test(cls) && el.tagName === 'TD') next.push('rp-muted')
    else if (/\bwhitespace-nowrap\b/.test(cls)) next.push('rp-nowrap')
    if (el.tagName === 'TR' && /bg-accent/.test(cls)) next.push('rp-current')
    if (next.length) el.className = next.join(' ')
    else el.removeAttribute('class')
  })
}

// 每一項前面放「•」或「1.」（要在拆清單之前做，編號才是原本的順序）
function addListMarks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('ul, ol').forEach((list) => {
    const start = Number(list.getAttribute('start') || 1)
    ;[...list.children].forEach((item, index) => {
      const mark = document.createElement('span')
      mark.className = 'rp-mark'
      mark.textContent = list.tagName === 'OL' ? `${start + index}.` : '•'
      item.prepend(mark)
    })
  })
}

// 分頁的單位：最上層的每個區塊；清單拆成一項一個單位（長清單才能跨頁）
function splitUnits(doc: HTMLElement): HTMLElement[] {
  const units: HTMLElement[] = []
  for (const child of [...doc.children] as HTMLElement[]) {
    if ((child.tagName === 'UL' || child.tagName === 'OL') && child.children.length > 1) {
      const start = Number(child.getAttribute('start') || 1)
      ;[...child.children].forEach((item, index) => {
        const list = document.createElement(child.tagName.toLowerCase())
        if (child.tagName === 'OL') list.setAttribute('start', String(start + index))
        list.append(item)
        units.push(list)
      })
    } else {
      units.push(child)
    }
  }
  return units
}

const isHeading = (el: HTMLElement) => /^H[1-6]$/.test(el.tagName)

// 依量到的高度把單位分到各頁；標題不留在頁尾，和後面的內容一起換頁
function paginate(units: HTMLElement[], heights: number[]): HTMLElement[][] {
  const pages: HTMLElement[][] = []
  let current: HTMLElement[] = []
  let used = 0
  units.forEach((unit, index) => {
    const height = heights[index] ?? 0
    if (current.length && used + height > PAGE_H_PX) {
      // 這頁最後連著幾個標題的話，一起搬到下一頁
      const carry: HTMLElement[] = []
      while (current.length > 1 && isHeading(current[current.length - 1]!)) carry.unshift(current.pop()!)
      pages.push(current)
      current = carry
      used = carry.reduce((sum, el) => sum + (heights[units.indexOf(el)] ?? 0), 0)
    }
    current.push(unit)
    used += height
  })
  if (current.length) pages.push(current)
  return pages
}

export async function renderMarkdownPdf(markdown: string, filename: string) {
  const host = document.createElement('div')
  // 放在畫面外：使用者看不到，但要真的排版才量得到高度
  host.style.cssText = 'position:absolute;left:-10000px;top:0;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  const style = document.createElement('style')
  style.textContent = CSS
  const doc = document.createElement('div')
  doc.className = 'rp-page'
  doc.innerHTML = renderAiMarkdown(markdown)
  toPaperClasses(doc)
  addListMarks(doc)
  host.append(style, doc)
  document.body.append(host)

  try {
    await Promise.all([document.fonts?.ready, loadImages(doc)])

    // 量每個單位佔的高度（含上下間距）：用下一個單位的位置相減
    const units = splitUnits(doc)
    doc.replaceChildren(...units)
    const tops = units.map((unit) => unit.offsetTop)
    const heights = units.map((_unit, index) => (tops[index + 1] ?? doc.scrollHeight) - tops[index]!)

    const pageEls = paginate(units, heights).map((group) => {
      const page = document.createElement('div')
      page.className = 'rp-page'
      page.append(...group)
      return page
    })
    doc.remove()
    host.append(...pageEls)

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    let pdfPage = 0
    const addPage = () => {
      if (pdfPage > 0) pdf.addPage()
      pdfPage += 1
    }

    for (const page of pageEls) {
      const canvas = await html2canvas(page, { scale: SCALE, backgroundColor: '#ffffff', logging: false, useCORS: true })
      const pageRect = page.getBoundingClientRect()
      const links = [...page.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')].map((a) => {
        const rect = a.getBoundingClientRect()
        return { url: a.href, x: rect.left - pageRect.left, y: rect.top - pageRect.top, w: rect.width, h: rect.height }
      })

      // 單一區塊比一頁還高（例如很長的表格）時，這張圖要切成好幾頁
      const sliceHeightPx = PAGE_H_PX * SCALE
      for (let offset = 0; offset < canvas.height; offset += sliceHeightPx) {
        const height = Math.min(sliceHeightPx, canvas.height - offset)
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = height
        slice.getContext('2d')!.drawImage(canvas, 0, offset, canvas.width, height, 0, 0, canvas.width, height)
        addPage()
        pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN_MM, MARGIN_MM, CONTENT_W_MM, height / SCALE / PX_PER_MM)
        for (const link of links) {
          const top = link.y * SCALE - offset
          if (top < 0 || top >= height) continue
          pdf.link(
            MARGIN_MM + link.x / PX_PER_MM,
            MARGIN_MM + top / SCALE / PX_PER_MM,
            link.w / PX_PER_MM,
            link.h / PX_PER_MM,
            { url: link.url },
          )
        }
      }
    }

    // 頁碼（只有數字，PDF 內建字型就夠）
    const total = pdf.getNumberOfPages()
    for (let index = 1; index <= total; index += 1) {
      pdf.setPage(index)
      pdf.setFontSize(9)
      pdf.setTextColor(150)
      pdf.text(`${index} / ${total}`, PAGE_W_MM / 2, PAGE_H_MM - MARGIN_MM / 2, { align: 'center' })
    }

    pdf.save(filename)
  } finally {
    host.remove()
  }
}
