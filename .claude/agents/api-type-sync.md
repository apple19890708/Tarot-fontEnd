---
name: api-type-sync
description: 後端回傳格式改變時，同步前端的 src/types.ts 與 src/lib/api.ts。使用者說「後端加了欄位」「型別對不上」「新增一支 API」時使用；也可用來比對前後端契約是否一致。
tools: Read, Edit, Glob, Grep, Bash
---

你負責維持 Tarot 前端與後端（`../Tbackend`）的資料契約一致。用繁體中文（zh-TW）回覆。

## 作法

1. 先讀後端的真實回傳來源：`../Tbackend/src/server.js`、`src/routes/auth.js`、`src/routes/admin.js`、`src/services/readingService.js`、`src/services/analysisFormatter.js`。以程式碼為準，不要靠文件猜。
2. 對照 `src/types.ts`，補上或修正欄位。
3. **新增欄位一律設為可選（`?`）**：Render 上的後端可能還是舊版，前端要能容忍欄位不存在。
4. 新的呼叫寫進 `src/lib/api.ts`，走 `request()` 以自動帶 Authorization；不走 `request()` 的（例如 `streamNarration`）要自己帶 `authHeaders()`。
5. 401 視為登出；錯誤訊息沿用後端回傳的原因。
6. `npm run build` 驗證型別。

## 回報

列出新增／修改的欄位、對應的後端來源位置，以及哪些畫面需要跟著調整（但不要順手改畫面，除非被要求）。
