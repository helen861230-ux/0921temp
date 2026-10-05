import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from streamlit.testing.v1 import AppTest

from backfill_history import parse_daily, STATIONS
from database import save_station_history, query_forecasts
from forecast_config import ROOT


def sample(partial=0, low=23, high=30):
    return dict(regionName='北部地區', dataDate='2026-10-01', mint=low, maxt=high,
                stationId='466920', stationName='臺北', source='TEST CODiS', isPartial=partial)


class BackfillTests(unittest.TestCase):
    def test_daily_parser_uses_real_extremes_and_filters_dates_and_missing(self):
        data = {'code':200, 'data':[{'StationID':'466920','dts':[
            {'DataDate':'2026-09-30T00:00:00','AirTemperature':{'Minimum':20,'Maximum':30}},
            {'DataDate':'2026-10-01T00:00:00','AirTemperature':{'Minimum':23,'Maximum':31}},
            {'DataDate':'2026-10-02T00:00:00','AirTemperature':{'Minimum':-99,'Maximum':31}}]}]}
        rows = parse_daily(data,'北部地區','466920','臺北',date(2026,10,1),date(2026,10,2))
        self.assertEqual(len(rows),1)
        self.assertEqual((rows[0]['mint'],rows[0]['maxt']),(23,31))
        self.assertEqual(rows[0]['isPartial'],0)
        with self.assertRaises(ValueError):
            parse_daily(data,'北部地區','wrong','臺北',date(2026,10,1),date(2026,10,2))

    def test_complete_day_replaces_partial_and_cannot_be_downgraded(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory)/'test.db'
            save_station_history([sample(1,25,26)],db)
            save_station_history([sample(0,23,30)],db)
            save_station_history([sample(1,24,27)],db)
            rows = query_forecasts(db_path=db)
            self.assertEqual(len(rows),1)
            self.assertEqual((rows[0]['mint'],rows[0]['maxt'],rows[0]['isPartial']),(23,30,0))

    def test_history_ui_shows_all_days_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            db = Path(directory)/'test.db'
            save_station_history([sample(0),dict(sample(1),dataDate='2026-10-02')],db)
            with patch.dict(os.environ,{'FORECAST_DB_PATH':str(db)}):
                app=AppTest.from_file(str(ROOT/'app.py'),default_timeout=30).run()
                self.assertFalse(app.exception)
                self.assertEqual(app.sidebar.selectbox[1].value,'全部紀錄')
                table=app.dataframe[0].value
                self.assertEqual(len(table),2)
                self.assertEqual(table['資料狀態'].tolist(),['CODiS 日極值','當日樣本（未完整）'])


if __name__ == '__main__':
    unittest.main()
