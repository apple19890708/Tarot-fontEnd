// 財經新聞（v17 規格 G）
import type { StockAnalysisQuota } from './marketTrack'

// ===== 財經新聞（v17 規格 G）=====
export type FinanceNewsRegion = 'tw' | 'intl'
export type FinanceNewsScopeRegion = 'all' | FinanceNewsRegion

export interface FinanceNewsItem {
  id: string
  source: string
  sourceLabel: string
  region: FinanceNewsRegion
  lang: 'zh' | 'en'
  title: string
  // 來源給的摘要（純文字，最多 300 字），可能是空字串
  summary: string
  url: string
  publishedAt: string
  // 主題 key（對應 FinanceNewsView.themes）
  themes: string[]
  // 標題裡提到的台股代號
  codes: string[]
  // 其中在我追蹤清單裡的代號
  watched?: string[]
  // 語氣（漲跌用詞統計）：打開過新聞重點的用全文算，其他用標題＋摘要；舊版後端沒有
  tone?: 'positive' | 'negative' | 'neutral'
  // 同一件事的報導有相同的值（群裡最新那則的 id）；舊版後端沒有，就當成各自一則
  clusterId?: string
}

export interface FinanceNewsTheme {
  key: string
  label: string
}

export interface FinanceNewsSourceStatus {
  key: string
  label: string
  region: FinanceNewsRegion
  // null：這次啟動後還沒抓過
  ok: boolean | null
  count: number
}

export interface FinanceNewsAnalysisSummary {
  id: string
  region: FinanceNewsScopeRegion
  theme: string | null
  // 範圍的中文說明（「國內新聞，主題「AI／資料中心」」）；舊版後端沒有
  scopeLabel?: string
  newsCount: number
  model: string
  createdAt: string
}

export interface FinanceNewsAnalysisRef {
  title: string
  sourceLabel: string
  region: string
  url: string
  publishedAt: string | null
}

export interface FinanceNewsAnalysisDetail extends FinanceNewsAnalysisSummary {
  text: string
  // 當時交給 AI 的新聞，順序就是 AI 引用的 [n]
  news: FinanceNewsAnalysisRef[]
}

export interface FinanceNewsView {
  news: FinanceNewsItem[]
  themes: FinanceNewsTheme[]
  status: { syncedAt: string | null; sources: FinanceNewsSourceStatus[] }
  quota: StockAnalysisQuota
  latest: FinanceNewsAnalysisDetail | null
}

// 新聞重點彈窗（不呼叫 AI）：後端節錄的重點句與規則標籤
export interface FinanceNewsDigestStock {
  market: 'tw' | 'us'
  code: string | null
  symbol: string
  name: string
  // 在我的追蹤清單裡
  watched?: boolean
}

export interface FinanceNewsDigestGroup {
  theme: string
  label: string
  tw: string[]
  us: string[]
}

export interface FinanceNewsDigest {
  // article：從原文全文節錄；summary：原文讀不到，只用來源摘要
  basis: 'article' | 'summary'
  // 原文有讀到（basis 是 summary 時：true 代表原文只有表格、挑不出句子；false 代表原站不開放讀取）。舊版後端沒有這個欄位
  articleRead?: boolean
  // 原文句子節錄（不是改寫），照原文順序
  points: string[]
  // 標題與重點句的漲跌用詞統計
  tone: 'positive' | 'negative' | 'neutral'
  stocks: FinanceNewsDigestStock[]
  groups: FinanceNewsDigestGroup[]
  createdAt: string
}
