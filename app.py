"""HW10: Streamlit reads SQLite only; API ingestion is a separate CLI step."""
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import altair as alt
import folium
import pandas as pd
import streamlit as st
from streamlit_folium import st_folium
from database import query_forecasts, query_regions, query_metadata
from forecast_config import DB_PATH, REGION_COORDINATES

st.set_page_config(page_title='HW10 Taiwan Weather Forecast', page_icon='🌤️', layout='wide')
st.title('🌤️ Taiwan Weather Dashboard')
st.caption('HW10-4 · 地區氣溫查詢｜CWA → Python → SQLite → Streamlit')
db_path = Path(os.environ.get('FORECAST_DB_PATH', str(DB_PATH)))
try:
    regions = query_regions(db_path)
    metadata = query_metadata(db_path)
    all_rows = query_forecasts(db_path=db_path)
except (sqlite3.Error, OSError):
    st.warning('尚未建立可用的氣溫資料庫。請先完成資料擷取、解析與匯入。')
    st.code('python import_observations.py\n# 或匯入預報：\npython fetch_weather.py\npython parse_weather.py\npython database.py', language='bash')
    st.info('資料來源：F-A0010-001。若氣象署回傳 404，請向老師確認資料集或取得同資料集 JSON，再執行解析與匯入。此頁不會以即時觀測或模擬數值冒充預報。')
    st.stop()
if not all_rows or not regions:
    st.info('SQLite 尚無氣溫資料，請先匯入。')
    st.stop()
if 'TEST' in metadata.get('source', '') or '示範' in metadata.get('source', ''):
    st.warning('這是測試資料畫面，不是真實 CWA 預報，不可用於天氣決策或當成 API 成功成果。')
is_station_history = metadata.get('kind') == 'station_history'
is_observation = metadata.get('kind') in ('observation', 'station_history')
if is_station_history:
    st.info('歷史日期採 CODiS 代表測站每日最低／最高溫，不代表整個地區的極值。今天尚未結束，僅顯示同一測站已收集樣本，並非完整日極值。')
elif is_observation:
    st.info('目前使用既有測站觀測，不是未來預報。MinT／MaxT 為該地區已儲存測站樣本的最低／最高氣溫，並非完整全天的最低／最高溫。')
st.caption(f"資料來源：{metadata.get('source', '未知')} · 匯入時間：{metadata.get('imported_at', '未知')}")
with st.sidebar:
    st.header('氣溫查詢')
    region = st.selectbox('選擇地區 / Select Region', regions)
    st.button('重新讀取資料庫')
    st.markdown('本頁從 SQLite 查詢，不會直接呼叫 CWA API。')
    st.markdown('[CWA CODiS 歷史觀測](https://codis.cwa.gov.tw/)' if is_station_history else '[CWA 資料集說明](https://opendata.cwa.gov.tw/dataset/forecast/F-A0010-001)')
available_dates = sorted({r['dataDate'] for r in all_rows})
if is_observation:
    st.sidebar.caption(f'已累積資料：{available_dates[0]} 至 {available_dates[-1]}（{len(available_dates)} 個日期）')
    period = st.sidebar.selectbox('歷史查詢範圍', ['最近 7 天', '最近 14 天', '最近 30 天', '全部紀錄', '自訂日期'], index=3 if is_station_history else 0)
    latest = pd.Timestamp(available_dates[-1]).date()
    if period == '自訂日期':
        start_day = st.sidebar.date_input('開始日期', value=latest - timedelta(days=6))
        end_day = st.sidebar.date_input('結束日期', value=latest)
    elif period == '全部紀錄':
        start_day, end_day = pd.Timestamp(available_dates[0]).date(), latest
    else:
        days = int(period.split()[1])
        start_day, end_day = latest - timedelta(days=days-1), latest
        st.sidebar.caption('最近天數以資料庫最新觀測日期為基準。')
    if start_day > end_day:
        st.error('開始日期不可晚於結束日期，請重新選擇。')
        st.stop()
    start, end = start_day.isoformat(), end_day.isoformat()
else:
    week_start = st.sidebar.date_input('一週起始日期', value=pd.Timestamp(available_dates[0]).date())
    start, end = week_start.isoformat(), (week_start + timedelta(days=6)).isoformat()
total_days = (pd.Timestamp(end) - pd.Timestamp(start)).days + 1
if total_days > 3660:
    st.warning('一次最多顯示 3660 天，請縮小日期範圍。')
    st.stop()
rows = query_forecasts(region, db_path, start=start, end=end)
if is_station_history and any(
    not {'stationName', 'stationId', 'source', 'isPartial'}.issubset(row) for row in rows
):
    st.warning('歷史資料查詢欄位與目前版本不一致，請重新啟動 Streamlit，再重新整理頁面。')
    st.code('python -m streamlit run app.py', language='bash')
    st.stop()
calendar = pd.DataFrame({'dataDate': pd.date_range(start, end).strftime('%Y-%m-%d')})
columns = ['regionName', 'dataDate', 'mint', 'maxt'] + (['stationId', 'stationName', 'source', 'isPartial'] if is_station_history else [])
frame = calendar.merge(pd.DataFrame(rows, columns=columns), on='dataDate', how='left')
if is_station_history and rows:
    st.caption(f"代表測站：{rows[0]['stationName']}（{rows[0]['stationId']}）")
count = int(frame['mint'].notna().sum())
if count < total_days:
    st.warning(f'此範圍只有 {count}/{total_days} 天有資料；缺少日期顯示空值，不補造氣溫。')
