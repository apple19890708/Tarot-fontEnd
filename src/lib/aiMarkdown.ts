import DOMPurify from 'dompurify'
import { marked } from 'marked'

// AI 回覆（Markdown）轉成可以 v-html 的 HTML：一定先經過 DOMPurify 清理。
// 塔羅解讀（StepResult）與個股、財經新聞分析（StockAiText）共用。

// 表格裡整格剛好是下面這些詞時依詞上色（漲紅跌綠）。只認整格，不改句子裡的字；
// 文字仍是後端（AI）產生的，前端只加顏色。這些詞由後端提示詞規定（Tbackend 的 narrationService.js
// MARKET_INSTRUCTIONS：方向表、技術面判讀、價位階梯），改了要兩邊一起改
// （2026-11-12 使用者要求：股市諮詢要整理成表格，方向的字要有顏色變化）
const STANCE_TONES: Record<string, string> = {
  偏多: 'whitespace-nowrap font-semibold text-up',
  偏空: 'whitespace-nowrap font-semibold text-down',
  觀望: 'whitespace-nowrap font-semibold text-warn',
  中性: 'whitespace-nowrap font-semibold text-ink-muted',
}
// 價位階梯（第一欄表頭是「類型」）才用：壓力、支撐上色，現價那一列加淡底，一眼看出卡在哪兩個價位之間。
// 只限這張表：行情現況的第一列也叫「現價」，不能跟著變色
const LADDER_TONES: Record<string, string> = {
  壓力: 'whitespace-nowrap font-semibold text-up',
  支撐: 'whitespace-nowrap font-semibold text-down',
  現價: 'whitespace-nowrap font-semibold text-accent',
}
const CURRENT_ROW = '[&>td]:bg-accent-hue/10'
// 只有數字的格子（價位、漲跌幅）：不換行、等寬數字
const NUMERIC = /^[-+−–]?[\d,]+(?:\.\d+)?\s*%?(?:（[-+−–]?[\d,.]+\s*%?）)?$/
// 表格外包的捲動框：表格比畫面寬時在框裡左右捲，不把整頁撐寬。
// 不能直接把 table 設成 block 來捲：那樣外框撐滿整行、表格本身只照內容寬，桌機右邊空一大塊（2026-11-12 使用者回報）
const TABLE_WRAP = 'relative overflow-x-auto border-2 border-tint/10'

// 塔羅解讀的分區排版（2026-11-12 使用者要求「排版與歸納好看一點」）：
// - 第一行的牌面（「**權杖十逆｜星星逆｜命運之輪正**」）拆成一排標籤
// - 第一個 ## 之前的開場包成結論框
// - 每個 ## 一節包成一張卡片；「最後的判斷」用金色外框強調；「位置｜牌名」的標題把位置縮成小字
// 只改外框與排列，文字仍是 AI 產生的原文
const CARD_CHIPS = 'flex flex-wrap gap-2'
const CARD_CHIP = 'border-2 border-accent-hue/30 bg-accent-hue/10 px-2.5 py-0.5 text-caption font-semibold text-accent'
const INTRO_BOX = 'space-y-2 border-l-4 border-accent-hue/60 bg-accent-hue/5 px-4 py-3 text-ink'
const SECTION_BOX = 'min-w-0 space-y-3 border-2 border-tint/10 bg-tint/5 px-4 py-4 sm:px-5'
const FINAL_BOX = 'min-w-0 space-y-3 border-2 border-accent-hue/40 bg-accent-hue/5 px-4 py-4 sm:px-5'
const HEADING_PLACE = 'mr-2 text-caption font-normal text-ink-muted'

