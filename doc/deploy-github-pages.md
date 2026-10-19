# 部署到 GitHub Pages

對象：`apple19890708/Tarot-fontEnd`，網址會是
`https://apple19890708.github.io/Tarot-fontEnd/`

前端是純靜態的，後端（API、牌卡圖片、AI 解讀）仍然跑在 Render，兩邊是分開的。

## 已經設定好的部分（程式碼裡）

| 檔案 | 做了什麼 |
|---|---|
| `vite.config.ts` | `npm run build` 時 base 設成 `/Tarot-fontEnd/`；dev server 維持 `/` |
| `.github/workflows/deploy-pages.yml` | push 到 main 就自動 build 並部署 |
| `.github/workflows/frontend-ci.yml` | 原本指向不存在的 `frontend/` 子目錄，已修掉 |
| `../Tbackend/src/server.js` | `CLIENT_URL` 改成可以用逗號分隔多個來源 |

## 你要手動做的三件事

### 1. GitHub Repo：開啟 Pages

Settings → Pages → Build and deployment → **Source 選「GitHub Actions」**。

> 不要選「Deploy from a branch」。這份 workflow 用的是官方的
> `upload-pages-artifact` ＋ `deploy-pages`，不會產生 `gh-pages` 分支。
> （網路上常見的 `peaceiris/actions-gh-pages` 是推到分支的做法，
> 那種要搭配「Deploy from a branch」，兩者不能混。）

### 2. Render 後端：放行新的來源

後端的 CORS 只允許 `CLIENT_URL` 列出來的網域。沒改的話，網頁打得開，
但所有 API 都會被瀏覽器擋掉，而且錯誤訊息很不直覺。

到 Render 的 Environment 設定把 `CLIENT_URL` 改成：

```
http://localhost:5173,https://apple19890708.github.io
```

注意是**網域層級**，不要帶 `/Tarot-fontEnd/` 路徑。改完要 redeploy。

順便確認 Render 上有設 `JWT_SECRET`（沒設的話後端不會啟動）。

### 3. 確認 API 位址

`.env` 裡的 `VITE_API_BASE_URL` 要指向 Render 的後端網址。這個檔案有進版控，
所以 GitHub Actions build 的時候讀得到。

要改用別的後端而不想改 `.env`，可以在
Settings → Secrets and variables → Actions → Variables
新增一個 `VITE_API_BASE_URL`，workflow 會優先用它。

兩邊都空的話 **build 會直接失敗**，這是刻意的——空值會讓前端去打
`github.io/api`，整站 API 404，但畫面上完全看不出原因。

## 推上去

```bash
git add .
git commit -m "chore: 設定 GitHub Pages 部署"
git push origin main
```

到 Actions 分頁看 `Deploy to GitHub Pages`，綠勾之後網址就會出現在
Settings → Pages，或是 workflow 的 deploy 步驟裡。

## 幾個會踩到的點

- **直接開子路徑會 404**：GitHub Pages 是靜態主機，沒有 SPA 轉址。
  workflow 裡有一步 `cp dist/index.html dist/404.html`，讓 404 也回傳同一份
  index，vue-router 接手之後路徑就正常了。少了這一步，重新整理
  `/Tarot-fontEnd/login` 會看到 GitHub 的 404 頁。
- **Node 版本**：Vite 7 要 Node 20.19+ 或 22.12+。兩個 workflow 都已經改成 22，
  原本的 18 會在 build 時掛掉。
- **登入狀態存在 localStorage**，而 GitHub Pages 和本機是不同網域，
  兩邊的登入是各自獨立的，這是正常的。
- **AI 解讀仍然要 admin 或被開通的會員**，線上站也一樣。
- **Render 免費方案會休眠**，第一次打 API 可能要等 30 秒以上才醒來。
