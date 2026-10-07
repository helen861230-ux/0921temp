"""Backfill genuine CWA CODiS daily station extremes; never interpolate missing days."""
import argparse
import calendar
import json
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

from database import save_station_history
from forecast_config import ROOT, DB_PATH
from parse_weather import date_of, temperature

TAIPEI = timezone(timedelta(hours=8))
STATIONS = {
    '北部地區': ('466920', '臺北'), '中部地區': ('467490', '臺中'),
    '南部地區': ('467410', '臺南'), '東北部地區': ('467080', '宜蘭'),
    '東部地區': ('466990', '花蓮'), '東南部地區': ('467660', '臺東'),
}
ENDPOINT = 'https://codis.cwa.gov.tw/api/station'


def parse_daily(payload, region, station_id, station_name, start, end):
    if payload.get('code') != 200 or not isinstance(payload.get('data'), list):
        raise ValueError(f'{station_name} CODiS 回應未成功。')
    rows = []
    for station in payload['data']:
        if station.get('StationID') != station_id:
            raise ValueError('CODiS 回傳測站代碼不一致。')
        for item in station.get('dts', []):
            day = date_of(item.get('DataDate'))
            if not start.isoformat() <= day <= end.isoformat():
                continue
            temp = item.get('AirTemperature') or {}
            low, high = temperature(temp.get('Minimum')), temperature(temp.get('Maximum'))
            # CODiS negative flags denote invalid/absent measurements.
            if any(isinstance(temp.get(k), (int, float)) and temp[k] < 0 for k in ('Minimumf', 'Maximumf')):
                continue
            if low is None or high is None or low > high:
                continue
            rows.append(dict(regionName=region, dataDate=day, mint=low, maxt=high,
                             stationId=station_id, stationName=station_name,
                             source='CWA CODiS 日資料', isPartial=0))
    return rows


def fetch_daily(region, station_id, station_name, start, end):
    rows = []
    month = start.replace(day=1)
    while month <= end:
        last = month.replace(day=calendar.monthrange(month.year, month.month)[1])
        try:
            response = requests.post(ENDPOINT, data={
                'type': 'report_month', 'date': month.isoformat(), 'stn_ID': station_id,
                'stn_type': 'cwb', 'start': f'{month.isoformat()}T00:00:00',
                'end': f'{last.isoformat()}T00:00:00',
            }, timeout=30)
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError):
            raise RuntimeError(f'{station_name} {month:%Y-%m} CODiS 下載失敗，資料庫未更新。') from None
        rows.extend(parse_daily(payload, region, station_id, station_name, start, end))
        month = last + timedelta(days=1)
    return rows


def current_samples(today, source=ROOT / 'data/weather.db'):
    """Only today's stored readings of the SAME six representative stations."""
    rows = []
    # WAL databases may need to recreate shared-memory sidecars after Node closes.
    # mode=rw opens an existing database only; queries below never change records.
    with closing(sqlite3.connect(Path(source).resolve().as_uri() + '?mode=rw', uri=True)) as conn:
        for region, (station_id, station_name) in STATIONS.items():
            values = []
            for timestamp, raw in conn.execute('SELECT obs_time, air_temperature FROM weather_observations WHERE station_id = ?', (station_id,)):
                value = temperature(raw)
                if value is not None and date_of(timestamp) == today.isoformat():
                    values.append(value)
            if values:
                rows.append(dict(regionName=region, dataDate=today.isoformat(), mint=min(values), maxt=max(values),
                                 stationId=station_id, stationName=station_name,
                                 source='CWA O-A0003-001 當日樣本', isPartial=1))
    return rows


def backfill(start, end, target=DB_PATH):
    today = datetime.now(TAIPEI).date()
    if start > end or end > today:
        raise ValueError('日期需為開始 ≤ 結束 ≤ 臺灣今天。')
    historical_end = min(end, today - timedelta(days=1))
    rows = []
    for region, (station_id, station_name) in STATIONS.items():
        if start <= historical_end:
            records = fetch_daily(region, station_id, station_name, start, historical_end)
            rows.extend(records)
            print(f'{region}／{station_name}：取得 {len(records)} 天正式日資料', flush=True)
    if end == today:
        rows.extend(current_samples(today))
    expected = {(region, (start + timedelta(days=i)).isoformat())
                for region in STATIONS for i in range((end - start).days + 1)}
    missing = sorted(expected - {(r['regionName'], r['dataDate']) for r in rows})
    if missing:
        raise ValueError(f'尚缺 {len(missing)} 筆地區／日期，未更新資料庫。範例：{missing[:6]}')
    save_station_history(rows, target)
    return {'start': start.isoformat(), 'end': end.isoformat(), 'days': (end-start).days+1,
            'rows': len(rows), 'partial_rows': sum(r['isPartial'] for r in rows)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', type=date.fromisoformat, default=date(2026, 9, 21))
    parser.add_argument('--end', type=date.fromisoformat, default=datetime.now(TAIPEI).date())
    parser.add_argument('--database', type=Path, default=DB_PATH)
    args = parser.parse_args()
    try:
        print(json.dumps(backfill(args.start, args.end, args.database), ensure_ascii=False))
    except (ValueError, RuntimeError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'{error}\n')
