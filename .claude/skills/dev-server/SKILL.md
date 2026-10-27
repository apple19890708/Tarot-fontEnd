---
name: dev-server
description: 非開不可時，安全地啟動並關閉前端測試伺服器。使用者自己在 5173 跑 dev server，Claude 一律用 5180 並指向後端 4100。要實際看畫面、驗證互動時使用。
---

# 啟動前端測試伺服器（port 5180）

**前提**：先確認 `npm run build` 真的驗證不了這件事。能不開就不開。

## 1. 確認 port 狀況

```bash
netstat -ano | grep -E ":(4000|4100|5173|5180) "
```

5173／4000 是**使用者的**伺服器，絕對不要碰、不要 kill。

## 2. 啟動（自己的 port，指向自己的後端 4100）

```bash
API_PROXY_TARGET=http://localhost:4100 npx vite --port 5180 --strictPort
```

背景執行並記下 PID。`--strictPort` 讓 port 被佔用時直接失敗，而不是悄悄換號。dev server 的 base 是 `/`（`vite.config.ts` 的 `/Tarot-fontEnd/` 只在 build 生效）。

## 3. 收尾（必做）

```bash
taskkill /PID <pid> /T /F
netstat -ano | grep ":5180 "
```

Vite 會開子程序，一定要加 `/T`。最後用 `netstat` 確認 5180 已釋放。

## 禁止

- 不要結束不是自己啟動的程序。
- 不要在畫面上按會觸發 AI 解讀的按鈕（後端每次約 US$0.04），除非當下取得使用者明確同意。
