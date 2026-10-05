# HW10-4 Taiwan Weather Web App

使用 **Streamlit + Python sqlite3**，從本機 SQLite 查詢地區氣溫，以折線圖及表格呈現七天日期範圍。不需要部署公開網站。

## 本機展示（必須先啟動）

[開啟 Streamlit 氣溫 Web App](http://localhost:8501/)

此網址指向使用者自己的電腦。老師需下載並啟動專案，或觀看你在本機的展示；GitHub 不會執行 Python 伺服器。

## 功能與作業對照

| HW10-4 要求 | 實作 |
|---|---|
| Streamlit Web App | `app.py` |
| 地區下拉選單 | 北部、中部、南部、東北部、東部、東南部；選單內容由 SQLite 查詢 |
| 必須從 SQLite3 查詢 | `database.py` 使用 Python `sqlite3` 與參數化 SQL，UI 不呼叫 CWA API |
| 一週折線圖 | 七天日期範圍，MaxT 紅線、MinT 藍線、點位與提示資訊；可選起始日期 |
| 一週表格 | 與圖表使用同一批 SQL 查詢結果；提供 CSV 下載 |
| 額外功能 | Folium 六區地圖、日期選擇、資料來源／匯入時間、空資料與過期提示 |

**目前資料限制：** 依使用者指示沿用既有 `O-A0003-001` 測站觀測。這不是未來七天天氣預報。MinT／MaxT 是同區域、同日期之已存測站樣本的最小／最大氣溫，不代表完整全天極值。現有本機資料只有一天；七天表格的其他日期顯示空值，不內插、不補造、不重複數值。

Web App 已支援完整七天預報模式；若老師嚴格要求「真實未來一週預報」，仍需取得並匯入完整六區 × 七天 JSON。指定 `F-A0010-001` 的 API 本次實測回傳 404，因此不宣稱已完成真實七天預報擷取。

## 啟動步驟（macOS）

首次下載：

```sh
git clone https://github.com/helen861230-ux/0921temp.git
cd 0921temp
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

建議 Python 3.11 或 3.12；本機已以 Python 3.9.6 驗證。Windows 啟動虛擬環境使用 `.venv\Scripts\activate`。

### A. 使用既有觀測資料（目前採用）

如果已有 `data/weather.db`，直接執行：

```sh
python import_observations.py
python -m streamlit run app.py --server.address 127.0.0.1
```

初次下載沒有資料庫，先以原有觀測程式建立資料（需 Node.js 22.18 以上）：

```sh
npm ci
# 在 .env.local 設定自己的 CWA_API_KEY，不要提交到 GitHub
npm run sync
python import_observations.py
python -m streamlit run app.py --server.address 127.0.0.1
```

打開 http://localhost:8501/，保持終端機運行；停止時按 Control+C。
後續更新依序執行 `npm run sync`、`python import_observations.py`，再按網頁「重新讀取資料庫」。

觀測資料以縣市對應六區：北部含臺北、新北、基隆、桃園、新竹；中部含苗栗、臺中、彰化、南投、雲林；南部含嘉義、臺南、高雄、屏東；東北部為宜蘭、東部為花蓮、東南部為臺東。離島與缺值不納入六區統計。地圖標記是區域代表點，顏色依氣溫區間中點 `(MinT + MaxT) / 2`，並非實測平均溫度。

### B. 匯入完整七天預報

```sh
python fetch_weather.py
python parse_weather.py
python database.py
python -m streamlit run app.py --server.address 127.0.0.1
```

若 API 不可用，可將老師提供的同格式 JSON 存為 `weather_data.json`，從解析步驟開始。解析會按地區與臺灣日期配對 MinT／MaxT，要求六區各七天完整資料；驗證失敗不覆蓋資料庫。預報與觀測採不同來源模式，每次匯入會原子替換展示資料，避免混用。

## SQLite schema 與查詢

`data.db` 的 `TemperatureForecasts`：`id INTEGER PRIMARY KEY`、`regionName TEXT`、`dataDate TEXT`、`mint REAL`、`maxt REAL`，另加地區／日期唯一約束與 `mint <= maxt` 檢查。
`ForecastMetadata` 記錄來源、資料類型及匯入時間。

```sql
SELECT DISTINCT regionName FROM TemperatureForecasts;
SELECT dataDate, mint, maxt FROM TemperatureForecasts
WHERE regionName = ? AND dataDate >= ? AND dataDate <= ?
ORDER BY dataDate;
```

## 檔案與驗證

- `app.py`：Streamlit 主程式，只讀 SQLite。
- `database.py`：儲存、驗證與參數化 SQL 查詢。
- `import_observations.py`：將原有觀測庫轉為六區日期統計。
- `fetch_weather.py`、`parse_weather.py`：預報 JSON 擷取與解析。
- `forecast_config.py`：路徑及六區位置。
- `tests_python/test_app.py`：地區切換、七天圖表／表格、缺值、空庫、重複匯入與 SQL 安全測試。
- `docs/legacy-gis.md`：原 Next.js 即時地圖操作說明；原程式仍保留。

```sh
python -m unittest discover -s tests_python -v
```

七天預報 UI 測試使用明確標示的 TEST 合成測試資料與獨立暫存資料庫，不會寫入正式 `data.db`。程式的真實預報功能需以可用的 CWA JSON 驗證資料來源。

`.env*`、`.venv/`、`data.db`、`data/weather.db`、JSON／CSV 產物及金鑰均不提交。
