"""Import existing CWA observations for the user-approved observation-mode demo."""
import argparse
from collections import defaultdict
from contextlib import closing
from pathlib import Path
import sqlite3

from database import save_observations
from forecast_config import ROOT, DB_PATH
from parse_weather import date_of, temperature

COUNTIES = {
    '北部地區': ('臺北市', '新北市', '基隆市', '桃園市', '新竹縣', '新竹市'),
    '中部地區': ('苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣'),
    '南部地區': ('嘉義縣', '嘉義市', '臺南市', '高雄市', '屏東縣'),
    '東北部地區': ('宜蘭縣',), '東部地區': ('花蓮縣',), '東南部地區': ('臺東縣',),
}


def import_observations(source=ROOT / 'data/weather.db', target=DB_PATH):
    mapping = {county: region for region, counties in COUNTIES.items() for county in counties}
    grouped = defaultdict(list)
    skipped = 0
    with closing(sqlite3.connect(Path(source).resolve().as_uri() + '?mode=ro', uri=True)) as conn:
        rows = conn.execute('''SELECT s.county_name, o.obs_time, o.air_temperature
            FROM weather_observations o JOIN weather_stations s USING(station_id)''').fetchall()
    for county, timestamp, value in rows:
        region = mapping.get(county.replace('台', '臺'))
        value = temperature(value)
        if region is None or value is None:
            skipped += 1
            continue
        grouped[(region, date_of(timestamp))].append(value)
    records = [dict(regionName=r, dataDate=d, mint=min(v), maxt=max(v)) for (r, d), v in sorted(grouped.items())]
    if not records:
        raise ValueError('既有資料庫沒有可用氣溫；請先執行 npm run sync。')
    save_observations(records, target)
    return {'rows': len(records), 'days': len({r['dataDate'] for r in records}), 'skipped': skipped}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'data/weather.db')
    parser.add_argument('--database', type=Path, default=DB_PATH)
    args = parser.parse_args()
    try:
        print('匯入觀測資料（不是預報）：', import_observations(args.source, args.database))
    except (ValueError, sqlite3.Error, OSError) as error:
        parser.exit(1, f'匯入失敗：{error}\n')
