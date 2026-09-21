# Taiwan CWA Weather GIS

臺灣中央氣象署資料 → 本機 SQLite → `/api/weather` → React-Leaflet 地圖。

## 本機啟動

使用 Node.js 22.18 以上（建議 Node.js 24 LTS）。

```sh
npm ci
# 在 .env.local 設定 CWA_API_KEY，請勿提交或分享金鑰
npm run sync
npm run dev
```

開啟 http://localhost:3000。SQLite 自動建立於 `data/weather.db`，不需要 Supabase、PostgreSQL 或 DATABASE_URL。
可用 `SQLITE_PATH` 指定其他 SQLite 檔案（父資料夾必須存在）；預設即可滿足本機使用。

地圖以臺灣為中心，使用 OpenStreetMap 底圖與氣溫色彩標記。點擊測站可查看溫度、濕度、雨量、風速、海拔與觀測時間；支援縣市及文字篩選、載入／空資料／錯誤與重試狀態。有效離島座標也保留，可縮小或移動地圖查看。

「測站卡片」與「JSON」保留資料庫及 CWA 即時檢視；GIS 永遠只讀取 `/api/weather`。管理工具可手動同步並查看統計。

## API

- `GET /api/weather?county=臺北市&station_id=466920&limit=500`：回傳 `{ success, source: "sqlite", count, stations }`，每站最新一筆，保留原有 snake_case 氣象欄位。limit 為 1–5000 的整數。
- `GET /api/weather?stats=true`：資料庫連線、測站數、觀測筆數、最新觀測時間。
- `POST /api/sync`：抓取 CWA O-A0003-001，原子寫入測站與觀測資料；可指定 `?limit=50`。GET 回傳 405。
- `GET /api/cwa`：保留原有即時檢視介面。

CLI 與 API 共用 CWA 正規化、SQLite schema 與同步流程。`UNIQUE(station_id, obs_time)` 防止相同測站／時間重複；同步失敗會回復整批變更。資料庫使用 WAL、外鍵與等待鎖定機制。執行同步時讀取當下 CWA 資料；不會自動排程同步。

## 驗證

```sh
npm test
npm run lint
npm run build
npm run start -- --hostname 127.0.0.1
```

測試使用獨立暫存資料庫，涵蓋重複略過、最新觀測與篩選、交易回復、外鍵、空觀測、缺值正規化、schema 一致性與座標有效性。
`.env*`、資料庫及 WAL/SHM 檔案皆由 Git 忽略。

## 部署限制

目前是本機展示版本，沒有公開 Live Demo。Vercel Functions 不保證本機 SQLite 的持久化與跨執行個體共享，因此不能把 `data/weather.db` 直接當作 Vercel 正式資料庫。參閱 [Vercel 官方說明](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)。

後續可選擇具持久磁碟的 Node.js 主機，或另行改接遠端 SQLite 相容服務；遠端服務需要不同驅動與連線設定，並非直接設定 better-sqlite3 即可。對外部署前也需為目前本機使用的同步管理端點加上驗證與流量限制。目前尚未部署公開網站；GitHub 程式碼與本機資料庫分開管理。
