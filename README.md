# HW1: CWA 天氣預報網站 using AI Agent

使用 **Streamlit + Python sqlite3**，從本機 SQLite 查詢地區氣溫，以折線圖及表格呈現 7／14／30 天或自訂日期範圍。不需要部署公開網站。

## 本機展示（必須先啟動）

[HW1: CWA 天氣預報網站 using AI Agent](http://localhost:8501/)

此網址指向使用者自己的電腦。老師需下載並啟動專案，或觀看你在本機的展示；GitHub 不會執行 Python 伺服器。

## 功能與作業對照

| HW1 要求 | 實作 |
|---|---|
| Streamlit Web App | `app.py` |
| 地區下拉選單 | 北部、中部、南部、東北部、東部、東南部；選單內容由 SQLite 查詢 |
| 必須從 SQLite3 查詢 | `database.py` 使用 Python `sqlite3` 與參數化 SQL，UI 不呼叫 CWA API |
| 一週折線圖 | 預報模式七天；歷史觀測模式可選 7／14／30 天、全部紀錄或自訂日期，MaxT 紅線、MinT 藍線 |
| 一週表格 | 與圖表使用同一批 SQL 查詢結果；提供 CSV 下載 |
| 額外功能 | Folium 六區地圖、日期選擇、資料來源／匯入時間、空資料與過期提示 |

**目前展示內容：** 真實歷史觀測已回補 **2026-09-21～2026-10-05，15 天 × 六區 = 90 筆**。9/21～10/4 使用中央氣象署 CODiS 代表測站的每日最低／最高溫；10/5 尚未結束，只顯示同一測站當日已收集的 O-A0003-001 樣本極值，表格標示「當日樣本（未完整）」。這是觀測紀錄，不是未來預報，也不是全區域所有測站的極值。

| 地區 | CODiS 代表測站 | 站號 |
|---|---|---|
| 北部 | 臺北 | 466920 |
| 中部 | 臺中 | 467490 |
| 南部 | 臺南 | 467410 |
| 東北部 | 宜蘭 | 467080 |
| 東部 | 花蓮 | 466990 |
| 東南部 | 臺東 | 467660 |

資料出處：[中央氣象署 CODiS](https://codis.cwa.gov.tw/)。日資料通常於隔日更新，今天不能視為完整日極值。原本多站樣本統計另存於 `TemperatureObservations`，沒有刪除或與代表站資料混合。

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

### A. 回補歷史觀測（目前採用）

首次下載沒有 `data/weather.db` 時，先執行 `npm ci`，並在 `.env.local` 設定自己的 `CWA_API_KEY`。以下流程會保留原觀測並建立六區代表站歷史：

```sh
npm run sync
python backfill_history.py --start 2026-09-21
python -m streamlit run app.py --server.address 127.0.0.1
```

`--end` 預設為臺灣今天，亦可指定，例如 `--end 2026-10-04`。截止昨天以前的正式 CODiS 資料不需要 CWA API 金鑰；包含今天時，需先同步同一代表站的即時樣本。資料下載、地區及日期完整性驗證全部通過才更新資料庫，不以內插值或其他測站冒充缺少日期。

重新匯入不新增重複列。當日未完整樣本日後會由正式日資料替換；正式日資料不會被未完整樣本降級覆蓋。CODiS 網站查詢介面如有異動，腳本會報錯並保留原資料。

### A2. 使用原多站觀測統計

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

若 API 不可用，可將老師提供的同格式 JSON 存為 `weather_data.json`，從解析步驟開始。解析會按地區與臺灣日期配對 MinT／MaxT，要求六區各七天完整資料；驗證失敗不覆蓋資料庫。預報與觀測分別儲存於不同資料表。預報匯入原子替換七天預報；觀測匯入持續累積日期，並合併同區同日樣本的最低／最高氣溫，不刪除既有觀測歷史。畫面顯示最後匯入的來源模式，不混用兩種資料。

## 歷史觀測查詢

1. 選擇地區，再選「最近 7 天／14 天／30 天／全部紀錄／自訂日期」。
2. 最近天數以**資料庫最新觀測日期**為終點；頁面會標示已累積日期範圍。
3. 圖表、表格和 CSV 使用相同日期範圍；地圖日期也限制在所選範圍。
4. 沒有紀錄的日子顯示空值；開始日期晚於結束日期時提示修正。

以後要更新至當天，請手動執行：

```sh
npm run sync
python backfill_history.py --start 2026-09-21
```

再按網頁「重新讀取資料庫」。第一次正式啟動歷史模式，預設顯示「全部紀錄」；使用者也可切換最近 7／14／30 天或自訂日期。目前未設定自動排程，不需讓 Streamlit 一直開著；SQLite 資料在關閉終端機或重開機後仍會保留。

## SQLite schema 與查詢

`data.db` 的 `TemperatureForecasts`：`id INTEGER PRIMARY KEY`、`regionName TEXT`、`dataDate TEXT`、`mint REAL`、`maxt REAL`，另加地區／日期唯一約束與 `mint <= maxt` 檢查。
`TemperatureObservations` 使用相同欄位，獨立保存累積的歷史觀測；舊版觀測資料會自動保留至此表。
`TemperatureStationHistory` 獨立保存代表站歷史，額外記錄 `stationId`、`stationName`、`source`、`isPartial`。
`ForecastMetadata` 記錄目前展示來源、資料類型及匯入時間；每種資料表保持獨立。

```sql
SELECT DISTINCT regionName FROM TemperatureForecasts;
SELECT dataDate, mint, maxt FROM TemperatureForecasts
WHERE regionName = ? AND dataDate >= ? AND dataDate <= ?
ORDER BY dataDate;
```

## 檔案與驗證

- `backfill_history.py`：從官方 CODiS 月報表取得日極值，檢查六區日期完整性並回補至今天。
- `tests_python/test_backfill.py`：正式／未完整狀態、來源欄位、無效值、測站一致性與 UI 測試。
- `app.py`：Streamlit 主程式，只讀 SQLite。
- `database.py`：儲存、驗證與參數化 SQL 查詢。
- `import_observations.py`：將原有觀測庫轉為六區日期統計。
- `fetch_weather.py`、`parse_weather.py`：預報 JSON 擷取與解析。
- `forecast_config.py`：路徑及六區位置。
- `tests_python/test_history.py`：歷史累積、舊資料遷移、預報／觀測隔離、14／30 天與自訂範圍測試。
- `tests_python/test_app.py`：地區切換、七天圖表／表格、缺值、空庫、重複匯入與 SQL 安全測試。
- `docs/legacy-gis.md`：原 Next.js 即時地圖操作說明；原程式仍保留。

```sh
python -m unittest discover -s tests_python -v
```

七天預報 UI 測試使用明確標示的 TEST 合成測試資料與獨立暫存資料庫，不會寫入正式 `data.db`。程式的真實預報功能需以可用的 CWA JSON 驗證資料來源。

`.env*`、`.venv/`、`data.db`、`data/weather.db`、JSON／CSV 產物及金鑰均不提交。

## 地圖與當日六區表格、CSV

地圖區採左右並排：左側 Folium 地圖，右側為下拉選單指定日期的六區最低／最高溫及區間中點。更換日期會同步更新兩側；上方的單區歷史折線圖另依查詢範圍顯示。圓圈使用近似地區座標，藍色 <20°C、綠色 20–<25°C、黃色 25–30°C、紅色 >30°C。

將目前 SQLite 中啟用的資料匯出為作業指定檔名：

```sh
python export_weather.py
```

輸出 `weather_data.csv`（UTF-8 BOM）。歷史資料保留 `dataKind=station_history`、測站、來源及 `isPartial`，不可當作七天預報。真正的預報 JSON 則使用 `python parse_weather.py` 產生六區七天 CSV，再以 `python database.py` 匯入。下載的 CSV、JSON 與資料庫不提交 GitHub，老師可依上述步驟重新產生。

## SSL 憑證問題

程式保持 HTTPS 憑證驗證。遇到 SSL 驗證失敗，先在虛擬環境更新憑證套件：

```sh
python -m pip install --upgrade certifi
```

若學校或公司的 HTTPS 代理需要自訂 CA，請向管理員取得可信任的 PEM 憑證組，並在執行前設定：

```sh
export REQUESTS_CA_BUNDLE="/absolute/path/to/trusted-ca-bundle.pem"
python fetch_weather.py
```

不要使用 `verify=False` 跳過驗證。Python 3.9 系統環境可能出現 LibreSSL 警告，建議使用連結 OpenSSL 的 Python 3.11／3.12 重新建立虛擬環境。SSL 失敗及 HTTP 404 都會保留既有資料，不輸出含金鑰的錯誤網址。

## 繳交限制

2026-10-05 再次實測 F-A0010-001 的 REST 與 file API 均回傳 HTTP 404。目前可展示真實歷史觀測、日期連動地圖、六區表格、SQLite、CSV 與折線圖；尚不能宣稱已成功下載指定資料集的真實七天預報。需取得老師提供的同資料集 JSON，或由老師確認可用的替代資料來源，才能完成該項驗收。

## 開啟網頁自動更新

本機預設的歷史觀測模式會在開啟或重新整理網頁時檢查並更新資料。同一伺服器每 15 分鐘最多自動嘗試一次，跨臺灣午夜會重新嘗試；「立即更新資料」可手動重試。更新流程先同步當日 CWA 觀測，再從尚未完整的日期開始回補 CODiS 正式日資料，最後重新輸出 `weather_data.csv`。畫面仍從 SQLite 查詢。

需要網路、有效的 `.env.local` CWA_API_KEY、Node.js 22.18 以上及原專案 npm 套件。更新失敗保留已儲存資料並顯示提示；今天只代表已收集的樣本，不是完整全天極值，也不是未來預報。第一次下載可能需要稍候。網頁一直閒置不操作時不會自動輪詢，重新整理即可檢查；關閉伺服器也不會收集資料。可設定 `FORECAST_AUTO_UPDATE=0` 關閉，另指定的測試資料庫及預報模式不會自動切換成觀測模式。
