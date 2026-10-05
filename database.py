"""Step 3: transactional SQLite storage and parameterized forecast queries."""
import argparse
import csv
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from forecast_config import DB_PATH, CSV_PATH, REGIONS
from parse_weather import validate_week

SCHEMA = '''
CREATE TABLE IF NOT EXISTS TemperatureForecasts (
    id INTEGER PRIMARY KEY,
    regionName TEXT NOT NULL,
    dataDate TEXT NOT NULL,
    mint REAL NOT NULL,
    maxt REAL NOT NULL,
    UNIQUE(regionName, dataDate),
    CHECK(mint <= maxt)
);
CREATE TABLE IF NOT EXISTS TemperatureObservations (
    id INTEGER PRIMARY KEY,
    regionName TEXT NOT NULL,
    dataDate TEXT NOT NULL,
    mint REAL NOT NULL,
    maxt REAL NOT NULL,
    UNIQUE(regionName, dataDate),
    CHECK(mint <= maxt)
);
CREATE TABLE IF NOT EXISTS TemperatureStationHistory (
    id INTEGER PRIMARY KEY,
    regionName TEXT NOT NULL,
    dataDate TEXT NOT NULL,
    mint REAL NOT NULL,
    maxt REAL NOT NULL,
    stationId TEXT NOT NULL,
    stationName TEXT NOT NULL,
    source TEXT NOT NULL,
    isPartial INTEGER NOT NULL CHECK(isPartial IN (0,1)),
    UNIQUE(regionName, dataDate),
    CHECK(mint <= maxt)
);
CREATE TABLE IF NOT EXISTS ForecastMetadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
'''


def preserve_legacy_observations(conn):
    """Migrate the old shared table once, before it can be replaced by forecasts."""
    kind = conn.execute("SELECT value FROM ForecastMetadata WHERE key='kind'").fetchone()
    migrated = conn.execute("SELECT value FROM ForecastMetadata WHERE key='history_migrated'").fetchone()
    if kind is not None and kind[0] == 'observation' and not migrated:
        conn.execute("""INSERT INTO TemperatureObservations(regionName, dataDate, mint, maxt)
            SELECT regionName, dataDate, mint, maxt FROM TemperatureForecasts WHERE 1
            ON CONFLICT(regionName, dataDate) DO UPDATE SET
            mint = MIN(TemperatureObservations.mint, excluded.mint),
            maxt = MAX(TemperatureObservations.maxt, excluded.maxt)""")
    conn.execute("INSERT OR REPLACE INTO ForecastMetadata VALUES ('history_migrated', '1')")


def active_table(conn):
    kind = conn.execute("SELECT value FROM ForecastMetadata WHERE key='kind'").fetchone()
    migrated = conn.execute("SELECT value FROM ForecastMetadata WHERE key='history_migrated'").fetchone()
    if kind is not None and kind[0] == 'station_history':
        return 'TemperatureStationHistory'
    return 'TemperatureObservations' if kind is not None and kind[0] == 'observation' and migrated else 'TemperatureForecasts'


def save_forecasts(rows, db_path=DB_PATH, source='CWA F-A0010-001'):
    validate_week(rows)
    with closing(sqlite3.connect(db_path)) as conn:
        conn.executescript(SCHEMA)
        with conn:
            preserve_legacy_observations(conn)
            # Replace one validated 7-day snapshot, preventing obsolete dates in the UI.
            conn.execute('DELETE FROM TemperatureForecasts')
            conn.executemany('INSERT INTO TemperatureForecasts(regionName, dataDate, mint, maxt) VALUES (:regionName, :dataDate, :mint, :maxt)', rows)
            conn.executemany('INSERT OR REPLACE INTO ForecastMetadata(key, value) VALUES (?, ?)', [
                ('source', source), ('kind', 'forecast'), ('imported_at', datetime.now(timezone.utc).isoformat())])
    return len(rows)


