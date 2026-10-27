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

3. 檢查沒有寫死根路徑（線上掛在 `/Tarot-fontEnd/`）：

   ```bash
   git diff -- src | grep -n "\"/\|'/\|(\`/" | grep -v "BASE_URL"
   ```

   命中的地方改用 `import.meta.env.BASE_URL` 或 router 的相對路徑。

4. 若改到型別或 API 呼叫，用 `api-type-sync` agent 對照 `../Tbackend` 的實際回傳。

## 不要做的事

- 不要為了驗證就啟動 dev server；`npm run build` 能發現的問題就用它。
- 不要讀出或印出 `.env*` 的內容。
