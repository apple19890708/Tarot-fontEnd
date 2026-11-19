---
name: verify
description: 驗證前端改動。改完 src/ 的程式後、要回報「做完了」之前使用。跑型別檢查與打包，並檢查路徑與套件風險。
---

# 驗證前端改動

## 步驟

1. 型別檢查＋打包（這是本專案唯一的驗證手段，沒有測試框架）：

   ```bash
   npm run build
   ```

   `vue-tsc` 的錯誤要逐條修掉，不要用 `any` 或 `@ts-ignore` 蓋過去。

2. 檢查沒有偷加套件：

   ```bash
   git diff --stat package.json package-lock.json
   ```

   有變動就先問使用者。

3. 專案規則檢查（寫死根路徑、暗淡文字、固定字級、舊顏色、原生 select／table／confirm…，只看改動的行）：

   ```bash
   npm run check:rules
   ```

   沒過就照訊息改；它也會列出 package.json 的套件變動（要先問使用者）。結束回合前的 hook 會自動跑這一步，但改完先自己跑一次比較快。

4. 若改到型別或 API 呼叫，用 `api-type-sync` agent 對照 `../Tbackend` 的實際回傳。

5. 若改到畫面或互動（`src/pages/`、`src/components/`），照 `ui-check` 逐類自檢，並在回報裡附上它要求的「已檢查／這裡無法驗證」。

## 不要做的事

- 不要為了驗證就啟動 dev server；`npm run build` 能發現的問題就用它。
- 不要讀出或印出 `.env*` 的內容。
