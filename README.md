# 蕭友晉老師實驗室儀器預約系統（GitHub Pages 版）

這個資料夾可以 **直接上傳到 GitHub 空白 repo**，開啟 GitHub Pages 後即可使用。  
不需要打包或安裝任何套件。

## 使用方式
1. 建立（或打開）你的 GitHub repo，將本專案所有檔案上傳（至少 `index.html` 和 `app.jsx`）。
2. 到 **Settings → Pages**：
   - Source: 選擇 `Deploy from a branch`
   - Branch: 選擇 `main`（或 `master`）/ `/ (root)`
3. 儲存後，稍等一下，網址會是：`https://<你的帳號>.github.io/<儲存庫名稱>/`

## 功能
- 登入/註冊（localStorage demo 版）
- 儀器切換（GC@漁科所406、溫室氣體測量儀@水工所307B）
- 日/週/月視圖（點空白快速建立預約；顯示 Sun, Mon, ...）
- 權限：只有建立者自己或管理員（renyi0128@gmail.com、yshiau@g.ntu.edu.tw）可刪除/編輯
- 匯出 CSV / JSON、單筆 .ics

> 正式上線建議：改用後端認證（Firebase/Supabase）與資料庫。

## 檔案說明
- `index.html`：載入 Tailwind、React、Babel（CDN），並掛載 React App
- `app.jsx`：主要程式碼（可直接編輯並 push）
