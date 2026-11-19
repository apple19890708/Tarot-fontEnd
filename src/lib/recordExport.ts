import { cardImageUrl } from './cardStyle'
import { formatNumber, formatSigned } from './marketChart'
import type {
  FinanceNewsAnalysisRef,
  FollowUpCard,
  FollowUpRound,
  MarketAlertTarget,
  ReadingCard,
  ReadingResponse,
  StockAnalysisSummary,
  StockHolding,
} from '../types'

// 紀錄匯出（v13 階段 5）：塔羅、個股 AI 分析、財經新聞 AI 分析，每一筆匯出成一份 PDF。
// 這裡先把內容整理成一份 Markdown（AI 的全文本來就是 Markdown），再交給 recordPdf.ts 排成 A4。
// 內文一律是後端給的文字（牌義、組合分析、AI 全文），這裡只排標題與欄位名稱，不自己組句子。

export interface ExportFile {
  // 不含副檔名
  filename: string
  content: string
}

// ---- 共用 ----

function taipeiDateTime(iso: string | null | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

// 檔名用的日期：2026-11-19（台北時間）；沒有時間就用今天
function fileDate(iso: string | null | undefined) {
  const date = iso ? new Date(iso) : new Date()
  const valid = Number.isNaN(date.getTime()) ? new Date() : date
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(valid)
}

// 檔名不能有的字元換掉，太長的截斷（問題可能很長）
function safeName(text: string, max = 30) {
  const cleaned = text.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

function buildFile(parts: string[], filename: string): ExportFile {
  // 空段落拿掉，段落之間空一行
  const content = `${parts.filter((part) => part.trim()).join('\n\n').trim()}\n`
  return { filename, content }
}

function bulletList(lines: (string | null | undefined)[]) {
  return lines
    .filter((line): line is string => Boolean(line?.trim()))
    .map((line) => `- ${line.trim()}`)
    .join('\n')
}

// AI 全文裡的 ## 標題往下降一級，才不會和匯出檔本身的章節同一層
function nestHeadings(markdown: string, extra = 1) {
  const prefix = '#'.repeat(extra)
  return markdown.replace(/^(#{1,5}) /gm, (_, hashes: string) => `${prefix}${hashes} `)
}

// PDF 套件（jspdf、html2canvas）只在按下匯出時才載入，不拖慢一般頁面
export async function downloadExport(file: ExportFile) {
  const { renderMarkdownPdf } = await import('./recordPdf')
  await renderMarkdownPdf(file.content, `${file.filename}.pdf`)
}

// ---- 塔羅 ----

export interface TarotExportInput {
  reading: ReadingResponse
  // 紀錄的建立時間；還沒保存的結果不給，用匯出當下的時間
  createdAt?: string | null
  stockMode?: boolean
  narrationText?: string
  followUps?: FollowUpRound[]
  followUpText?: string
}

const orientationLabel = (value: 'upright' | 'reversed') => (value === 'upright' ? '正位' : '逆位')

// ---- 牌卡圖片 ----
// 牌卡的部分直接寫成 HTML（Markdown 放不了「圖片在左、牌義在右」，也沒辦法把逆位的圖轉過來）。
// class 都是 rp- 開頭，外觀由 recordPdf.ts 的紙張樣式負責。圖片和畫面上一樣，跟著使用者選的牌面風格。
// 注意：HTML 區塊在 Markdown 裡遇到空行就結束，所以一段 HTML 裡不能有空行
function escapeHtml(text: string) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch)
}

function cardImg(entry: ReadingCard | FollowUpCard, cls: string) {
  const url = cardImageUrl(entry.card.image)
  if (!url) return ''
  const rev = entry.orientation === 'reversed' ? ' rp-rev' : ''
  return `<img class="${cls}${rev}" src="${escapeHtml(url)}" alt="${escapeHtml(entry.card.nameZh)}">`
}

// 一排牌面：圖＋位置、牌名、正逆位（和畫面上牌陣區的資訊一樣）
function cardStrip(cards: (ReadingCard | FollowUpCard)[], positionOf: (index: number) => string) {
  const figures = cards
    .map((entry, index) => {
      const caption = [positionOf(index), entry.card.nameZh, orientationLabel(entry.orientation)]
        .filter(Boolean)
        .map(escapeHtml)
        .join('<br>')
      return `<figure class="rp-fig">${cardImg(entry, 'rp-img')}<figcaption>${caption}</figcaption></figure>`
    })
    .join('')
  return `<div class="rp-spread">${figures}</div>`
}

// 每張牌一個區塊：左邊縮圖，右邊位置、牌名、關鍵字、牌義
function tarotCards(reading: ReadingResponse) {
  const positionOf = (index: number) => reading.cards[index]?.position?.label ?? `第 ${index + 1} 張`
  const list = (lines: string[]) => (lines.length ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : '')
  const blocks = reading.cards.map((entry, index) => {
    const body: string[] = [
      `<p class="rp-pos">${escapeHtml(positionOf(index))}</p>`,
      `<h3>${escapeHtml(entry.card.nameZh)}（${orientationLabel(entry.orientation)}）</h3>`,
    ]
    if (entry.card.keywords.length) body.push(`<p class="rp-kw">關鍵字：${escapeHtml(entry.card.keywords.slice(0, 4).join('、'))}</p>`)
    if (entry.meaning?.length) {
      for (const group of entry.meaning) body.push(`<p class="rp-group">${escapeHtml(group.heading)}</p>${list(group.lines)}`)
    } else {
      if (entry.interpretation) body.push(`<p>${escapeHtml(entry.interpretation)}</p>`)
      body.push(list(entry.highlights))
    }
    return `<div class="rp-card">${cardImg(entry, 'rp-thumb')}<div class="rp-card-body">${body.join('')}</div></div>`
  })
  return [cardStrip(reading.cards, positionOf), ...blocks].join('\n\n')
}

function tarotAnalysis(reading: ReadingResponse) {
  const analysis = reading.analysis
  if (!analysis) return ''
  const cardLabel = (index: number) => {
    const entry = reading.cards[index]
    if (!entry) return `第 ${index + 1} 張`
    const reversed = entry.orientation === 'reversed' ? '逆' : ''
    return `${entry.card.nameZh}${reversed}（${entry.position?.label ?? `第 ${index + 1} 張`}）`
  }

  // 標題和畫面上「判斷依據」的段落一致
  const sections: string[] = ['## 判斷依據']
  const add = (title: string, body: string | null | undefined) => {
    if (body?.trim()) sections.push(`### ${title}\n\n${body.trim()}`)
  }
  add('整體看起來', analysis.quant?.text)
  add('整體在說什麼', analysis.theme.text)
  add('牌面有回答到你的問題嗎', analysis.question?.text)
  add('這件事有多大', analysis.weights?.text)
  add('各個位置看出什麼', bulletList(analysis.positions?.map((finding) => finding.text) ?? []))
  add(
    '牌跟牌之間的關係',
    analysis.pairs
      .map(
        (pair) =>
          `- ${cardLabel(pair.from)} ──${pair.kindLabel ?? '對應'}── ${cardLabel(pair.to)}・${pair.relationLabel}  \n  ${pair.text}`,
      )
      .join('\n'),
  )
  const stage = analysis.numberStage
  if (stage) {
    // 有時間軸的資料（v11）就列出每一格，沒有就用整段文字
    const steps = stage.steps?.length
      ? bulletList(stage.steps.map((step) => `${step.label ? `${step.label}：` : ''}${step.name} ${step.mark}・${step.stageLabel}`))
      : ''
    add('走到哪個階段', steps && stage.summary !== undefined ? [steps, stage.summary].filter(Boolean).join('\n\n') : stage.text)
  }
  add('元素', analysis.theme.elementNumberText)
  add('宮廷牌的影響', [analysis.courtSummary, bulletList(analysis.courts.map((court) => court.text))].filter(Boolean).join('\n\n'))
  add('互相矛盾、還不明朗的地方', bulletList([...analysis.conflicts, ...analysis.uncertainties].map((note) => note.text)))
  return sections.length > 1 ? sections.join('\n\n') : ''
}

export function tarotExport(input: TarotExportInput): ExportFile {
  const { reading } = input
  const title = input.stockMode ? `股市諮詢 · ${reading.spread.name}` : reading.spread.name || '自選牌'
  const header = [
    `# ${title}`,
    bulletList([
      `問題：${reading.question || '（未填寫問題）'}`,
      `時間：${taipeiDateTime(input.createdAt ?? new Date().toISOString())}`,
      `牌陣：${reading.spread.name || '自選牌'}・${reading.cards.length} 張`,
    ]),
  ].join('\n\n')

  const parts = [header, `## 抽到的牌\n\n${tarotCards(reading)}`]

  if (input.narrationText?.trim()) {
    parts.push(`## ${input.stockMode ? 'AI 股市分析' : 'AI 解讀'}\n\n${nestHeadings(input.narrationText.trim())}`)
  }

  const rounds = input.followUps ?? []
  if (rounds.length) {
    const roundText = rounds
      .map((round, index) => {
        // 補充牌也放牌面圖
        const cards = round.cards.length ? cardStrip(round.cards, () => '補充牌') : '補充牌：—'
        return `### 追問 ${index + 1}：${round.question || '（未填寫）'}\n\n${cards}`
      })
      .join('\n\n')
    const answer = input.followUpText?.trim() ? `### AI 回答\n\n${nestHeadings(input.followUpText.trim(), 2)}` : ''
    parts.push(['## 追問與補充牌', roundText, answer].filter(Boolean).join('\n\n'))
  }

  if (!input.stockMode) {
    parts.push(tarotAnalysis(reading))
    if (reading.guidance) parts.push(`## 結語\n\n${reading.guidance}`)
  }

  parts.push('---\n\n匯出自 Tarot Bar')
  const name = safeName(reading.question || title)
  return buildFile(parts, `塔羅-${fileDate(input.createdAt)}-${name}`)
}

// ---- 個股 AI 分析 ----

export interface StockExportInput {
  target: MarketAlertTarget
  quote?: StockAnalysisSummary['quote'] | null
  createdAt: string | null
  text: string
  holding?: StockHolding | null
}

export function stockCodeOf(target: MarketAlertTarget) {
  return target.market === 'tw' && target.kind === 'stock' ? target.code : target.symbol || target.code
}

export function stockAnalysisExport(input: StockExportInput): ExportFile {
  const code = stockCodeOf(input.target) ?? ''
  const name = `${input.target.name} ${code}`.trim()
  const info: string[] = [`時間：${taipeiDateTime(input.createdAt ?? new Date().toISOString())}`]
  const quote = input.quote
  if (quote && quote.price !== null) {
    info.push(
      `分析時股價：${formatNumber(quote.price)} ${formatSigned(quote.change)}（${formatSigned(quote.changePct, '%')}）${quote.date ? `・${quote.date}` : ''}`,
    )
  }

  const parts = [`# ${name} · AI 深度分析`, bulletList(info)]

  const holding = input.holding
  if (holding) {
    // 欄位和畫面上的持股摘要（StockHoldingSummary）一致
    parts.push(
      `## 當時的持股\n\n${bulletList([
        `持有：${formatNumber(holding.quantity, 3)} ${holding.market === 'tw' ? '張' : '股'}・均價 ${formatNumber(holding.avgCost)}`,
        `市值：${formatNumber(holding.marketValue, 0)}`,
        `未實現損益：${formatSigned(holding.unrealized)}${holding.unrealizedPct !== null ? `（${formatSigned(holding.unrealizedPct, '%')}）` : ''}`,
        `總報酬：${formatSigned(holding.totalReturn)}`,
      ])}`,
    )
  }

  parts.push(`## AI 分析\n\n${nestHeadings(input.text.trim())}`)
  parts.push('---\n\nAI 只根據當時的資料撰寫，僅供參考，不是投資建議。匯出自 Tarot Bar')
  return buildFile(parts, `個股分析-${fileDate(input.createdAt)}-${safeName(name)}`)
}

// ---- 財經新聞 AI 影響分析 ----

export interface FinanceNewsExportInput {
  scopeText: string
  createdAt: string | null
  newsCount: number | null
  text: string
  news: FinanceNewsAnalysisRef[]
}

export function financeNewsExport(input: FinanceNewsExportInput): ExportFile {
  const info = [
    `時間：${taipeiDateTime(input.createdAt ?? new Date().toISOString())}`,
    `範圍：${input.scopeText}${input.newsCount !== null ? `・${input.newsCount} 則新聞` : ''}`,
  ]
  const parts = [`# AI 影響分析`, bulletList(info), `## 分析\n\n${nestHeadings(input.text.trim())}`]

  if (input.news.length) {
    // 順序就是 AI 引用的 [n]
    const list = input.news
      .map((cited, index) => {
        const meta = [cited.sourceLabel, taipeiDateTime(cited.publishedAt)].filter(Boolean).join('・')
        const title = cited.url ? `[${cited.title}](${cited.url})` : cited.title
        return `${index + 1}. ${title}${meta ? `　${meta}` : ''}`
      })
      .join('\n')
    parts.push(`## 引用的新聞\n\n文中的 [n] 對應下面第 n 則。\n\n${list}`)
  }

  parts.push('---\n\nAI 只根據當時的新聞標題與摘要撰寫，族群與個股是依產業關聯推估，僅供參考，不是投資建議。匯出自 Tarot Bar')
  return buildFile(parts, `財經新聞分析-${fileDate(input.createdAt)}-${safeName(input.scopeText)}`)
}
