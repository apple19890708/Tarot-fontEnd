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

## 2026-10-27

### Claude 規範
- 新增 `.claude/`：agents（`vue-ui-dev`、`api-type-sync`）與 skills（`verify`、`dev-server`、`worklog`）
- `CLAUDE.md` 增列「Claude 規範」段落；後端 `../Tbackend/.claude/` 有對稱的一套

### 輸入已抽到的牌：清單改版
- 選牌清單從膠囊換行改為格狀，數字牌一排五張（一到十剛好兩排），**宮廷牌獨立一區**一排四張（一排正好一個花色）（後來改回各花色底下，見下方「導覽與登出」）
- 宮廷牌由後端新的 `kind` 欄位判斷（編號在不同牌組不一致）；舊版後端沒有這個欄位時退回用小牌編號 11～14 判斷
- 版面加寬：這個模式改用整頁寬度（原本被壓在 `max-w-5xl`），右欄 28rem／xl 34rem，牌名不再被截成「權…」

### 手動抽牌：動畫與互動
- `FanDeck.vue` 改寫：進場時牌從中央疊牌逐張轉開成扇形（每張延遲 10ms），重新洗牌會再播一次；
  動畫期間關閉 pointer events，免得牌還在飛就被判定成 hover
- 滑鼠移到牌上（或鍵盤 focus）時該張抬起並放大，邊框與花紋亮起
- **hover 的命中區固定不動**：牌與牌重疊很密，如果讓按鈕本身跟著位移放大，游標會在
  「牌移開 → 離開 → 牌歸位 → 又進入」之間反覆觸發；改成按鈕只負責扇形定位，
  抬起與放大做在內層牌面（`pointer-events-none`）上，並取消原本鄰牌讓位的效果
- 已選取的牌縮小淡出；抽到的牌進入位置時淡入放大（`<Transition>` ＋ Tailwind class，沒有自訂 CSS）
- 全部用 transform／opacity 過渡，`motion-reduce` 時不做動畫

### 我的紀錄（v13）
- 結果頁新增「保存紀錄」按鈕：占卜結果預設不留存，按了才存。未登入時先把結果存進 sessionStorage 快照、
  帶去登入頁，回來還是同一組牌且按鈕狀態正確（已保存就不會再存一次）
- 保存時若已經產生 AI 解讀，會一起送出保存；先保存再請 AI 解讀的話，帶 `readingId` 由後端寫回同一筆
- 新增 `/history` 頁（`meta.auth`）與 `HistoryView.vue`：列表、分頁、點開回顧、刪除
- 刪除採二段式（點一次變「確定刪除？」），不用瀏覽器 confirm
- 詳情直接重用 `StepResult.vue`（新增 `hideFlowActions` 隱藏重抽／重新開始與保存）
- 有 AI 解讀的紀錄直接顯示存下來的那一份；沒有的仍可在這裡請 AI 解讀，解讀完成後存回同一筆
- `api.ts` 新增 `saveReadingRecord`、`fetchReadingHistory`、`fetchReadingDetail`、`deleteReading`；
  `streamNarration` 可帶 `readingId`
- `types.ts` 新增 `ReadingSummary`、`ReadingDetail`、`SaveStatus` 等型別；`CardSummary.kind`／`courtRank`
  設為可選（相容舊版後端）
- 導覽列排除未登入時看不到的頁面（`meta.auth`）

### 其他
- 驗證：`npm run build` 通過；沒有新增套件

### 待辦
- 紀錄的搜尋與匯出（等後端 v13 階段 5）

### 我的紀錄改兩欄（v14）
計畫書：`../Tarot-backend/doc/v14-reading-history-layout-plan.md`

- `HistoryView.vue` 改成兩欄：左欄紀錄清單、右欄所選紀錄的內容；後端 API 沒有改
- 桌機左欄黏在畫面上，可收合成窄欄，收合狀態存 `localStorage`（`tarot_history_index_collapsed`）
- 手機清單點開時滿版、背景不捲動，選了一筆就自動收合
- 左欄一次載入全部摘要（每頁 50、最多兩次請求），新增 `ReadingHistoryIndex.vue`：依年月分組，
  標籤只顯示日期與問題；可用關鍵字（問題、牌名）與「有 AI 解讀」篩選
