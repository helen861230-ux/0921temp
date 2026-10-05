"""Export the active SQLite dataset, preserving its observation/forecast provenance."""
import argparse
import csv
import sqlite3
from pathlib import Path
from database import connect_readonly, active_table
from contextlib import closing
from forecast_config import DB_PATH, CSV_PATH


def export_weather(database=DB_PATH, output=CSV_PATH):
    with closing(connect_readonly(database)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('BEGIN')
        metadata = dict(conn.execute('SELECT key, value FROM ForecastMetadata'))
        rows = conn.execute(f'SELECT * FROM {active_table(conn)} ORDER BY dataDate, regionName').fetchall()
    if not rows:
        raise ValueError('資料庫沒有資料，未覆蓋 CSV。')
    records = [dict(row) for row in rows]
    for record in records:
        record.pop('id', None)
        record['dataKind'] = metadata.get('kind', 'unknown')
        record.setdefault('source', metadata.get('source', 'unknown'))
    output = Path(output)
    temporary = output.with_suffix('.csv.tmp')
    with temporary.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    temporary.replace(output)
    return len(records)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=DB_PATH)
    parser.add_argument('--output', type=Path, default=CSV_PATH)
    args = parser.parse_args()
    try:
        print(f'已輸出 {export_weather(args.database, args.output)} 筆至 {args.output.name}；dataKind 欄位標示資料類型。')
    except (OSError, sqlite3.Error, ValueError) as error:
        parser.exit(1, f'匯出失敗：{error}\n')
