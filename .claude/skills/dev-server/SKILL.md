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

**測試後端（4100）要允許 5180 的來源**：後端的 CORS 只放行 `CLIENT_URL` 清單，本機設定通常只有 5173。Vite 的 proxy 會把瀏覽器的 `Origin: http://localhost:5180` 原樣轉過去，POST（登入、開關權限）就被擋，畫面只顯示「伺服器發生錯誤，請稍後再試。」，後端 log 是「來源不在 CLIENT_URL 允許清單內」；curl 不帶 Origin，所以用 curl 測不出來。啟動後端時用環境變數蓋掉（dotenv 不會覆蓋已存在的環境變數），不要改 `.env` 檔：

```bash
cd ../Tbackend && CLIENT_URL=http://localhost:5173,http://localhost:5180 PORT=4100 node src/server.js
```

啟動後 log 要看到 `CORS origin: http://localhost:5173, http://localhost:5180`。（例：v27 階段 1F 端對端測試時登入失敗，2026-11-25）

**收尾時要結束整條程序鏈**：`npx vite` 會是 `node(npx) → cmd → node(vite) → esbuild`，netstat 看到的 PID 是 vite 那層；用 PowerShell 的 `Get-CimInstance Win32_Process -Filter "ProcessId=<pid>"` 往上找到 npx 那層，對它 `taskkill /T /F`，才不會留下 cmd 和 npx。

**要看打包後的結果（`dist/`，例如 CSP、各頁的 HTML）時不要用 `vite preview`**：preview 的 base 是 `/`，打包出來的路徑卻是 `/Tarot-fontEnd/…`，JS 和 manifest 全部回成 index.html，畫面一片空白、看起來像 CSP 擋掉了（2026-11-17 測 CSP 時誤判過）；preview 也會套用 dev 的 proxy，打到使用者 4000 的後端。改成把 `dist` 複製到 scratchpad 的 `site/Tarot-fontEnd/`，在 `site` 裡跑 `python -m http.server 5180 --bind 127.0.0.1`，再用無頭 Chrome `--dump-dom --enable-logging=stderr` 看畫面與 console（CSP 違規會出現 `Refused to …`）。

## 3. 收尾（必做）

```bash
taskkill /PID <pid> /T /F
netstat -ano | grep ":5180 "
```

Vite 會開子程序，一定要加 `/T`。最後用 `netstat` 確認 5180 已釋放。

## 禁止

- 不要結束不是自己啟動的程序。
- 不要在畫面上按會觸發 AI 解讀的按鈕（後端每次約 US$0.04），除非當下取得使用者明確同意。
