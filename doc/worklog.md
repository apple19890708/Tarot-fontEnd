# 工作紀錄（前端）

## 2026-10-07

### 專案設定
- Clone 專案並安裝依賴；補上原本漏列的 `vue-router`，build 恢復正常
- 新增 `.env.local`（`VITE_API_BASE_URL=` 留空），本機開發改走 Vite proxy 連本機後端
- `vite.config.ts` 的 proxy 目標可用 `API_PROXY_TARGET` 覆蓋（預設 `http://localhost:4000`）

### 組合分析
- `types.ts` 新增 `ReadingAnalysis` 等型別（欄位皆為可選，相容舊版後端）
- 新增 `ReadingAnalysisPanel.vue`：整體主題、逐組分析、宮廷牌角色、矛盾點與不確定性
- 牌卡加上焦點牌、元素、宮廷牌角色標記；分析收在可折疊的「查看判斷依據」
- 第二版組合分析：「判斷依據」新增問題對照（對焦／部分回應／偏離）、份量分析（議題份量與阻力三格傾向條）、位置解讀、數字階段

### AI 解讀（這組牌想說的事）
- 抽牌後改為按「請 AI 解讀這組牌」才呼叫 AI，降低費用
- 以串流方式邊產生邊顯示，可隨時「停止」並保留已產生的內容，也可重新產生
- 重新抽牌或離開頁面時自動中斷 AI 生成
- AI 回覆以 Markdown 顯示（`marked` + `dompurify` 防 XSS）

### 其他
- 新增 `CLAUDE.md`：編輯規則、測試伺服器使用 5180 port 且結束後自行關閉

### 待辦
- 點選判斷時標示依據牌（後端已提供 `evidence`）
- 牌陣／自由抽牌切換（等後端階段 4）

## 2026-10-12

### 互動模式：手動選牌
- 占卜設定加「抽牌／選牌」分頁，共用問題輸入框
- 選牌模式：可搜尋的牌卡清單（大牌／四花色分組）點選加入；已選牌可切正逆位、移除、原生拖曳換位；上限 10 張
- 新增 `fetchCards`、`createManualReading` 與 `CardSummary`、`ManualCardPick` 型別；`ReadingCard.position` 改為可選
- 牌卡顯示縮圖，逆位旋轉 180°，缺圖退回純文字；圖片經 `/cards` proxy（`vite.config.ts` 新增）
- 拖曳改為即時重排：用 `TransitionGroup` 的 `move-class` 做位移動畫（Tailwind class，無自訂 CSS），拖曳中的牌淡化並加邊框，其他牌平順讓位；加 150ms 冷卻避免滑動中重複觸發 dragenter 造成彈跳
- 牌卡改為固定高度（26rem）＋ 內容區捲動，表頭（圖、牌名、標籤）固定不捲
- 牌義改用後端的 `meaning` 分組顯示（核心訊息／心理層面／現實狀況／行動建議），舊版後端退回 `highlights`
- 所有按鈕補上 `cursor-pointer`（Tailwind v4 預設不再給 button pointer 游標）
- 新增問題類型選單（自動判斷／工作／財務／感情／人際／學業決策／綜合），送出 `domain` 讓權重計算更準
- 新增 `QuantPanel.vue`：指向儀表（只顯示分級與指針，不顯示分數）、四軸雷達圖、動能／阻力傾向條、貢獻排行
- 新增圖表套件 `chart.js` + `vue-chartjs`，僅註冊雷達圖所需模組；儀表與傾向條仍用 Tailwind
- 牌卡移除與「核心訊息」重複的開場句（無分組牌義時才顯示，保留舊版相容）
- 逐組分析每張牌補上縮圖，逆位旋轉 180°
- `imageUrl` 與 `API_BASE_URL` 原在 HomeView 與 api.ts 各一份，抽到 `api.ts` 共用
- 區塊標題全面口語化（整體在說什麼／這件事有多大／牌跟牌之間的關係／走到哪個階段等）；阻力只在指向分析顯示一次
- 下拉選單改為自製的 `SelectField.vue`（button + listbox）：原生 select 的箭頭不受 padding 影響、選項清單也無法套深色樣式，只能自行實作。支援鍵盤操作（上下鍵、Home/End、Enter、Esc）、點外面關閉、選中打勾；問題類型與牌陣兩處共用
- 牌跟牌之間的關係：牌名旁補上正位／逆位標籤（逆位用紅色區別）
