import csv
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import requests
from streamlit.testing.v1 import AppTest
from database import save_station_history
from export_weather import export_weather
from fetch_weather import fetch_weather
from forecast_config import ROOT, REGIONS


class DeliveryTests(unittest.TestCase):
    def test_date_selection_updates_six_region_table_and_csv_preserves_source(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory) / 'test.db'
            rows = [dict(regionName=region, dataDate=f'2026-10-0{day}', mint=20+day,
                         maxt=30+day, stationId=str(index), stationName='TEST',
                         source='TEST', isPartial=0)
                    for index, region in enumerate(REGIONS) for day in (1, 2)]
            save_station_history(rows, db)
            output = Path(directory) / 'weather_data.csv'
            self.assertEqual(export_weather(db, output), 12)
            with output.open(encoding='utf-8-sig') as stream:
                exported = list(csv.DictReader(stream))
            self.assertEqual({r['dataKind'] for r in exported}, {'station_history'})
            self.assertEqual({r['source'] for r in exported}, {'TEST'})
            with patch.dict(os.environ, {'FORECAST_DB_PATH': str(db)}):
                app = AppTest.from_file(str(ROOT/'app.py'), default_timeout=30).run()
                for day in (1, 2):
                    selector = next(item for item in app.selectbox if item.label == '地圖資料日期')
                    selector.select(f'2026-10-0{day}').run()
                    self.assertFalse(app.exception)
                    table = app.dataframe[-1].value
                    self.assertEqual(set(table['地區']), set(REGIONS))
                    self.assertEqual(set(table['最低溫 (°C)']), {20+day})
                    self.assertEqual(set(table['區間中點 (°C)']), {25+day})

    def test_ssl_failure_is_actionable_and_keeps_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'weather_data.json'
            output.write_text('original')
            with patch.dict(os.environ, {'CWA_API_KEY': 'TEST_ONLY'}), \
                    patch('fetch_weather.requests.get', side_effect=requests.exceptions.SSLError('secret-url')):
                with self.assertRaisesRegex(RuntimeError, 'REQUESTS_CA_BUNDLE') as error:
                    fetch_weather(output)
                self.assertNotIn('secret-url', str(error.exception))
            self.assertEqual(output.read_text(), 'original')

    def test_404_fallback_preserves_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'weather_data.json'
            output.write_text('original')
            response = requests.Response()
            response.status_code = 404
            with patch.dict(os.environ, {'CWA_API_KEY': 'TEST_ONLY'}), \
                    patch('fetch_weather.requests.get', return_value=response) as get:
                with self.assertRaisesRegex(RuntimeError, '404'):
                    fetch_weather(output)
                self.assertEqual(get.call_count, 2)
            self.assertEqual(output.read_text(), 'original')
