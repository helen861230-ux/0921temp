import os
import sqlite3
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from streamlit.testing.v1 import AppTest
from database import save_observations, save_forecasts, query_forecasts
from forecast_config import ROOT
from test_app import week_rows


def observation(day, low=20, high=30):
    return dict(regionName='北部地區', dataDate=day, mint=low, maxt=high)


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / 'history.db'

    def test_history_accumulates_and_repeated_day_merges_extrema(self):
        save_observations([observation('2026-09-21')], self.db)
        save_observations([observation('2026-10-05')], self.db)
        save_observations([observation('2026-10-05', 19, 31)], self.db)
        rows = query_forecasts(db_path=self.db)
        self.assertEqual(len(rows), 2)
        self.assertEqual((rows[-1]['mint'], rows[-1]['maxt']), (19, 31))
        self.assertEqual(len(query_forecasts(db_path=self.db, start='2026-10-01', end='2026-10-05')), 1)

    def test_forecast_import_does_not_delete_observation_history(self):
        save_observations([observation('2026-09-21')], self.db)
        save_forecasts(week_rows(), self.db)
        self.assertEqual(len(query_forecasts(db_path=self.db)), 42)
        save_observations([observation('2026-10-05')], self.db)
        self.assertEqual(len(query_forecasts(db_path=self.db)), 2)

    def test_legacy_observation_migration_preserves_old_date(self):
        with sqlite3.connect(self.db) as conn:
            conn.executescript('''CREATE TABLE TemperatureForecasts (
                id INTEGER PRIMARY KEY, regionName TEXT, dataDate TEXT, mint REAL, maxt REAL);
                CREATE TABLE ForecastMetadata (key TEXT PRIMARY KEY, value TEXT);
                INSERT INTO ForecastMetadata VALUES ('kind','observation');
                INSERT INTO TemperatureForecasts VALUES (1,'北部地區','2026-09-21',18,28);''')
        save_observations([observation('2026-10-05')], self.db)
        self.assertEqual(len(query_forecasts(db_path=self.db)), 2)
        # The legacy snapshot must not be mistaken for observations after switching modes.
        save_forecasts(week_rows(), self.db)
        save_observations([observation('2026-10-06')], self.db)
        self.assertEqual(len(query_forecasts(db_path=self.db)), 3)

    def test_ranges_custom_empty_and_reversed_dates(self):
        save_observations([observation('2026-09-21'), observation('2026-10-05')], self.db)
        with patch.dict(os.environ, {'FORECAST_DB_PATH': str(self.db)}):
            app = AppTest.from_file(str(ROOT/'app.py'), default_timeout=30).run()
            for label, days in [('最近 14 天',14), ('最近 30 天',30), ('全部紀錄',15)]:
                app.sidebar.selectbox[1].select(label).run()
                self.assertFalse(app.exception)
                self.assertEqual(len(app.dataframe[0].value), days)
            app.sidebar.selectbox[1].select('自訂日期').run()
            app.sidebar.date_input[0].set_value(date(2026,9,22))
            app.sidebar.date_input[1].set_value(date(2026,9,23)).run()
            self.assertFalse(app.exception)
            self.assertEqual(app.dataframe[0].value['MinT (°C)'].notna().sum(), 0)
            app.sidebar.date_input[0].set_value(date(2026,10,10)).run()
            self.assertFalse(app.exception)
            self.assertTrue(any('開始日期' in e.value for e in app.error))


if __name__ == '__main__':
    unittest.main()
