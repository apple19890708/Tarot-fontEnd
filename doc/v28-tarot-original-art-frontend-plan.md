# v28 塔羅原創牌面：前端盤點與修改計畫

> 狀態：**已決定、前端已實作**（2026-11-25）
> 後端對應：`../Tarot-backend/doc/v28-tarot-original-art-plan.md`（檔名、尺寸以它為準）

## 0. 使用者決定（2026-11-25）

| 問題 | 決定 |
| --- | --- |
| RWS 原版 | **留著**，仍是預設 |
| 新的原創 SVG | **取代像素版**，成為第二種牌面風格「水彩」 |
| 像素版 | **不保留**：刪掉 `src/lib/pixelTarot/`（約 70KB 的動態載入 chunk） |
| 牌背 | **不動**（`pixelArt.ts` 的塔羅牌背維持現狀） |

這和後端計畫原本的建議（資料庫改指向 SVG、三選一）不同，影響見第 3 節。

## 1. 背景

- 塔羅牌面是後端 `public/cards/*.jpg`（公共領域 RWS 1909），由後端 `/cards` 靜態提供；dev 時走 Vite proxy（`vite.config.ts` 的 `'/cards'`）。資料庫 `Card.image` 存 `/cards/major-00-fool.jpg` 這種路徑。
- 後端工作區畫 78 張原創 SVG（和 v27 雷諾曼同風格），放在**同一個資料夾**、**同一個檔名只換副檔名**：`major-00-fool.svg`～`major-21-world.svg`、`{wands|cups|swords|pentacles}-{01..14}.svg`；350×600（7:12）。

## 2. 前端的做法

資料庫維持原版路徑（`.jpg`），**由前端依使用者選的風格換副檔名**，和以前像素版由前端依檔名對牌是同一種做法：

- `cardStyle.ts`：`CardStyle = 'original' | 'watercolor'`。`cardImageUrl()` 在水彩版時把 `/cards/<slug>.jpg` 換成 `/cards/<slug>.svg`（`watercolorImagePath()`）；其他路徑（雷諾曼 `/lenormand/`、其他格式）原樣回傳。
- localStorage 舊值 `'pixel'` 讀進來當 `'watercolor'`（`parseCardStyle()`），選過「另一種風格」的人照樣看到另一種。
- `FloatingMenu.vue`：牌面風格選項「原版／水彩」。
- 刪除 `src/lib/pixelTarot/`（`engine.js`、`engine.d.ts`），沒有其他地方引用。
- 測試：`src/lib/cardStyle.test.ts`。

## 3. 盤點：每個用到塔羅圖片的地方

全部經過 `cardImageUrl()`，所以元件都不用改：

| 位置 | 備註 |
| --- | --- |
| `StepDraw.vue`（`<img>` 兩處、傳給 `FlyingCard` 的 `:image`） | 不用改 |
| `FlyingCard.vue` | `object-cover`；SVG 7:12 和牌格一樣，不會裁 |
| `StepResult.vue`、`SpreadLayout.vue`（有 `failedImages` 退回）、`SpreadSlots.vue` | 不用改 |
| `DailyCardFace.vue`、`CalendarDayDetail.vue` | 不用改 |
| `FollowUpPanel.vue`、`ReadingAnalysisPanel.vue` | 不用改 |
| `recordExport.ts` → `recordPdf.ts`（html2canvas-pro） | 程式不用改，水彩版**要實測**（第 5 節） |
| `components/lenormand/*` | `/lenormand/` 路徑不受換副檔名影響 |
| `pixelArt.ts` 牌背 | 不動 |
| `vite.config.ts` proxy `'/cards'` | 同一個路徑前綴，不用改 |

## 4. 舊紀錄的 `.jpg` 路徑

因為資料庫維持 `.jpg`、jpg 檔也保留，**不需要任何遷移**：

- `Reading`／追問只存 `cardId`，圖片讀取時從 `Card` 查。
- `DailyCard.image` 快照是 `.jpg`，前端一樣換副檔名。
- sessionStorage 的結果快照也是 `.jpg`，同上。

**後端要配合調整**（已通知 `tarot-art-backend`）：

- **不要**跑 `switchCardImages.js --to svg` 把 `Card.image` 改成 `.svg`；那支腳本可以不寫。若資料庫被改成 `.svg`，前端的「原版」會變成顯示水彩（換副檔名只處理 `.jpg → .svg`，不反向）。
- jpg 一定要保留（原版用）。
- `/cards` 加 `gzipStatic`（只處理 `.svg`）照原計畫。
- 預設仍是原版，不需要 D3 的「經典」選項；選單就是「原版／水彩」兩選一。

## 5. 部署順序與風險

- **前端比後端的 SVG 先上線時**：選「水彩」的人（含舊的像素版使用者）會看到破圖，只有 `SpreadLayout` 有失敗退回。所以**要等後端 78 張 SVG 都部署到 Cloud Run 後，前端再推上 main**（或前後端同一次推）。
- **PDF 匯出**（html2canvas-pro）：`<img src=".../cards/xxx.svg?pdf=1" crossorigin="anonymous">`。
  - SVG 要有 `width`/`height`（後端計畫已是 350×600），否則部分瀏覽器 `naturalWidth` 是 0 畫不出來。
  - `<img>` 裡的 SVG 載不到網頁字型，牌名會用系統字型（後端沿用雷諾曼的字型備援清單）。
  - 紙紋濾鏡 `feTurbulence`：Chrome 畫進 canvas 正常，Safari 要實測。
  - 雷諾曼沒有 PDF 匯出，「SVG 進 html2canvas」這條路還沒實測過。若畫不出來，備案：`loadImages()` 先把 `.svg` 畫到 offscreen canvas 轉 PNG 再交給 html2canvas（只影響匯出）。

## 6. 驗證

- 已跑：`npm run check:rules && npm run build && npm test`。
- 等後端 SVG 產生後要看（開 5180／4100，用完關掉）：切到水彩後抽牌飛牌、結果、牌陣、每日一牌、月曆、追問、組合分析縮圖、PDF 匯出（含逆位）、手機寬度；切回原版確認是 RWS。
- 這裡無法驗證：Safari／iOS 的 SVG 濾鏡畫進 PDF、線上 Cloud Run 的 gzip 與快取 —— 部署後用手機實際切一次水彩、匯出一次 PDF。
