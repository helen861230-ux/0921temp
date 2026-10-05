import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import date, timedelta

from streamlit.testing.v1 import AppTest
from database import save_forecasts, save_observations, query_forecasts
from forecast_config import REGIONS, ROOT
from import_observations import import_observations


def week_rows():
    return [dict(regionName=region, dataDate=(date(2026, 10, 5) + timedelta(days=i)).isoformat(),
                 mint=10 + r + i, maxt=20 + r + i) for r, region in enumerate(REGIONS) for i in range(7)]


class HomeworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / 'test.db'

    def app(self):
        with patch.dict(os.environ, {'FORECAST_DB_PATH': str(self.db)}):
            return AppTest.from_file(str(ROOT / 'app.py'), default_timeout=30).run()

    def test_region_switch_reads_sqlite_and_displays_seven_days(self):
        save_forecasts(week_rows(), self.db, source='TEST forecast fixture')
        with patch.dict(os.environ, {'FORECAST_DB_PATH': str(self.db)}), patch('requests.get', side_effect=AssertionError('UI must not fetch CWA')):
            app = AppTest.from_file(str(ROOT / 'app.py'), default_timeout=30).run()
            self.assertFalse(app.exception)
            for region in REGIONS:
                app.sidebar.selectbox[0].select(region).run()
                self.assertFalse(app.exception)
                table = app.dataframe[0].value
                expected = query_forecasts(region, self.db)
                self.assertEqual(len(table), 7)
                self.assertEqual(table['MinT (°C)'].tolist(), [r['mint'] for r in expected])
                self.assertEqual(table['MaxT (°C)'].tolist(), [r['maxt'] for r in expected])
                self.assertEqual(len(app.get('arrow_vega_lite_chart')), 1)

    def test_observations_keep_missing_days_blank(self):
        save_observations([r for r in week_rows() if r['dataDate'] == '2026-10-05'], self.db)
        app = self.app()
        self.assertFalse(app.exception)
        self.assertEqual(len(app.dataframe[0].value), 7)
        self.assertEqual(app.dataframe[0].value['MinT (°C)'].notna().sum(), 1)
        self.assertTrue(any('1/7' in w.value for w in app.warning))
        self.assertTrue(any('不是未來預報' in i.value for i in app.info))

    def test_missing_database_is_actionable(self):
        app = self.app()
        self.assertFalse(app.exception)
        self.assertTrue(any('尚未建立' in w.value for w in app.warning))
        self.assertFalse(self.db.exists())

    def test_repeat_import_invalid_snapshot_and_injection(self):
        rows = week_rows()
        save_forecasts(rows, self.db)
        save_forecasts(rows, self.db)
        self.assertEqual(len(query_forecasts(db_path=self.db)), 42)
        self.assertEqual(query_forecasts("' OR 1=1 --", self.db), [])
        with self.assertRaises(ValueError):
            save_forecasts(rows[:-1], self.db)
        self.assertEqual(len(query_forecasts(db_path=self.db)), 42)

    def test_observation_import_skips_offshore_and_missing(self):
        source = Path(self.temp.name) / 'source.db'
        with sqlite3.connect(source) as conn:
            conn.executescript('CREATE TABLE weather_stations (station_id TEXT, county_name TEXT); CREATE TABLE weather_observations (station_id TEXT, obs_time TEXT, air_temperature REAL);')
            conn.executemany('INSERT INTO weather_stations VALUES (?,?)', [('A','臺北市'),('B','金門縣')])
            conn.executemany('INSERT INTO weather_observations VALUES (?,?,?)', [('A','2026-10-05T12:00:00+08:00',25),('A','2026-10-05T13:00:00+08:00',27),('A','2026-10-05T14:00:00+08:00',-99),('B','2026-10-05T12:00:00+08:00',28)])
        result = import_observations(source, self.db)
        self.assertEqual(result['skipped'], 2)
        row = query_forecasts('北部地區', self.db)[0]
        self.assertEqual((row['mint'],row['maxt']), (25,27))


if __name__ == '__main__':
    unittest.main()