- 選中的紀錄寫進 `?id=`（`router.replace`），進頁面預設選最新一筆；刪除後改選相鄰的那一筆
- 沒有任何紀錄時，右欄顯示「立即占卜」引導；載入中或失敗時不顯示，避免誤以為紀錄不見
- 驗證：`npm run build` 通過；沒有新增套件。畫面尚未實際看過桌機與手機寬度

### 導覽與登出
- 導覽列依路由名稱亮起目前所在的頁面（紀錄頁帶 `?id=` 也算同一頁）
- 主動登出時清掉暫存的占卜結果（新增 `src/lib/resultSnapshot.ts`，key 只定義在這裡），
  並透過 `auth.ts` 新增的 `onLogout` 通知占卜頁回到步驟 1、清空問題；已保存的紀錄不受影響
- token 過期（401）不算登出，不清結果，讓人重新登入後還能保存
- 選牌清單的宮廷牌放回各花色底下：數字牌一排五張在上，宮廷牌一排四張接在下面
- 驗證：`npm run build` 通過
- 占卜頁滿版：`App.vue` 改成兩列格線（top bar＋撐滿剩餘高度的主內容），占卜頁的步驟卡片吃掉剩下的高度
- 占卜頁頁首（Tarot Divination Studio／塔羅占卜／後端狀態）縮小移到 top bar 左側，取代「Tarot Studio」；
  拿掉「重新檢查 API」按鈕。後端狀態抽成 `src/lib/health.ts`，每一頁的 top bar 都會顯示
- 選牌時下方位置格子會抖動：佔位點與牌圖疊在固定大小的框裡、牌名行預留高度，替換時不再撐開版面
- 手機版：輸入已抽到的牌，牌名清單一排兩張；`<html>` 在 sm 以下基準字級 14px（字級與間距一起縮小）；
  導覽列、步驟列、抽牌模式按鈕不斷字，手機縮小一級字與內距

### 手動抽牌動畫重寫（v15 階段 1～3）
計畫書：`../Tarot-backend/doc/v15-tarot-draw-animation-plan.md`

- 新增套件 `gsap`（3.15.0，經使用者同意）
- `FanDeck.vue`：整個扇形改成單一命中層，用游標相對扇形圓心的角度算出指到哪張，牌本身不再各自 hover；
  指到的牌抬起放大，左右各 3 張依距離抬起並往兩旁讓開（GSAP）。發牌展開改用 GSAP stagger。
  可用鍵盤操作（左右鍵換牌、Enter 選取）。元素 ref 用函式依 index 存放（v-for 的 ref 陣列不保證順序）
- 新增 `FlyingCard.vue`：選牌時替身從扇形飛到位置格並翻面（逆位最後轉半圈）；收回時反向飛回。
  用 `Teleport` 掛到 body（步驟卡片的 backdrop-blur 會困住 fixed 定位）
- 新增 `src/lib/motion.ts`：開啟「減少動態效果」時動畫秒數為 0、飛牌略過
- 驗證：`npm run build` 通過；尚未實際操作確認手感
- 修正：扇形最左邊幾張指不到（命中改以每張牌露出的那一條為準）；右側被指到的牌被壓在下面（層級改為總張數＋1）

### 手動抽牌動畫（v15 階段 4～6）
- `FanDeck.vue` 改成四個階段：洗牌 → 切牌 → 發牌 → 可選牌
- 洗牌：10 張代表牌分成左右兩疊、交錯插回、敲齊後切成三落（約 1.3 秒）
- 切牌：三落牌並排、提示「選一落牌」；選中的那落滑到中央，其他兩落淡出，再從那個位置發牌展開
- 只攤開選中那一落（78 張切三落，每落 26 張），對外發出的 index 仍是 deck 裡的位置，`HomeView` 不用改
- 進來時已有選過的牌（切模式再回來）就直接攤開那張牌所在的那一落，不再切牌
- 手機：點第一下抬起預覽並提示「再點一次抽出這張」，再點同一張才抽出；滑鼠維持點一下就抽
- 驗證：`npm run build` 通過；尚未實際操作確認手感
- 洗牌改為循環播放，直到使用者按「切牌」才收攏並切成三落（新增 splitting 階段）