today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
if available_dates[-1] < today:
    st.warning('目前資料日期早於今天，請更新資料。')
label = '觀測氣溫' if is_observation else 'Temperature Forecast'
st.subheader(f'{label} · {region}')
st.caption(f'{start} — {end}')
metrics = st.columns(3)
metrics[0].metric('區間最低溫', f"{frame['mint'].min():g} °C" if count else '—')
metrics[1].metric('區間最高溫', f"{frame['maxt'].max():g} °C" if count else '—')
metrics[2].metric('有資料天數', f'{count}/{total_days}')
chart_col, table_col = st.columns([1.7, 1])
with chart_col:
    long = frame.melt(id_vars=['dataDate'], value_vars=['mint', 'maxt'], var_name='series', value_name='temperature')
    long['series'] = long['series'].map({'mint': 'MinT 最低溫', 'maxt': 'MaxT 最高溫'})
    chart = alt.Chart(long).mark_line(point=True).encode(
        x=alt.X('dataDate:T', title='日期', axis=alt.Axis(format='%m/%d')),
        y=alt.Y('temperature:Q', title='氣溫 (°C)', scale=alt.Scale(zero=False)),
        color=alt.Color('series:N', title=None, scale=alt.Scale(domain=['MaxT 最高溫', 'MinT 最低溫'], range=['#ef4444', '#1677ff'])),
        tooltip=[alt.Tooltip('dataDate:T', title='日期', format='%Y-%m-%d'), alt.Tooltip('series:N', title='項目'), alt.Tooltip('temperature:Q', title='°C')]
    ).properties(height=320)
    st.altair_chart(chart, use_container_width=True)
with table_col:
    display = frame[['dataDate', 'mint', 'maxt']].rename(columns={'dataDate': 'Date', 'mint': 'MinT (°C)', 'maxt': 'MaxT (°C)'})
    if is_station_history:
        display['資料狀態'] = frame['isPartial'].map({0: 'CODiS 日極值', 1: '當日樣本（未完整）'}).fillna('無資料')
    st.dataframe(display, hide_index=True, width='stretch')
    st.download_button('下載此地區 CSV', frame.to_csv(index=False).encode('utf-8-sig'), file_name=f'{region}_{start}_{end}.csv', mime='text/csv')

st.divider()
st.subheader('臺灣地區氣溫地圖')
dates = sorted({r['dataDate'] for r in all_rows if start <= r['dataDate'] <= end})
if not dates:
    st.info('選取範圍內沒有地圖觀測紀錄，請調整日期。')
    st.stop()
day = st.selectbox('地圖資料日期', dates, index=len(dates)-1)
st.caption('顏色依 (MinT + MaxT) ÷ 2 的氣溫區間中點；標記為地區代表位置，並非測站或行政邊界。')
map_rows = query_forecasts(db_path=db_path, day=day)
if is_station_history:
    st.caption('北部：臺北；中部：臺中；南部：臺南；東北部：宜蘭；東部：花蓮；東南部：臺東。')
map_view = folium.Map(location=[23.7, 121.0], zoom_start=7, tiles='OpenStreetMap')
for row in map_rows:
    mean = (row['mint'] + row['maxt']) / 2
    color = '#1677ff' if mean < 20 else '#16a34a' if mean < 25 else '#eab308' if mean <= 30 else '#ef4444'
    folium.CircleMarker(location=REGION_COORDINATES[row['regionName']], radius=12, color='white', weight=2,
        fill=True, fill_color=color, fill_opacity=0.95, tooltip=f"{row['regionName']} · {mean:g} °C",
        popup=folium.Popup(f"{row['regionName']}<br>{row.get('stationName', '')} {row.get('source', '')}<br>Date: {row['dataDate']}<br>Min: {row['mint']:g} °C<br>Max: {row['maxt']:g} °C<br>區間中點: {mean:g} °C", max_width=240)).add_to(map_view)
map_col, daily_col = st.columns([1.5, 1])
with map_col:
    st_folium(map_view, height=470, use_container_width=True, returned_objects=[], key=f'forecast-map-{day}')
with daily_col:
    st.subheader(f'{day} 六區氣溫')
    daily = pd.DataFrame(map_rows)
    daily['區間中點 (°C)'] = (daily['mint'] + daily['maxt']) / 2
    daily_display = daily[['regionName', 'mint', 'maxt', '區間中點 (°C)']].rename(
        columns={'regionName': '地區', 'mint': '最低溫 (°C)', 'maxt': '最高溫 (°C)'})
    st.dataframe(daily_display, hide_index=True, width='stretch')
    st.caption('平均值以最高／最低溫的算術平均近似；不是全天逐時平均。')
    st.download_button('下載當日六區 CSV', daily.to_csv(index=False).encode('utf-8-sig'),
                       file_name=f'weather_{day}.csv', mime='text/csv')
st.caption('🔵 <20°C　🟢 20–<25°C　🟡 25–30°C　🔴 >30°C')
with st.expander('SQLite 查詢與作業流程'):
    table_name = 'TemperatureStationHistory' if is_station_history else ('TemperatureObservations' if is_observation else 'TemperatureForecasts')
    st.code(f'SELECT DISTINCT regionName FROM {table_name};\nSELECT dataDate, mint, maxt FROM {table_name}\nWHERE regionName = ? AND dataDate BETWEEN ? AND ? ORDER BY dataDate;', language='sql')
    st.write('資料庫紀錄：', len(all_rows), '筆；同地區／日期唯一，重複匯入不累增。')
