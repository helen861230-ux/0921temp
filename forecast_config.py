"""Shared local paths and the six regions in the HW10 assignment."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW_PATH = ROOT / 'weather_data.json'
CSV_PATH = ROOT / 'weather_data.csv'
DB_PATH = ROOT / 'data.db'
REGIONS = ('北部地區', '中部地區', '南部地區', '東北部地區', '東部地區', '東南部地區')
# Representative regional points, not observation station coordinates or boundaries.
REGION_COORDINATES = {
    '北部地區': (25.03, 121.45), '中部地區': (24.15, 120.67),
    '南部地區': (22.95, 120.30), '東北部地區': (24.75, 121.75),
    '東部地區': (23.98, 121.60), '東南部地區': (22.76, 121.14),
}