def save_observations(rows, db_path=DB_PATH):
    from parse_weather import temperature, date_of
    if not rows:
        raise ValueError('沒有可儲存的觀測資料。')
    for row in rows:
        if row['regionName'] not in REGIONS or date_of(row['dataDate']) != row['dataDate']:
            raise ValueError('觀測地區或日期無效。')
        if temperature(row['mint']) is None or temperature(row['maxt']) is None or row['mint'] > row['maxt']:
            raise ValueError('觀測氣溫無效。')
    with closing(sqlite3.connect(db_path)) as conn:
        conn.executescript(SCHEMA)
        with conn:
            preserve_legacy_observations(conn)
            # Keep historical days; repeated samples update extrema without duplication.
            conn.executemany("""INSERT INTO TemperatureObservations(regionName, dataDate, mint, maxt)
                VALUES (:regionName, :dataDate, :mint, :maxt)
                ON CONFLICT(regionName, dataDate) DO UPDATE SET
                mint = MIN(TemperatureObservations.mint, excluded.mint),
                maxt = MAX(TemperatureObservations.maxt, excluded.maxt)""", rows)
            conn.executemany('INSERT OR REPLACE INTO ForecastMetadata(key, value) VALUES (?, ?)', [
                ('source', 'CWA O-A0003-001 既有測站觀測'), ('kind', 'observation'),
                ('imported_at', datetime.now(timezone.utc).isoformat())])


def save_station_history(rows, db_path=DB_PATH):
    from parse_weather import temperature, date_of
    if not rows:
        raise ValueError('沒有歷史資料。')
    for row in rows:
        if row['regionName'] not in REGIONS or date_of(row['dataDate']) != row['dataDate']:
            raise ValueError('地區或日期無效。')
        if temperature(row['mint']) is None or temperature(row['maxt']) is None or row['mint'] > row['maxt']:
            raise ValueError('日氣溫無效。')
    with closing(sqlite3.connect(db_path)) as conn:
        conn.executescript(SCHEMA)
        with conn:
            preserve_legacy_observations(conn)
            conn.executemany("""INSERT INTO TemperatureStationHistory
                (regionName,dataDate,mint,maxt,stationId,stationName,source,isPartial)
                VALUES (:regionName,:dataDate,:mint,:maxt,:stationId,:stationName,:source,:isPartial)
                ON CONFLICT(regionName,dataDate) DO UPDATE SET
                mint=excluded.mint, maxt=excluded.maxt, stationId=excluded.stationId,
                stationName=excluded.stationName, source=excluded.source, isPartial=excluded.isPartial
                WHERE excluded.isPartial <= TemperatureStationHistory.isPartial""", rows)
            conn.executemany('INSERT OR REPLACE INTO ForecastMetadata(key,value) VALUES (?,?)', [
                ('source', 'CWA CODiS 六區代表站每日極值；當日為 O-A0003-001 未完整樣本'),
                ('kind', 'station_history'), ('imported_at', datetime.now(timezone.utc).isoformat())])


def connect_readonly(db_path=DB_PATH):
    return sqlite3.connect(Path(db_path).resolve().as_uri() + '?mode=ro', uri=True)


def query_regions(db_path=DB_PATH):
    with closing(connect_readonly(db_path)) as conn:
        found = {r[0] for r in conn.execute(f'SELECT DISTINCT regionName FROM {active_table(conn)}')}
    return [name for name in REGIONS if name in found]


def query_forecasts(region=None, db_path=DB_PATH, day=None, start=None, end=None):
    with closing(connect_readonly(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        table = active_table(conn)
        extra = ', stationId, stationName, source, isPartial' if table == 'TemperatureStationHistory' else ''
        rows = conn.execute(f'''SELECT regionName, dataDate, mint, maxt{extra} FROM {table}
            WHERE (? IS NULL OR regionName = ?) AND (? IS NULL OR dataDate = ?)
            AND (? IS NULL OR dataDate >= ?) AND (? IS NULL OR dataDate <= ?)
            ORDER BY dataDate, regionName''', (region, region, day, day, start, start, end, end)).fetchall()
    return [dict(row) for row in rows]


def query_metadata(db_path=DB_PATH):
    with closing(connect_readonly(db_path)) as conn:
        return dict(conn.execute('SELECT key, value FROM ForecastMetadata'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=CSV_PATH)
    parser.add_argument('--database', type=Path, default=DB_PATH)
    args = parser.parse_args()
    try:
        with args.input.open(encoding='utf-8-sig', newline='') as stream:
            rows = [{**r, 'mint': float(r['mint']), 'maxt': float(r['maxt'])} for r in csv.DictReader(stream)]
        save_forecasts(rows, args.database)
        print('SQLite 儲存成功：', len(rows), '筆')
        print('SELECT DISTINCT regionName:', query_regions(args.database))
        print('WHERE regionName = 中部地區:', query_forecasts('中部地區', args.database))
    except (OSError, ValueError, KeyError, sqlite3.Error) as error:
        parser.exit(1, f'匯入失敗：{error}\n')


if __name__ == '__main__':
    main()
