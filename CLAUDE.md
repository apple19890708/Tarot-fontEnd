# Tarot 前端（Tfontend）

塔羅占卜的前台。後端在相鄰的 `../Tbackend`，兩者常一起修改。

## 溝通

- 一律使用繁體中文（zh-TW）回覆與撰寫註解；程式識別字維持英文。

## 技術與指令

- Vue 3（`<script setup lang="ts">`）+ TypeScript + Vite 7 + Tailwind CSS 4 + vue-router 4
- `npm run build`：型別檢查（vue-tsc）＋打包。改完程式一律用它驗證，不需要啟動 dev server。
- 沒有測試框架；不要自行加入新套件，除非先詢問。

## 程式結構

- `src/pages/HomeView.vue`：主畫面（抽牌、牌卡、AI 解讀、組合分析）
- `src/components/ReadingAnalysisPanel.vue`：規則引擎的組合分析（可折疊的「判斷依據」）
- `src/lib/api.ts`：所有後端呼叫集中在這裡
- `src/types.ts`：對應後端回傳的型別
- `src/lib/session.ts`：token（localStorage）與登入狀態；`src/lib/auth.ts`：login／register／logout／restore，元件只 import 這一個
- `src/pages/LoginView.vue`、`RegisterView.vue`、`AdminUsers.vue`：會員與管理者頁

## 編輯規則

- **解讀文字由後端產生**：牌義、組合分析、AI 解讀都直接顯示後端的 `text`。前端只用結構化欄位做標籤、顏色、統計，不自行組句子，也不在前端重寫規則（例如大牌元素表）。
- **型別跟著後端走**：後端回傳格式改了，同步更新 `src/types.ts`。新增的欄位設為可選（`?`），因為 Render 上的後端可能還是舊版。
- **沿用既有樣式**：深色玻璃質感（`bg-white/5`、`border-white/10`、`rounded-[1.75rem]`、amber／rose 點綴）。延續現有 Tailwind class，不另外寫 CSS。
- **AI 解析權限**：`canUseAi`（admin 或被開通的 member）只用來決定畫面顯示哪一種提示，真正的放行在後端；收到 403 要把原因顯示出來，不要只說失敗。
- **權限**：路由用 `meta.auth`／`meta.role`／`meta.guest` 宣告，判斷集中在 `router.beforeEach`，元件不要自己擋。守衛會先 `await restore()`，不要繞過它。
- **帶 token**：`api.ts` 的 `request()` 會自動加 Authorization；不走 `request()` 的呼叫（例如 `streamNarration`）要自己帶 `authHeaders()`。收到 401 一律當成登出。
- 非同步請求要處理載入中、失敗兩種狀態；可能被重複觸發的請求要忽略過期的回應（參考 `loadNarration` 的 request id 作法）。

## 環境設定

- `.env`：`VITE_API_BASE_URL` 指向 Render 上的後端。
- `.env.local`（不進 git）：`VITE_API_BASE_URL=` 留空，改走 Vite proxy 連本機後端。
- 不要讀出或印出 `.env*` 的內容到對話中。

## 執行伺服器（重要）

使用者自己會在 **5173（前端）** 與 **4000（後端）** 跑 `npm run dev`。Claude 不得干擾：

1. 優先用 `npm run build`、後端的 `npm test` 驗證，能不開伺服器就不開。
2. 必須開伺服器時，先用 `netstat -ano | grep -E ":(4000|4100|5173|5180) "` 確認佔用狀況，並改用自己的 port：
   - 前端：`API_PROXY_TARGET=http://localhost:4100 npx vite --port 5180 --strictPort`
   - 後端：見 `../Tbackend/CLAUDE.md`（port 4100）
3. **測試結束後必須自己關閉**：記下自己啟動的程序 PID，用 `taskkill /PID <pid> /T /F` 連同子程序一起結束（Windows 上只停止背景工作不會結束子程序），再用 `netstat` 確認 port 已釋放。
4. 絕對不要結束不是自己啟動的程序（例如使用者在 5173／4000 的伺服器）。