function arrangeSections(fragment: DocumentFragment) {
  const nodes = [...fragment.childNodes]
  const sections: { heading: HTMLElement; nodes: Node[] }[] = []
  const intro: Node[] = []
  for (const node of nodes) {
    if (node instanceof HTMLElement && node.tagName === 'H2') sections.push({ heading: node, nodes: [] })
    else if (sections.length) sections[sections.length - 1]!.nodes.push(node)
    else intro.push(node)
  }
  const parts: Node[] = []

  // 開場：第一段只有一個粗體、裡面用「｜」隔開 → 牌面標籤
  const introElements = intro.filter((node): node is HTMLElement => node instanceof HTMLElement)
  const first = introElements[0]
  const strong = first?.tagName === 'P' && first.childElementCount === 1 ? first.querySelector(':scope > strong') : null
  if (first && strong && strong.textContent?.includes('｜') && first.textContent?.trim() === strong.textContent.trim()) {
    const chips = document.createElement('div')
    chips.className = CARD_CHIPS
    for (const name of strong.textContent.split('｜').map((text) => text.trim()).filter(Boolean)) {
      const chip = document.createElement('span')
      chip.className = CARD_CHIP
      chip.textContent = name
      chips.append(chip)
    }
    parts.push(chips)
    intro.splice(intro.indexOf(first), 1)
  }
  if (intro.some((node) => node.textContent?.trim())) {
    const box = document.createElement('div')
    box.className = INTRO_BOX
    box.append(...intro)
    parts.push(box)
  }

  for (const { heading, nodes: body } of sections) {
    const title = heading.textContent?.trim() ?? ''
    // 「第 1 張｜權杖十逆」「現況｜寶劍二逆」：位置縮成小字，牌名當標題
    const bar = title.indexOf('｜')
    if (bar > 0 && heading.childElementCount === 0) {
      const place = document.createElement('span')
      place.className = HEADING_PLACE
      place.textContent = title.slice(0, bar).trim()
      heading.textContent = title.slice(bar + 1).trim()
      heading.prepend(place)
    }
    const section = document.createElement('section')
    section.className = title.startsWith('最後的判斷') ? FINAL_BOX : SECTION_BOX
    section.append(heading, ...body)
    parts.push(section)
  }
  fragment.replaceChildren(...parts)
}

// 粗體先自己轉成 <strong>：Markdown 規定結尾的 ** 前面是標點時，後面要接空白或標點才算結尾，
// 中文「**結論。**後面的說明」會整段顯示成星號（2026-11-12 塔羅解讀要求每節第一句粗體時發現）。
// 只轉同一行內成對的 **，寫到一半還沒收尾的照原樣顯示；之後一樣經過 DOMPurify
const BOLD = /\*\*(?=\S)([^*\n]+?)\*\*/g

export function renderAiMarkdown(markdown: string, options: { sections?: boolean } = {}) {
  if (!markdown) return ''
  const html = marked.parse(markdown.replace(BOLD, '<strong>$1</strong>'), { async: false })
  const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true })
  fragment.querySelectorAll('table').forEach((table) => {
    const isLadder = table.querySelector('thead th')?.textContent?.trim() === '類型'
    table.querySelectorAll('td').forEach((cell) => {
      const text = cell.textContent?.trim() ?? ''
      const tone = STANCE_TONES[text] ?? (isLadder ? LADDER_TONES[text] : undefined)
      if (tone) {
        cell.className = tone
        if (isLadder && text === '現價' && cell.parentElement) cell.parentElement.className = CURRENT_ROW
      } else if (NUMERIC.test(text)) {
        cell.className = 'whitespace-nowrap tabular-nums'
      } else if (!cell.previousElementSibling) {
        // 第一欄是列標題。寫在這裡而不是容器的 [&_td:first-child]：那個選擇器權重較高，會蓋掉上面的漲跌色
        cell.className = 'whitespace-nowrap font-semibold text-ink'
      }
    })
    const wrap = document.createElement('div')
    wrap.className = TABLE_WRAP
    table.replaceWith(wrap)
    wrap.append(table)
  })
  if (options.sections) arrangeSections(fragment)
  const box = document.createElement('div')
  box.append(fragment)
  return box.innerHTML
}

// AI 文字裡的表格樣式（放在包住 v-html 的元素上）：表頭淡底、儲存格內距與分隔線，全部靠左（同 DataTable）。
// - 表格撐滿內容寬度；外框與左右捲在 renderAiMarkdown 包的那層
// - 字級用 caption、行高收緊：表格是整理過的重點，手機上三欄要放得下（內文的行高 leading-7／8 太鬆）
// - 第一欄是列標題（位置、情境、面向、期間），不換行；說明欄至少 7em，不會被擠成一字一行
export const AI_TABLE_CLASS =
  '[&_table]:w-full [&_table]:text-caption [&_table]:leading-[1.6] ' +
  '[&_thead]:bg-tint/5 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-normal [&_th]:text-ink-muted ' +
  '[&_td]:min-w-[7em] [&_td]:border-t [&_td]:border-tint/10 [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_td]:align-top ' +
  '[&_td:first-child]:min-w-0 [&_td:nth-child(2)]:min-w-0'
